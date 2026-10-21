#!/usr/bin/env node
/**
 * AdGuard Home Console — npm/pnpm global upgrade runner
 *
 * Invoked by server/upgrade.mjs for installations whose files live under
 * node_modules. Maps the requested channel to the npm dist-tag, installs it
 * globally, restarts the systemd unit and verifies /api/health. A failed
 * restart or health check rolls the previous version back.
 *
 * Environment:
 *   AGH_UPGRADE_CHANNEL  stable | nightly (or --channel)
 *   AGH_PACKAGE_MANAGER  npm (default) | pnpm
 *   AGH_SERVICE_NAME     systemd unit (default agh-console)
 *   AGH_HEALTH_URL       health endpoint (default http://127.0.0.1:$PORT/api/health)
 *   AGH_SKIP_RESTART=1   install only; caller restarts the service
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelFromVersion, isValidChannel, readTargetChannel } from './update-channel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_NAME = 'agh-console';
const DEFAULT_SERVICE = 'agh-console';
const HEALTH_TIMEOUT_MS = 45_000;
const HEALTH_INTERVAL_MS = 1_000;

export function channelDistTag(channel) {
  return channel === 'nightly' ? 'nightly' : 'latest';
}

export function parseChannel(options = {}) {
  const env = options.env || process.env;
  const argv = options.argv || process.argv.slice(2);
  const index = argv.indexOf('--channel');
  const fromArg = index >= 0 ? argv[index + 1] : undefined;
  const candidate = fromArg || env.AGH_UPGRADE_CHANNEL || readTargetChannel({ env }) || '';
  if (isValidChannel(candidate)) return candidate;
  return channelFromVersion(options.currentVersion || '');
}

export function packageManager(env = process.env) {
  return env.AGH_PACKAGE_MANAGER === 'pnpm' ? 'pnpm' : 'npm';
}

export function buildInstallArgs({ manager = 'npm', channel = 'stable', version, packageName = PACKAGE_NAME } = {}) {
  const target = version ? `${packageName}@${version}` : `${packageName}@${channelDistTag(channel)}`;
  if (manager === 'pnpm') {
    // pnpm 12's minimumReleaseAge would otherwise resolve a freshly published
    // nightly dist-tag to an older build that passed the age policy.
    return ['add', '-g', target, '--config.minimumReleaseAge=0'];
  }
  return ['install', '-g', target];
}

export function readInstalledVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version || '';
  } catch {
    return '';
  }
}

function run(cmd, args, options = {}) {
  const spawnFn = options.spawn || childProcess.spawnSync;
  return spawnFn(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
  });
}

export function resolveHealthUrl(env = process.env) {
  if (env.AGH_HEALTH_URL) return env.AGH_HEALTH_URL;
  const port = env.PORT || '8787';
  return `http://127.0.0.1:${port}/api/health`;
}

async function waitForHealth(url, options = {}) {
  const fetchFn = options.fetch || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? HEALTH_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? HEALTH_INTERVAL_MS;
  const nowFn = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = nowFn() + timeoutMs;
  while (nowFn() < deadline) {
    try {
      const response = await fetchFn(url, { cache: 'no-store' });
      if (response.ok) return true;
    } catch {
      // Service may still be restarting.
    }
    await sleep(intervalMs);
  }
  return false;
}

function restartService(env, options = {}) {
  const service = env.AGH_SERVICE_NAME || DEFAULT_SERVICE;
  if (env.AGH_SKIP_RESTART === '1' || env.AGH_SKIP_RESTART === 'true') {
    console.log(`[npm-upgrade] AGH_SKIP_RESTART=1, restart ${service} manually`);
    return { restarted: false, ok: true };
  }

  const systemctl = options.systemctl || 'systemctl';
  const result = run(systemctl, ['restart', service], options);
  if (result.status !== 0) {
    console.error(`[npm-upgrade] systemctl restart ${service} failed`);
    return { restarted: true, ok: false };
  }

  const active = run(systemctl, ['is-active', '--quiet', service], options);
  if (active.status !== 0) {
    console.error(`[npm-upgrade] ${service} is not active after restart`);
    return { restarted: true, ok: false };
  }
  return { restarted: true, ok: true };
}

/**
 * Runs the channel upgrade. Returns 0 on success, non-zero on failure.
 *
 * @param {object} [options]
 * @param {object} [options.env]
 * @param {string[]} [options.argv]
 * @param {Function} [options.spawn]
 * @param {Function} [options.fetch]
 * @param {boolean} [options.restart] false disables the service restart + health check
 */
export async function runNpmUpgrade(options = {}) {
  const env = options.env || process.env;
  const channel = parseChannel({ env, argv: options.argv, currentVersion: options.currentVersion });
  const manager = packageManager(env);
  const previousVersion = options.previousVersion ?? readInstalledVersion();
  const installArgs = buildInstallArgs({ manager, channel });

  console.log(`[npm-upgrade] channel=${channel} manager=${manager} target=${PACKAGE_NAME}@${channelDistTag(channel)}`);
  const install = run(manager, installArgs, options);
  if (install.status !== 0) {
    console.error('[npm-upgrade] install failed');
    return install.status ?? 1;
  }

  if (options.restart === false) {
    console.log('[npm-upgrade] restart disabled, install only');
    return 0;
  }

  const service = restartService(env, options);
  if (!service.ok && service.restarted && previousVersion) {
    console.error(`[npm-upgrade] rolling back to ${previousVersion}`);
    run(manager, buildInstallArgs({ manager, version: previousVersion }), options);
    run(options.systemctl || 'systemctl', ['restart', env.AGH_SERVICE_NAME || DEFAULT_SERVICE], options);
    return 1;
  }

  if (service.restarted && options.health !== false) {
    const healthy = await waitForHealth(resolveHealthUrl(env), options);
    if (!healthy) {
      console.error('[npm-upgrade] health check failed');
      if (previousVersion) {
        console.error(`[npm-upgrade] rolling back to ${previousVersion}`);
        run(manager, buildInstallArgs({ manager, version: previousVersion }), options);
        run(options.systemctl || 'systemctl', ['restart', env.AGH_SERVICE_NAME || DEFAULT_SERVICE], options);
      }
      return 1;
    }
  }

  console.log(`[npm-upgrade] upgraded to ${channel} (${channelDistTag(channel)})`);
  return 0;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  runNpmUpgrade({ argv: process.argv.slice(2) })
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[npm-upgrade] fatal:', err?.message || err);
      process.exit(1);
    });
}
