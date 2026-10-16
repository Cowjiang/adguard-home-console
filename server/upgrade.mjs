/**
 * AdGuard Home Console — Server Self-Upgrade Handler
 *
 * Implements:
 * - POST /api/system/upgrade (triggers asynchronous pull deployment)
 * - GET /api/system/upgrade/status (inspects upgrade state and logs)
 * - Security gate: AGH_ENABLE_SELF_UPGRADE='1'|'true' (403 Forbidden otherwise)
 * - Concurrency control: 409 Conflict if upgrade already running
 * - Process spawning and stdout/stderr log capture
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SCRIPT_FALLBACK = path.join(__dirname, '..', 'scripts', 'server-pull.sh');
export const DEFAULT_OPT_SCRIPT = '/opt/agh-console/scripts/server-pull.sh';
export const MAX_LOG_BYTES = 64 * 1024; // 64 KB

export function resolveUpgradeScript(options = {}) {
  const env = options.env || process.env;
  if (options.scriptPath) return options.scriptPath;
  if (env.AGH_UPGRADE_SCRIPT) return env.AGH_UPGRADE_SCRIPT;
  if (fs.existsSync(DEFAULT_OPT_SCRIPT)) return DEFAULT_OPT_SCRIPT;
  return DEFAULT_SCRIPT_FALLBACK;
}

export function isSelfUpgradeEnabled(env = process.env) {
  return env.AGH_ENABLE_SELF_UPGRADE === '1' || env.AGH_ENABLE_SELF_UPGRADE === 'true';
}

/**
 * Creates Express request handlers for self-upgrade and status inspection.
 *
 * @param {object} [options]
 * @param {object} [options.env]
 * @param {string} [options.scriptPath]
 * @param {Function} [options.spawn]
 * @param {() => number} [options.now]
 * @returns {{ upgradeHandler: Function, statusHandler: Function, getState: Function }}
 */
export function createUpgradeHandler(options = {}) {
  const spawnFn = options.spawn || childProcess.spawn;
  const nowFn = options.now || Date.now;

  let status = 'idle'; // 'idle' | 'running' | 'completed' | 'failed'
  let lastRun = null;
  let exitCode = null;
  let logs = '';
  let error = null;

  function isEnabled() {
    return isSelfUpgradeEnabled(options.env || process.env);
  }

  function appendLog(chunk) {
    logs += chunk.toString();
    if (logs.length > MAX_LOG_BYTES) {
      logs = logs.slice(-MAX_LOG_BYTES);
    }
  }

  async function upgradeHandler(req, res) {
    if (!isEnabled()) {
      return res.status(403).json({
        ok: false,
        error: 'Self-upgrade is disabled on this server',
      });
    }

    if (status === 'running') {
      return res.status(409).json({
        ok: false,
        error: 'Upgrade is already in progress',
      });
    }

    const scriptPath = resolveUpgradeScript(options);
    status = 'running';
    lastRun = new Date(nowFn()).toISOString();
    exitCode = null;
    logs = '';
    error = null;

    res.json({
      ok: true,
      status: 'started',
      message: 'Upgrade process spawned',
    });

    try {
      const child = spawnFn('bash', [scriptPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...(options.env || {}) },
      });

      child.stdout?.on('data', appendLog);
      child.stderr?.on('data', appendLog);

      child.on('error', (err) => {
        status = 'failed';
        error = err.message;
      });

      child.on('close', (code) => {
        exitCode = code;
        if (code === 0) {
          status = 'completed';
        } else {
          status = 'failed';
          error = error || `Upgrade script exited with code ${code}`;
        }
      });
    } catch (err) {
      status = 'failed';
      error = err.message;
    }
  }

  async function statusHandler(req, res) {
    if (!isEnabled()) {
      return res.status(403).json({
        ok: false,
        error: 'Self-upgrade is disabled on this server',
      });
    }

    return res.json({
      ok: true,
      status,
      lastRun,
      exitCode,
      logs,
      error,
    });
  }

  return {
    upgradeHandler,
    statusHandler,
    getState: () => ({ status, lastRun, exitCode, logs, error }),
  };
}
