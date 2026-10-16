/**
 * AdGuard Home Console — Version Check and Runtime Detection
 *
 * Implements GET /api/system/version with:
 * - Runtime environment detection (docker, systemd, npm, standalone)
 * - Remote version.json manifest check with 12h in-memory caching
 * - ?force=1 cache bypass
 * - 5-second fetch timeout with AbortSignal.timeout(5000)
 * - Graceful degradation on offline or network failure
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_PATH = path.join(__dirname, '..', 'package.json');

export const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours = 43200000 ms
export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_UPDATE_URL = 'https://raw.githubusercontent.com/Cowjiang/adguard-home-console/refs/heads/main/version.json';
export const DEFAULT_RELEASE_LATEST_URL = 'https://github.com/Cowjiang/adguard-home-console/releases/latest/download/version.json';
export const DEFAULT_RELEASE_NIGHTLY_URL = 'https://github.com/Cowjiang/adguard-home-console/releases/download/nightly/version.json';

let cachedPackageVersion = null;

export function getPackageVersion() {
  if (cachedPackageVersion) return cachedPackageVersion;
  try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
    cachedPackageVersion = pkg.version || '0.0.0';
  } catch {
    cachedPackageVersion = '0.0.0';
  }
  return cachedPackageVersion;
}

/**
 * Detects the host runtime environment:
 * - 'docker': env AGH_RUNTIME === 'docker' or /.dockerenv exists
 * - 'systemd': env INVOCATION_ID exists
 * - 'npm': env npm_package_name exists or execution path indicates npm/npx
 * - 'standalone': default fallback
 */
export function detectRuntime(env = process.env, fsModule = fs) {
  if (env.AGH_RUNTIME) return env.AGH_RUNTIME;

  try {
    if (fsModule && typeof fsModule.existsSync === 'function' && fsModule.existsSync('/.dockerenv')) {
      return 'docker';
    }
  } catch {
    // Ignore fs errors
  }

  if (env.INVOCATION_ID) {
    return 'systemd';
  }

  if (
    env.npm_package_name ||
    env.npm_config_user_agent ||
    (env._ && /[\/\\](?:npx|npm)$/.test(env._)) ||
    (process.argv[1] && /[\/\\](?:\.npm|node_modules[\\\/]\.bin)[\\\/]agh-console/.test(process.argv[1]))
  ) {
    return 'npm';
  }

  return 'standalone';
}

export function parseSemver(v) {
  if (typeof v !== 'string') return null;
  const match = v.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : null,
  };
}

export function compareVersions(v1, v2) {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);
  if (!p1 || !p2) {
    return String(v1).localeCompare(String(v2));
  }
  if (p1.major !== p2.major) return p1.major - p2.major;
  if (p1.minor !== p2.minor) return p1.minor - p2.minor;
  if (p1.patch !== p2.patch) return p1.patch - p2.patch;

  // Prerelease comparison:
  // A version with prerelease has lower precedence than a version without prerelease.
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && !p2.prerelease) return -1;
  if (!p1.prerelease && !p2.prerelease) return 0;

  // Both have prereleases: compare each segment
  const len = Math.max(p1.prerelease.length, p2.prerelease.length);
  for (let i = 0; i < len; i++) {
    const s1 = p1.prerelease[i];
    const s2 = p2.prerelease[i];
    if (s1 === undefined) return -1;
    if (s2 === undefined) return 1;
    if (s1 === s2) continue;

    const num1 = /^\d+$/.test(s1) ? Number(s1) : null;
    const num2 = /^\d+$/.test(s2) ? Number(s2) : null;

    if (num1 !== null && num2 !== null) {
      return num1 - num2;
    }
    if (num1 !== null && num2 === null) {
      return -1;
    }
    if (num1 === null && num2 !== null) {
      return 1;
    }
    return s1.localeCompare(s2);
  }
  return 0;
}

export function isNewerVersion(currentVersion, latestVersion) {
  return compareVersions(latestVersion, currentVersion) > 0;
}

export function resolveUpdateUrl(options = {}, channel = 'stable') {
  if (options.updateUrl) return options.updateUrl;
  if (process.env.AGH_UPDATE_URL) return process.env.AGH_UPDATE_URL;
  if (channel === 'nightly') {
    return DEFAULT_RELEASE_NIGHTLY_URL;
  }
  return DEFAULT_RELEASE_LATEST_URL;
}

/**
 * Creates Express request handler for GET /api/system/version
 */
export function createVersionHandler(options = {}) {
  const cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const nowFn = options.now ?? Date.now;
  const detectRuntimeFn = options.detectRuntime ?? detectRuntime;

  let cache = { manifest: null, cachedAt: 0 };

  return async function versionHandler(req, res) {
    const currentVersion = options.currentVersion || process.env.APP_VERSION || getPackageVersion();
    const channel = options.channel || (currentVersion.includes('nightly') ? 'nightly' : 'stable');
    const runtime = detectRuntimeFn(process.env, fs);
    const updateUrl = resolveUpdateUrl(options, channel);

    const isForce = req?.query?.force === '1' || req?.query?.force === 'true';
    const isCacheValid = !isForce && cache.manifest && (nowFn() - cache.cachedAt < cacheTtlMs);

    if (isCacheValid) {
      const hasUpdate = isNewerVersion(currentVersion, cache.manifest.version);
      return res.json({
        ok: true,
        currentVersion,
        channel,
        runtime,
        hasUpdate,
        latest: cache.manifest,
      });
    }

    try {
      const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
      const response = await fetchFn(updateUrl, { signal });
      if (!response.ok) {
        throw new Error(`Upstream returned HTTP ${response.status}`);
      }
      const manifest = await response.json();
      if (!manifest || typeof manifest !== 'object' || !manifest.version) {
        throw new Error('Invalid manifest received from upstream');
      }

      cache = { manifest, cachedAt: nowFn() };
      const hasUpdate = isNewerVersion(currentVersion, manifest.version);
      return res.json({
        ok: true,
        currentVersion,
        channel,
        runtime,
        hasUpdate,
        latest: manifest,
      });
    } catch (err) {
      return res.json({
        ok: true,
        currentVersion,
        channel,
        runtime,
        checkFailed: true,
        error: err.message,
      });
    }
  };
}
