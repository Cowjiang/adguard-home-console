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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/** Regex for validating instanceId and snapshotId characters */
export const ID_REGEX = /^[a-zA-Z0-9_\-\.]+$/;

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
 * Resolves the data directory for managed mode.
 * Priority: options.dataDir > env.DATA_DIR > <ROOT>/data
 */
export function resolveDataDir(options = {}) {
  const env = options.env || process.env;
  if (options.dataDir) return path.resolve(options.dataDir);
  if (env.DATA_DIR) return path.resolve(env.DATA_DIR);
  return path.resolve(ROOT, 'data');
}

/**
 * Safely writes JSON data atomically by writing to a temporary file
 * in the same directory first, then renaming it to the target file.
 */
export function atomicWriteJsonSync(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const randomSuffix = Math.random().toString(36).slice(2);
  const tmpPath = `${filePath}.tmp.${Date.now()}_${randomSuffix}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // Ignore cleanup error
    }
    throw err;
  }
}

/**
 * Reads the list of managed instances from <dataDir>/instances.json.
 */
export function readInstancesList(dataDir) {
  const filePath = path.join(dataDir, 'instances.json');
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  router.get('/instances', (_req, res) => {
    const instances = readInstancesList(dataDir);
    res.json(instances);
  });

  // POST /api/managed/instances
  router.post('/instances', (req, res) => {
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

    const instances = readInstancesList(dataDir);
    const existingIndex = instances.findIndex((item) => item.id === id);

    if (existingIndex >= 0) {
      instances[existingIndex] = instanceRecord;
    } else {
      instances.push(instanceRecord);
    }

    try {
      const instancesFilePath = path.join(dataDir, 'instances.json');
      atomicWriteJsonSync(instancesFilePath, instances);
      res.status(200).json({ ok: true, instance: instanceRecord });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save instance metadata' });
    }
  });

  // DELETE /api/managed/instances/:id
  router.delete('/instances/:id', (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }

    const instances = readInstancesList(dataDir);
    const existingIndex = instances.findIndex((item) => item.id === id);
    const snapshotsDir = path.join(dataDir, 'snapshots', id);
    const dirExists = fs.existsSync(snapshotsDir);

    if (existingIndex < 0 && !dirExists) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    if (existingIndex >= 0) {
      instances.splice(existingIndex, 1);
      try {
        const instancesFilePath = path.join(dataDir, 'instances.json');
        atomicWriteJsonSync(instancesFilePath, instances);
      } catch (err) {
        return res.status(500).json({ error: 'Failed to update instances file' });
      }
    }

    if (dirExists) {
      try {
        fs.rmSync(snapshotsDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore or continue
      }
    }

    res.json({ ok: true });
  });

  // GET /api/managed/instances/:id/snapshots
  router.get('/instances/:id/snapshots', (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }

    const instances = readInstancesList(dataDir);
    const instanceExists = instances.some((item) => item.id === id);
    const snapshotsDir = path.join(dataDir, 'snapshots', id);
    const dirExists = fs.existsSync(snapshotsDir);

    if (!instanceExists && !dirExists) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    if (!dirExists) {
      return res.json([]);
    }

    try {
      const files = fs.readdirSync(snapshotsDir);
      const summaries = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(snapshotsDir, file);
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const blob = JSON.parse(raw);
          if (blob && typeof blob === 'object') {
            summaries.push({
              id: blob.id || file.replace(/\.json$/, ''),
              instanceId: blob.instanceId || id,
              createdAt: blob.createdAt || '',
              version: blob.version ?? 1,
              checksum: blob.checksum,
              kdf: blob.kdf,
              cipher: blob.cipher,
              ...(blob.metaSummary ? { metaSummary: blob.metaSummary } : {}),
            });
          }
        } catch {
          // Skip unparseable files
        }
      }

      summaries.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });

      res.json(summaries);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read snapshots directory' });
    }
  });

  // GET /api/managed/instances/:id/snapshots/:snapshotId
  router.get('/instances/:id/snapshots/:snapshotId', (req, res) => {
    const { id, snapshotId } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }
    if (!isValidId(snapshotId)) {
      return res.status(400).json({ error: 'Invalid snapshot ID' });
    }

    const filePath = path.join(dataDir, 'snapshots', id, `${snapshotId}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const blob = JSON.parse(raw);
      res.json(blob);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read snapshot file' });
    }
  });

  // PUT /api/managed/instances/:id/snapshots/:snapshotId
  router.put('/instances/:id/snapshots/:snapshotId', (req, res) => {
    const { id, snapshotId } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }
    if (!isValidId(snapshotId)) {
      return res.status(400).json({ error: 'Invalid snapshot ID' });
    }

    const blob = req.body;
    if (!blob || typeof blob !== 'object' || Array.isArray(blob)) {
      return res.status(400).json({ error: 'Invalid JSON request body' });
    }

    if (blob.id !== snapshotId || blob.instanceId !== id) {
      return res.status(400).json({ error: 'Snapshot ID or instanceId mismatch' });
    }

    const filePath = path.join(dataDir, 'snapshots', id, `${snapshotId}.json`);

    // Idempotency check: if matching checksum already exists, return 200 OK directly
    if (fs.existsSync(filePath)) {
      try {
        const existingRaw = fs.readFileSync(filePath, 'utf-8');
        const existing = JSON.parse(existingRaw);
        if (existing && existing.checksum && existing.checksum === blob.checksum) {
          return res.status(200).json({ ok: true, deduplicated: true });
        }
      } catch {
        // If file is corrupted, allow atomic overwrite
      }
    }

    try {
      atomicWriteJsonSync(filePath, blob);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to write snapshot' });
    }
  });

  // DELETE /api/managed/instances/:id/snapshots/:snapshotId
  router.delete('/instances/:id/snapshots/:snapshotId', (req, res) => {
    const { id, snapshotId } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }
    if (!isValidId(snapshotId)) {
      return res.status(400).json({ error: 'Invalid snapshot ID' });
    }

    const filePath = path.join(dataDir, 'snapshots', id, `${snapshotId}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    try {
      fs.unlinkSync(filePath);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete snapshot' });
    }
  });

  return router;
}
