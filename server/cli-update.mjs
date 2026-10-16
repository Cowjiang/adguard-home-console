/**
 * AdGuard Home Console — CLI Startup Update Notifier
 *
 * Checks for updates on CLI startup with:
 * - Non-blocking asynchronous execution
 * - TTY & CI & suppression checks (NO_UPDATE_NOTIFIER / AGH_NO_UPDATE_NOTIFIER)
 * - 24-hour local file caching in os.tmpdir()
 * - Lightweight Unicode / ASCII bordered banner
 * - Graceful degradation without throwing
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getPackageVersion,
  isNewerVersion,
  resolveUpdateUrl,
} from './version.mjs';

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_CACHE_FILE = path.join(os.tmpdir(), 'agh-console-update-cache.json');
export const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Draws a lightweight border around lines of text.
 *
 * @param {string[]|string} lines
 * @param {object} [options]
 * @param {boolean} [options.ascii=false]
 * @param {number} [options.padding=2]
 * @returns {string}
 */
export function formatBox(lines, options = {}) {
  const lineArray = Array.isArray(lines) ? lines : String(lines).split('\n');
  const ascii = Boolean(options.ascii);
  const paddingX = options.padding ?? 2;

  const maxLen = Math.max(0, ...lineArray.map((l) => l.length));
  const innerWidth = maxLen + paddingX * 2;

  const chars = ascii
    ? { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' }
    : { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' };

  const pad = ' '.repeat(paddingX);
  const top = chars.tl + chars.h.repeat(innerWidth) + chars.tr;
  const bottom = chars.bl + chars.h.repeat(innerWidth) + chars.br;
  const body = lineArray
    .map((line) => {
      const trailingSpace = ' '.repeat(maxLen - line.length);
      return `${chars.v}${pad}${line}${trailingSpace}${pad}${chars.v}`;
    })
    .join('\n');

  return `${top}\n${body}\n${bottom}`;
}

/**
 * Reads cached update info from disk.
 *
 * @param {string} [cacheFile]
 * @param {() => number} [nowFn]
 * @returns {{ lastChecked: number, latestVersion: string } | null}
 */
export function readUpdateCache(cacheFile = DEFAULT_CACHE_FILE, nowFn = Date.now) {
  try {
    if (!fs.existsSync(cacheFile)) return null;
    const content = fs.readFileSync(cacheFile, 'utf8');
    const data = JSON.parse(content);
    if (!data || typeof data !== 'object') return null;
    if (typeof data.lastChecked !== 'number' || typeof data.latestVersion !== 'string') {
      return null;
    }
    if (nowFn() - data.lastChecked > CACHE_TTL_MS) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Writes cached update info to disk.
 *
 * @param {string} [cacheFile]
 * @param {{ lastChecked: number, latestVersion: string }} data
 */
export function writeUpdateCache(cacheFile = DEFAULT_CACHE_FILE, data) {
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Graceful degradation on read-only or restricted environments
  }
}

/**
 * Checks for updates in CLI/TTY environments and prints an update notification banner.
 * Never throws errors.
 *
 * @param {object} [options]
 * @returns {Promise<{
 *   skipped?: boolean,
 *   updateAvailable?: boolean,
 *   currentVersion?: string,
 *   latestVersion?: string,
 *   fromCache?: boolean,
 *   checkFailed?: boolean,
 *   error?: string,
 *   banner?: string
 * }>}
 */
export async function checkCliUpdate(options = {}) {
  try {
    const env = options.env || process.env;
    const isTTY = options.isTTY ?? Boolean(process.stdout?.isTTY);

    // Suppression rules
    if (
      env.NO_UPDATE_NOTIFIER === '1' ||
      env.AGH_NO_UPDATE_NOTIFIER === '1' ||
      Boolean(env.CI) ||
      !isTTY
    ) {
      return { skipped: true };
    }

    const currentVersion = options.currentVersion || env.APP_VERSION || getPackageVersion();
    const cacheFile = options.cacheFile || DEFAULT_CACHE_FILE;
    const nowFn = options.now || Date.now;
    const logFn = options.log || console.log;
    const fetchFn = options.fetch || globalThis.fetch;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let latestVersion = null;
    let fromCache = false;

    const cached = readUpdateCache(cacheFile, nowFn);
    if (cached) {
      latestVersion = cached.latestVersion;
      fromCache = true;
    } else {
      const channel = options.channel || (currentVersion.includes('nightly') ? 'nightly' : 'stable');
      const updateUrl = resolveUpdateUrl(options, channel);
      const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
      const res = await fetchFn(updateUrl, { signal });
      if (!res.ok) {
        return { checkFailed: true, error: `Upstream HTTP ${res.status}` };
      }
      const manifest = await res.json();
      if (!manifest || typeof manifest !== 'object' || !manifest.version) {
        return { checkFailed: true, error: 'Invalid manifest received' };
      }
      latestVersion = manifest.version;
      writeUpdateCache(cacheFile, { lastChecked: nowFn(), latestVersion });
    }

    if (isNewerVersion(currentVersion, latestVersion)) {
      const banner = formatBox([
        `Update available: ${currentVersion} → ${latestVersion}`,
        'Run npm i -g agh-console or npx agh-console@latest to update',
      ]);
      logFn(`\n${banner}\n`);
      return { updateAvailable: true, currentVersion, latestVersion, fromCache, banner };
    }

    return { updateAvailable: false, currentVersion, latestVersion, fromCache };
  } catch (err) {
    return { checkFailed: true, error: err?.message || String(err) };
  }
}
