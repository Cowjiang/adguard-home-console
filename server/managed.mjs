/**
 * AdGuard Home Console — Managed Mode Server Blind Storage
 *
 * Implements:
 * - GET    /api/managed/status: Health & data directory status
 * - GET    /api/managed/instances: Read managed instances metadata list
 * - POST   /api/managed/instances: Upsert instance metadata (Strict security: NO password allowed)
 * - DELETE /api/managed/instances/:id: Delete instance and its snapshots
 * - GET    /api/managed/instances/:id/snapshots: List snapshot summaries (ordered by createdAt DESC)
 * - GET    /api/managed/instances/:id/snapshots/:snapshotId: Read full encrypted snapshot blob
 * - PUT    /api/managed/instances/:id/snapshots/:snapshotId: Idempotent write encrypted snapshot blob
 * - DELETE /api/managed/instances/:id/snapshots/:snapshotId: Delete single snapshot
 */

import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/** Regex for validating instanceId and snapshotId characters */
export const ID_REGEX = /^[a-zA-Z0-9_\-\.]+$/;

/** Regex for validating Base64 ciphertext */
export const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Validates instanceId or snapshotId to prevent Path Traversal attacks.
 * Disallows '.', '..', containing '..', slashes, and non-whitelisted characters.
 */
export function isValidId(id) {
  if (typeof id !== 'string' || !id) return false;
  if (id === '.' || id === '..' || id.includes('..') || id.includes('/') || id.includes('\\')) {
    return false;
  }
  return ID_REGEX.test(id);
}

/**
 * Resolves safe path strictly within baseDir, preventing path traversal attacks.
 */
export function resolveSafePath(baseDir, ...segments) {
  const resolvedBase = path.resolve(baseDir);
  const targetPath = path.resolve(resolvedBase, ...segments);
  const normalizedBase = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
  if (!targetPath.startsWith(normalizedBase) && targetPath !== resolvedBase) {
    const err = new Error('Path traversal attempt detected');
    err.code = 'ERR_PATH_TRAVERSAL';
    throw err;
  }
  return targetPath;
}

/**
 * Checks if a path exists asynchronously using fs.access.
 */
export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * In-process asynchronous mutex map.
 */
const activeLocks = new Map();

/**
 * Lightweight in-process asynchronous mutex.
 * Guarantees FIFO serial execution of tasks sharing the same lockKey.
 */
export function withLock(lockKey, task) {
  const prev = activeLocks.get(lockKey) || Promise.resolve();
  const result = prev.catch(() => {}).then(() => task());
  const tail = result.catch(() => {});
  activeLocks.set(lockKey, tail);
  tail.finally(() => {
    if (activeLocks.get(lockKey) === tail) {
      activeLocks.delete(lockKey);
    }
  });
  return result;
}

/**
 * Resolves the data directory for managed mode.
 * Priority: options.dataDir > env.AGH_DATA_DIR > env.DATA_DIR > <ROOT>/data
 */
export function resolveDataDir(options = {}) {
  const env = options.env || process.env;
  if (options.dataDir) return path.resolve(options.dataDir);
  if (env.AGH_DATA_DIR) return path.resolve(env.AGH_DATA_DIR);
  if (env.DATA_DIR) return path.resolve(env.DATA_DIR);
  return path.resolve(ROOT, 'data');
}

/**
 * Safely writes JSON data atomically by writing to a temporary file
 * in the same directory first, then renaming it to the target file.
 */
export async function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const randomSuffix = Math.random().toString(36).slice(2);
  const tmpPath = `${filePath}.tmp.${Date.now()}_${randomSuffix}`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup error
    }
    throw err;
  }
}

/**
 * Reads the list of managed instances from <dataDir>/instances.json.
 */
export async function readInstancesList(dataDir) {
  const filePath = path.join(dataDir, 'instances.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Extracts lightweight snapshot summary from a full encrypted snapshot blob.
 */
export function extractSnapshotSummary(blob, fallbackId = '', fallbackInstanceId = '') {
  const summary = {
    id: blob.id || fallbackId,
    instanceId: blob.instanceId || fallbackInstanceId,
    createdAt: blob.createdAt || '',
    version: blob.version ?? 1,
    kdf: blob.kdf,
    cipher: blob.cipher,
  };
  if (blob.metaSummary) {
    summary.metaSummary = blob.metaSummary;
  }
  if (blob.updatedAt) {
    summary.updatedAt = blob.updatedAt;
  }
  return summary;
}

/**
 * Sorts snapshot summaries descending by createdAt.
 */
export function sortSnapshotSummaries(summaries) {
  return [...summaries].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

/**
 * Reads snapshots index file if available.
 */
export async function readSnapshotsIndex(snapshotsDir) {
  const indexPath = path.join(snapshotsDir, 'snapshots_index.json');
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Missing or invalid
  }
  return null;
}

/**
 * Rebuilds snapshots_index.json by scanning all snapshot json files in the directory.
 */
export async function rebuildSnapshotsIndex(snapshotsDir, instanceId) {
  let entries = [];
  try {
    entries = await fs.readdir(snapshotsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const summaries = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'snapshots_index.json') {
      continue;
    }
    const filePath = path.join(snapshotsDir, entry.name);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const blob = JSON.parse(raw);
      if (blob && typeof blob === 'object') {
        summaries.push(extractSnapshotSummary(blob, entry.name.replace(/\.json$/, ''), instanceId));
      }
    } catch {
      // Skip unparseable files
    }
  }

  const sorted = sortSnapshotSummaries(summaries);
  const indexPath = path.join(snapshotsDir, 'snapshots_index.json');
  try {
    await atomicWriteJson(indexPath, sorted);
  } catch {
    // Return sorted even if writing index fails
  }
  return sorted;
}

/**
 * Creates Express router for managed mode endpoints.
 */
export function createManagedHandler(options = {}) {
  const dataDir = resolveDataDir(options);
  const router = express.Router();
  router.use(express.json({ limit: '4mb' }));

  // GET /api/managed/status
  router.get('/status', (_req, res) => {
    res.json({
      ok: true,
      managed: true,
      dataDir,
    });
  });

  // GET /api/managed/instances
  router.get('/instances', async (_req, res) => {
    try {
      const instances = await readInstancesList(dataDir);
      res.json(instances);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read instances list' });
    }
  });

  // POST /api/managed/instances
  router.post('/instances', async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Invalid JSON request body' });
    }

    // Security redline: Password must never be sent to the managed console server
    if ('password' in body) {
      return res.status(400).json({
        error: 'Password must never be sent to the managed console server',
      });
    }

    const { id, label, url, username, salt } = body;
    if (!id || !label || !url || !username || !salt) {
      return res.status(400).json({
        error: 'Missing required instance fields: id, label, url, username, salt',
      });
    }

    if (
      typeof id !== 'string' ||
      typeof label !== 'string' ||
      typeof url !== 'string' ||
      typeof username !== 'string' ||
      typeof salt !== 'string'
    ) {
      return res.status(400).json({
        error: 'Instance fields id, label, url, username, salt must be strings',
      });
    }

    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid instance ID format' });
    }

    const updatedAt =
      typeof body.updatedAt === 'string' && body.updatedAt.trim()
        ? body.updatedAt
        : new Date().toISOString();

    const instanceRecord = {
      id,
      label,
      url,
      username,
      salt,
      updatedAt,
    };

    const instancesLockKey = path.join(dataDir, 'instances.json');
    try {
      await withLock(instancesLockKey, async () => {
        const instances = await readInstancesList(dataDir);
        const existingIndex = instances.findIndex((item) => item.id === id);

        if (existingIndex >= 0) {
          instances[existingIndex] = instanceRecord;
        } else {
          instances.push(instanceRecord);
        }

        const instancesFilePath = path.join(dataDir, 'instances.json');
        await atomicWriteJson(instancesFilePath, instances);
      });
      res.status(200).json({ ok: true, instance: instanceRecord });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save instance metadata' });
    }
  });

  // DELETE /api/managed/instances/:id
  router.delete('/instances/:id', async (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }

    let snapshotsDir;
    try {
      snapshotsDir = resolveSafePath(dataDir, 'snapshots', id);
    } catch {
      return res.status(400).json({ error: 'Invalid instance ID format' });
    }

    const instancesLockKey = path.join(dataDir, 'instances.json');
    try {
      const result = await withLock(instancesLockKey, async () => {
        const instances = await readInstancesList(dataDir);
        const existingIndex = instances.findIndex((item) => item.id === id);
        const dirExists = await pathExists(snapshotsDir);

        if (existingIndex < 0 && !dirExists) {
          return { status: 404, body: { error: 'Instance not found' } };
        }

        if (existingIndex >= 0) {
          instances.splice(existingIndex, 1);
          const instancesFilePath = path.join(dataDir, 'instances.json');
          await atomicWriteJson(instancesFilePath, instances);
        }

        if (dirExists) {
          await withLock(`snapshots:${id}`, async () => {
            try {
              await fs.rm(snapshotsDir, { recursive: true, force: true });
            } catch {
              // Ignore cleanup error
            }
          });
        }

        return { status: 200, body: { ok: true } };
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete instance' });
    }
  });

  // GET /api/managed/instances/:id/snapshots
  router.get('/instances/:id/snapshots', async (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }

    let snapshotsDir;
    try {
      snapshotsDir = resolveSafePath(dataDir, 'snapshots', id);
    } catch {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }

    try {
      const instances = await readInstancesList(dataDir);
      const instanceExists = instances.some((item) => item.id === id);
      const dirExists = await pathExists(snapshotsDir);

      if (!instanceExists && !dirExists) {
        return res.status(404).json({ error: 'Instance not found' });
      }

      if (!dirExists) {
        return res.json([]);
      }

      // Fast-path: O(1) read from snapshots_index.json
      const index = await readSnapshotsIndex(snapshotsDir);
      if (index !== null) {
        return res.json(index);
      }

      // Fallback: smooth index reconstruction under lock
      const recovered = await withLock(`snapshots:${id}`, async () => {
        const freshIndex = await readSnapshotsIndex(snapshotsDir);
        if (freshIndex !== null) return freshIndex;
        return await rebuildSnapshotsIndex(snapshotsDir, id);
      });
      res.json(recovered);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read snapshots directory' });
    }
  });

  // GET /api/managed/instances/:id/snapshots/:snapshotId
  router.get('/instances/:id/snapshots/:snapshotId', async (req, res) => {
    const { id, snapshotId } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }
    if (!isValidId(snapshotId)) {
      return res.status(400).json({ error: 'Invalid snapshot ID' });
    }

    let filePath;
    try {
      filePath = resolveSafePath(dataDir, 'snapshots', id, `${snapshotId}.json`);
    } catch {
      return res.status(400).json({ error: 'Invalid snapshot ID' });
    }

    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const blob = JSON.parse(raw);
      res.json(blob);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Snapshot not found' });
      }
      res.status(500).json({ error: 'Failed to read snapshot file' });
    }
  });

  // PUT /api/managed/instances/:id/snapshots/:snapshotId
  router.put('/instances/:id/snapshots/:snapshotId', async (req, res) => {
    const { id, snapshotId } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }
    if (!isValidId(snapshotId)) {
      return res.status(400).json({ error: 'Invalid snapshot ID' });
    }

    let snapshotsDir;
    let filePath;
    try {
      snapshotsDir = resolveSafePath(dataDir, 'snapshots', id);
      filePath = resolveSafePath(snapshotsDir, `${snapshotId}.json`);
    } catch {
      return res.status(400).json({ error: 'Invalid path: path traversal detected' });
    }

    const blob = req.body;
    if (!blob || typeof blob !== 'object' || Array.isArray(blob)) {
      return res.status(400).json({ error: 'Invalid JSON request body' });
    }

    if (blob.id !== snapshotId || blob.instanceId !== id) {
      return res.status(400).json({ error: 'Snapshot ID or instanceId mismatch' });
    }

    // Contract validation: blob.ciphertext must be a non-empty Base64 string
    if (
      typeof blob.ciphertext !== 'string' ||
      !blob.ciphertext.trim() ||
      !BASE64_REGEX.test(blob.ciphertext)
    ) {
      return res.status(400).json({
        error: 'Invalid or missing ciphertext: must be a non-empty Base64 string',
      });
    }

    // Contract validation: blob.kdf must contain valid salt and positive integer iterations
    if (
      !blob.kdf ||
      typeof blob.kdf !== 'object' ||
      typeof blob.kdf.salt !== 'string' ||
      !blob.kdf.salt.trim() ||
      typeof blob.kdf.iterations !== 'number' ||
      !Number.isInteger(blob.kdf.iterations) ||
      blob.kdf.iterations <= 0
    ) {
      return res.status(400).json({
        error: 'Invalid or missing kdf: must include valid salt string and positive integer iterations',
      });
    }

    // Contract validation: blob.cipher must contain valid iv and positive integer tagLength
    if (
      !blob.cipher ||
      typeof blob.cipher !== 'object' ||
      typeof blob.cipher.iv !== 'string' ||
      !blob.cipher.iv.trim() ||
      typeof blob.cipher.tagLength !== 'number' ||
      !Number.isInteger(blob.cipher.tagLength) ||
      blob.cipher.tagLength <= 0
    ) {
      return res.status(400).json({
        error: 'Invalid or missing cipher: must include valid iv string and positive integer tagLength',
      });
    }

    try {
      const response = await withLock(`snapshots:${id}`, async () => {
        // Idempotency check: if matching ciphertext (or legacy checksum) already exists
        let isDeduplicated = false;
        try {
          const existingRaw = await fs.readFile(filePath, 'utf-8');
          const existing = JSON.parse(existingRaw);
          if (
            existing &&
            ((existing.ciphertext && existing.ciphertext === blob.ciphertext) ||
              (existing.checksum && existing.checksum === blob.checksum))
          ) {
            isDeduplicated = true;
          }
        } catch {
          // File does not exist or corrupted, proceed to write
        }

        if (!isDeduplicated) {
          await atomicWriteJson(filePath, blob);
        }

        // Maintain snapshots_index.json
        const index = await readSnapshotsIndex(snapshotsDir);
        if (index === null) {
          await rebuildSnapshotsIndex(snapshotsDir, id);
        } else {
          const summary = extractSnapshotSummary(blob, snapshotId, id);
          const existingIdx = index.findIndex((item) => item.id === snapshotId);
          if (existingIdx >= 0) {
            index[existingIdx] = summary;
          } else {
            index.push(summary);
          }
          const sorted = sortSnapshotSummaries(index);
          const indexPath = path.join(snapshotsDir, 'snapshots_index.json');
          await atomicWriteJson(indexPath, sorted);
        }

        return isDeduplicated
          ? { status: 200, body: { ok: true, deduplicated: true } }
          : { status: 200, body: { ok: true } };
      });

      res.status(response.status).json(response.body);
    } catch (err) {
      res.status(500).json({ error: 'Failed to write snapshot' });
    }
  });

  // DELETE /api/managed/instances/:id/snapshots/:snapshotId
  router.delete('/instances/:id/snapshots/:snapshotId', async (req, res) => {
    const { id, snapshotId } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }
    if (!isValidId(snapshotId)) {
      return res.status(400).json({ error: 'Invalid snapshot ID' });
    }

    let snapshotsDir;
    let filePath;
    try {
      snapshotsDir = resolveSafePath(dataDir, 'snapshots', id);
      filePath = resolveSafePath(snapshotsDir, `${snapshotId}.json`);
    } catch {
      return res.status(400).json({ error: 'Invalid snapshot ID' });
    }

    try {
      const response = await withLock(`snapshots:${id}`, async () => {
        if (!(await pathExists(filePath))) {
          return { status: 404, body: { error: 'Snapshot not found' } };
        }

        await fs.unlink(filePath);

        // Update snapshots_index.json
        const index = await readSnapshotsIndex(snapshotsDir);
        if (index !== null) {
          const filtered = index.filter((item) => item.id !== snapshotId);
          const indexPath = path.join(snapshotsDir, 'snapshots_index.json');
          await atomicWriteJson(indexPath, filtered);
        }

        return { status: 200, body: { ok: true } };
      });

      res.status(response.status).json(response.body);
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete snapshot' });
    }
  });

  return router;
}
