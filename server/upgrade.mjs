/**
 * AdGuard Home Console — Server Self-Upgrade Handler
 *
 * Implements:
 * - POST /api/system/upgrade with an optional { channel } body
 * - GET /api/system/upgrade/status (state file + live child state)
 * - Security gate: AGH_ENABLE_SELF_UPGRADE='1'|'true' (403 Forbidden otherwise)
 * - Concurrency control: 409 Conflict if an upgrade is already running
 * - Channel persistence and AGH_UPGRADE_CHANNEL injection for the updater
 * - Deployment-aware updater selection: tarball script, npm/pnpm script, or custom script
 * - systemd detachment through systemd-run so restart + rollback survive the service stop
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  channelFromVersion,
  isValidChannel,
  readTargetChannel,
  resolveStateDir,
  writeTargetChannel,
} from './update-channel.mjs';
import { getPackageVersion } from './version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SCRIPT_FALLBACK = path.join(__dirname, '..', 'scripts', 'server-pull.sh');
export const DEFAULT_OPT_SCRIPT = '/opt/agh-console/scripts/server-pull.sh';
export const NPM_UPGRADE_SCRIPT = path.join(__dirname, 'npm-upgrade.mjs');
export const MAX_LOG_BYTES = 64 * 1024; // 64 KB
export const STATUS_FILE = 'upgrade-status.json';
export const RUNNER_FILE = '.upgrade-runner.sh';
export const LOG_FILE = 'upgrade.log';

const RUNNER_SOURCE = `#!/bin/bash
status_file="$1"
log_file="$2"
shift 2
tmp="\u0024{status_file}.tmp"
channel="\u0024{AGH_UPGRADE_CHANNEL:-stable}"
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
write_status() {
  printf '{"status":"%s","channel":"%s","exitCode":%s,"updatedAt":"%s"}\n' "$1" "$channel" "$2" "$(now)" > "$tmp" && mv "$tmp" "$status_file"
}
mkdir -p "$(dirname "$status_file")" 2>/dev/null || true
write_status running null
"$@" >> "$log_file" 2>&1
code=$?
if [ "$code" -eq 0 ]; then write_status completed "$code"; else write_status failed "$code"; fi
exit "$code"
`;

export function isSelfUpgradeEnabled(env = process.env) {
  return env.AGH_ENABLE_SELF_UPGRADE === '1' || env.AGH_ENABLE_SELF_UPGRADE === 'true';
}

export function detectDeployment(options = {}) {
  const env = options.env || process.env;
  const fsModule = options.fs || fs;
  const explicit = env.AGH_DEPLOYMENT;
  if (explicit === 'tarball' || explicit === 'npm' || explicit === 'docker') return explicit;
  if (env.AGH_RUNTIME === 'docker') return 'docker';
  try {
    if (fsModule.existsSync('/.dockerenv')) return 'docker';
  } catch {
    // Ignore fs errors
  }
  if (env.AGH_RUNTIME === 'npm') return 'npm';
  const root = path.join(__dirname, '..');
  if (root.split(path.sep).includes('node_modules')) return 'npm';
  return 'tarball';
}

export function resolveUpgradeScript(options = {}) {
  const env = options.env || process.env;
  const fsModule = options.fs || fs;
  if (options.scriptPath) return options.scriptPath;
  if (env.AGH_UPGRADE_SCRIPT) return env.AGH_UPGRADE_SCRIPT;
  const deployment = options.deployment || detectDeployment({ env, fs: fsModule });
  if (deployment === 'docker') return null;
  if (deployment === 'npm') return NPM_UPGRADE_SCRIPT;
  if (fsModule.existsSync(DEFAULT_OPT_SCRIPT)) return DEFAULT_OPT_SCRIPT;
  return DEFAULT_SCRIPT_FALLBACK;
}

function findSystemdRun(fsModule = fs) {
  for (const candidate of ['/usr/bin/systemd-run', '/bin/systemd-run']) {
    try {
      if (fsModule.existsSync(candidate)) return candidate;
    } catch {
      // Ignore fs errors
    }
  }
  return null;
}

export function shouldDetachUpgrade(options = {}) {
  const env = options.env || process.env;
  const fsModule = options.fs || fs;
  if (options.detach === false) return false;
  if (options.detach === true) return true;
  if (env.AGH_UPGRADE_DETACH === '1' || env.AGH_UPGRADE_DETACH === 'true') return true;
  if (env.AGH_UPGRADE_DETACH === '0' || env.AGH_UPGRADE_DETACH === 'false') return false;
  if (!env.INVOCATION_ID) return false;
  return Boolean(findSystemdRun(fsModule));
}

export function readUpgradeStatus(stateDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(stateDir, STATUS_FILE), 'utf8'));
  } catch {
    return null;
  }
}

export function readUpgradeLog(stateDir) {
  try {
    const raw = fs.readFileSync(path.join(stateDir, LOG_FILE), 'utf8');
    return raw.slice(-MAX_LOG_BYTES);
  } catch {
    return '';
  }
}

function writeStatusFile(stateDir, payload) {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    const file = path.join(stateDir, STATUS_FILE);
    const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, `${JSON.stringify(payload)}\n`, 'utf8');
    fs.renameSync(tmp, file);
  } catch {
    // Status reporting is best effort; the upgrade itself must still run.
  }
}

function ensureRunnerScript(stateDir) {
  fs.mkdirSync(stateDir, { recursive: true });
  const runner = path.join(stateDir, RUNNER_FILE);
  const tmp = `${runner}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, RUNNER_SOURCE, { mode: 0o755 });
  fs.renameSync(tmp, runner);
  return runner;
}

/**
 * Builds the process invocation for the selected deployment.
 * The runner wrapper writes <stateDir>/upgrade-status.json and upgrade.log so a
 * detached (systemd-run) update still reports its final state after a restart.
 */
export function createUpgradePlan({ deployment, scriptPath, channel, stateDir, env = process.env, detach = false } = {}) {
  const command =
    deployment === 'npm'
      ? { cmd: process.execPath, args: [scriptPath] }
      : { cmd: 'bash', args: [scriptPath] };
  const runner = ensureRunnerScript(stateDir);
  const statusFile = path.join(stateDir, STATUS_FILE);
  const logFile = path.join(stateDir, LOG_FILE);
  const childEnv = { ...env, AGH_UPGRADE_CHANNEL: channel, AGH_STATE_DIR: stateDir };
  const runnerArgs = [runner, statusFile, logFile, command.cmd, ...command.args];

  if (!detach) {
    return { cmd: 'bash', args: runnerArgs, env: childEnv, detached: false, statusFile, logFile };
  }

  const systemdRun = findSystemdRun();
  if (!systemdRun) {
    return { cmd: 'bash', args: runnerArgs, env: childEnv, detached: false, statusFile, logFile };
  }

  const setenv = Object.entries(childEnv)
    .filter(([key]) => /^(AGH_|PNPM_|NPM_|PORT$|HOME$|PATH$|XDG_)/.test(key))
    .flatMap(([key, value]) => [`--setenv=${key}=${value}`]);
  const unit = `agh-console-upgrade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    cmd: systemdRun,
    args: ['--collect', '--no-block', `--unit=${unit}`, ...setenv, '--', 'bash', ...runnerArgs],
    env: childEnv,
    detached: true,
    statusFile,
    logFile,
  };
}

/**
 * Creates Express request handlers for self-upgrade and status inspection.
 *
 * @param {object} [options]
 * @param {object} [options.env]
 * @param {string} [options.scriptPath]
 * @param {Function} [options.spawn]
 * @param {() => number} [options.now]
 * @param {string} [options.stateDir]
 * @param {'tarball'|'npm'|'docker'} [options.deployment]
 * @param {boolean} [options.detach]
 */
export function createUpgradeHandler(options = {}) {
  const spawnFn = options.spawn || childProcess.spawn;
  const nowFn = options.now || Date.now;
  const env = options.env || process.env;
  const stateDir = options.stateDir ?? resolveStateDir({ env });
  const readChannel = options.readTargetChannel ?? (() => readTargetChannel({ stateDir }));
  const persistChannel = options.writeTargetChannel ?? ((channel) => writeTargetChannel(channel, { stateDir }));
  const deployment = options.deployment ?? detectDeployment({ env });
  const currentVersion = options.currentVersion || env.APP_VERSION || getPackageVersion();

  let status = 'idle'; // 'idle' | 'running' | 'completed' | 'failed'
  let lastRun = null;
  let exitCode = null;
  let logs = '';
  let error = null;
  let channel = null;
  let detached = false;

  function isEnabled() {
    return isSelfUpgradeEnabled(env);
  }

  function appendLog(chunk) {
    logs += chunk.toString();
    if (logs.length > MAX_LOG_BYTES) {
      logs = logs.slice(-MAX_LOG_BYTES);
    }
  }

  function applyRunnerStatus(file) {
    if (!file || !file.status) return;
    status = file.status;
    lastRun = file.updatedAt || lastRun;
    exitCode = file.exitCode ?? exitCode;
    channel = file.channel || channel;
    logs = readUpgradeLog(stateDir) || logs;
    if (status === 'failed') {
      error = error || `Upgrade exited with code ${file.exitCode ?? 'unknown'}`;
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

    const requested = req?.body?.channel;
    if (requested !== undefined && !isValidChannel(requested)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid update channel '${requested}'`,
      });
    }

    const targetChannel =
      requested ||
      readChannel() ||
      (isValidChannel(env.AGH_UPDATE_CHANNEL) ? env.AGH_UPDATE_CHANNEL : channelFromVersion(currentVersion));

    try {
      persistChannel(targetChannel);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: `Failed to persist update channel: ${err.message}`,
      });
    }

    if (deployment === 'docker') {
      return res.status(400).json({
        ok: false,
        error: 'Self-upgrade is not supported for Docker deployments',
      });
    }

    const scriptPath = resolveUpgradeScript({ ...options, env, deployment });
    if (!scriptPath) {
      return res.status(500).json({
        ok: false,
        error: 'No upgrade script is available for this deployment',
      });
    }

    const detach = shouldDetachUpgrade({ ...options, env });
    let plan;
    try {
      plan = createUpgradePlan({ deployment, scriptPath, channel: targetChannel, stateDir, env, detach });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: `Upgrade could not be prepared: ${err.message}`,
      });
    }

    status = 'running';
    lastRun = new Date(nowFn()).toISOString();
    exitCode = null;
    logs = '';
    error = null;
    channel = targetChannel;
    detached = plan.detached;
    writeStatusFile(stateDir, {
      status: 'running',
      channel: targetChannel,
      exitCode: null,
      updatedAt: lastRun,
      detached,
    });

    res.json({
      ok: true,
      status: 'started',
      message: 'Upgrade process spawned',
      channel: targetChannel,
      detached,
    });

    try {
      const child = spawnFn(plan.cmd, plan.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: plan.env,
      });

      child.stdout?.on('data', appendLog);
      child.stderr?.on('data', appendLog);

      child.on('error', (err) => {
        status = 'failed';
        error = err.message;
        writeStatusFile(stateDir, {
          status: 'failed',
          channel: targetChannel,
          exitCode,
          updatedAt: new Date(nowFn()).toISOString(),
          detached,
        });
      });

      child.on('close', (code) => {
        exitCode = code;
        if (plan.detached && code === 0) {
          // The transient unit keeps running after this launcher exits; the
          // status file it writes is the authority from here on.
          return;
        }
        if (code === 0) {
          status = 'completed';
          if (!plan.detached) {
            writeStatusFile(stateDir, {
              status: 'completed',
              channel: targetChannel,
              exitCode: code,
              updatedAt: new Date(nowFn()).toISOString(),
              detached: false,
            });
          }
        } else {
          status = 'failed';
          error = error || `Upgrade script exited with code ${code}`;
          writeStatusFile(stateDir, {
            status: 'failed',
            channel: targetChannel,
            exitCode: code,
            updatedAt: new Date(nowFn()).toISOString(),
            detached,
          });
        }
      });
    } catch (err) {
      status = 'failed';
      error = err.message;
      writeStatusFile(stateDir, {
        status: 'failed',
        channel: targetChannel,
        exitCode,
        updatedAt: new Date(nowFn()).toISOString(),
        detached,
      });
    }
  }

  async function statusHandler(req, res) {
    if (!isEnabled()) {
      return res.status(403).json({
        ok: false,
        error: 'Self-upgrade is disabled on this server',
      });
    }

    const file = readUpgradeStatus(stateDir);
    if (file && (detached || status === 'idle' || status === 'completed' || status === 'failed')) {
      applyRunnerStatus(file);
    }

    return res.json({
      ok: true,
      status,
      lastRun,
      exitCode,
      logs,
      error,
      channel,
      detached,
    });
  }

  return {
    upgradeHandler,
    statusHandler,
    getState: () => ({ status, lastRun, exitCode, logs, error, channel, detached }),
  };
}
