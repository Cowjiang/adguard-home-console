/**
 * AdGuard Home Console — persisted update channel state
 *
 * Web clients, the upgrade runner and the systemd timer must agree on one
 * target channel. The state dir follows the deployment conventions:
 *   AGH_STATE_DIR > AGH_DATA_DIR > writable /var/lib/agh-console > user state dir
 * The file is a single stable|nightly line so shell scripts and Node agree
 * without parsing JSON.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const VALID_CHANNELS = ['stable', 'nightly'];
export const CHANNEL_FILE = 'update-channel';

export function isValidChannel(value) {
  return value === 'stable' || value === 'nightly';
}

export function channelFromVersion(version = '') {
  return String(version).includes('nightly') ? 'nightly' : 'stable';
}

export function resolveStateDir(options = {}) {
  const env = options.env || process.env;
  const fsModule = options.fs || fs;
  if (options.stateDir) return path.resolve(options.stateDir);
  if (env.AGH_STATE_DIR) return path.resolve(env.AGH_STATE_DIR);
  if (env.AGH_DATA_DIR) return path.resolve(env.AGH_DATA_DIR);

  const systemDir = '/var/lib/agh-console';
  try {
    // Root/systemd deployments share this directory with server-pull.sh; create
    // it when missing so both sides read the same update-channel/deployed-tag.
    fsModule.mkdirSync(systemDir, { recursive: true });
    fsModule.accessSync(systemDir, fs.constants?.W_OK ?? 2);
    return systemDir;
  } catch {
    // Not writable (e.g. npm install run by a normal user) — fall through.
  }

  const base = env.XDG_STATE_HOME
    ? path.resolve(env.XDG_STATE_HOME)
    : path.join(env.HOME || os.homedir(), '.local', 'state');
  return path.join(base, 'agh-console');
}

export function readTargetChannel(options = {}) {
  const fsModule = options.fs || fs;
  const stateDir = options.stateDir ? path.resolve(options.stateDir) : resolveStateDir(options);
  try {
    const raw = fsModule.readFileSync(path.join(stateDir, CHANNEL_FILE), 'utf8').trim();
    return isValidChannel(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeTargetChannel(channel, options = {}) {
  if (!isValidChannel(channel)) {
    throw new Error(`Invalid update channel '${channel}'`);
  }
  const fsModule = options.fs || fs;
  const stateDir = options.stateDir ? path.resolve(options.stateDir) : resolveStateDir(options);
  fsModule.mkdirSync(stateDir, { recursive: true });
  const file = path.join(stateDir, CHANNEL_FILE);
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  fsModule.writeFileSync(tmp, `${channel}\n`, { mode: 0o644 });
  fsModule.renameSync(tmp, file);
  return file;
}

/**
 * Express handler for POST /api/system/channel.
 * Channel state only matters to the self-upgrade loop, so the same
 * AGH_ENABLE_SELF_UPGRADE gate protects this write endpoint instead of
 * introducing a new unauthenticated mutation surface.
 */
export function createUpdateChannelHandler(options = {}) {
  const env = options.env || process.env;
  const stateDir = options.stateDir ?? resolveStateDir({ env });
  const persist = options.writeTargetChannel ?? ((channel) => writeTargetChannel(channel, { stateDir }));
  return function updateChannelHandler(req, res) {
    const enabled = env.AGH_ENABLE_SELF_UPGRADE === '1' || env.AGH_ENABLE_SELF_UPGRADE === 'true';
    if (!enabled) {
      return res.status(403).json({ ok: false, error: 'Self-upgrade is disabled on this server' });
    }
    const channel = req?.body?.channel;
    if (!isValidChannel(channel)) {
      return res.status(400).json({ ok: false, error: `Invalid update channel '${channel}'` });
    }
    try {
      persist(channel);
      return res.json({ ok: true, targetChannel: channel });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: `Failed to persist update channel: ${err.message}`,
      });
    }
  };
}

/**
 * Resolves the effective channel and its source.
 * Order: explicit query/channel > persisted state > env default > caller fallback > installed version.
 */
export function resolveChannel({ queryChannel, targetChannel, env = process.env, fallbackChannel, currentVersion = '' } = {}) {
  if (isValidChannel(queryChannel)) return { channel: queryChannel, source: 'query' };
  if (isValidChannel(targetChannel)) return { channel: targetChannel, source: 'state' };
  if (isValidChannel(env.AGH_UPDATE_CHANNEL)) return { channel: env.AGH_UPDATE_CHANNEL, source: 'env' };
  if (isValidChannel(fallbackChannel)) return { channel: fallbackChannel, source: 'option' };
  return { channel: channelFromVersion(currentVersion), source: 'installed' };
}
