import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  formatBox,
  readUpdateCache,
  writeUpdateCache,
  checkCliUpdate,
  CACHE_TTL_MS,
} from './cli-update.mjs';

test('formatBox: renders Unicode box with correct padding and border', () => {
  const box = formatBox(['Hello', 'World'], { padding: 2 });
  const lines = box.split('\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[0], '┌─────────┐');
  assert.equal(lines[1], '│  Hello  │');
  assert.equal(lines[2], '│  World  │');
  assert.equal(lines[3], '└─────────┘');
});

test('formatBox: renders ASCII box when ascii option is true', () => {
  const box = formatBox(['Line 1', 'Longer Line 2'], { ascii: true, padding: 1 });
  const lines = box.split('\n');
  assert.equal(lines[0], '+---------------+');
  assert.equal(lines[1], '| Line 1        |');
  assert.equal(lines[2], '| Longer Line 2 |');
  assert.equal(lines[3], '+---------------+');
});

test('formatBox: handles single string with newline', () => {
  const box = formatBox('A\nB', { padding: 1 });
  const lines = box.split('\n');
  assert.equal(lines[0], '┌───┐');
  assert.equal(lines[1], '│ A │');
  assert.equal(lines[2], '│ B │');
  assert.equal(lines[3], '└───┘');
});

test('readUpdateCache & writeUpdateCache: lifecycle and expiration', () => {
  const tmpCache = path.join(os.tmpdir(), `test-agh-cache-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    // Missing file returns null
    assert.equal(readUpdateCache(tmpCache), null);

    const now = 10000000;
    writeUpdateCache(tmpCache, { lastChecked: now, latestVersion: '0.3.0' });

    // Read within TTL
    const cached = readUpdateCache(tmpCache, () => now + 1000);
    assert.deepEqual(cached, { lastChecked: now, latestVersion: '0.3.0' });

    // Expired read returns null
    const expired = readUpdateCache(tmpCache, () => now + CACHE_TTL_MS + 1);
    assert.equal(expired, null);

    // Corrupted file returns null without throwing
    fs.writeFileSync(tmpCache, '{ invalid json', 'utf8');
    assert.equal(readUpdateCache(tmpCache, () => now), null);
  } finally {
    if (fs.existsSync(tmpCache)) {
      fs.unlinkSync(tmpCache);
    }
  }
});

test('writeUpdateCache: does not throw on invalid path', () => {
  assert.doesNotThrow(() => {
    writeUpdateCache('/nonexistent-dir-for-sure/deep/test.json', { lastChecked: 1, latestVersion: '1.0.0' });
  });
});

test('checkCliUpdate: skips when not a TTY', async () => {
  const res = await checkCliUpdate({ isTTY: false });
  assert.deepEqual(res, { skipped: true });
});

test('checkCliUpdate: skips when NO_UPDATE_NOTIFIER=1', async () => {
  const res = await checkCliUpdate({ isTTY: true, env: { NO_UPDATE_NOTIFIER: '1' } });
  assert.deepEqual(res, { skipped: true });
});

test('checkCliUpdate: skips when AGH_NO_UPDATE_NOTIFIER=1', async () => {
  const res = await checkCliUpdate({ isTTY: true, env: { AGH_NO_UPDATE_NOTIFIER: '1' } });
  assert.deepEqual(res, { skipped: true });
});

test('checkCliUpdate: skips when CI environment variable is set', async () => {
  const res = await checkCliUpdate({ isTTY: true, env: { CI: 'true' } });
  assert.deepEqual(res, { skipped: true });
});

test('checkCliUpdate: fetches remote manifest on cache miss, caches it, and prints banner if newer', async () => {
  const tmpCache = path.join(os.tmpdir(), `test-agh-cache-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const logs = [];
  let fetchCalled = 0;

  const mockFetch = async () => {
    fetchCalled++;
    return {
      ok: true,
      json: async () => ({
        version: '0.3.0',
        downloads: { npm: 'agh-console@0.3.0' },
      }),
    };
  };

  try {
    const res = await checkCliUpdate({
      isTTY: true,
      currentVersion: '0.2.1',
      cacheFile: tmpCache,
      fetch: mockFetch,
      log: (msg) => logs.push(msg),
    });

    assert.equal(fetchCalled, 1);
    assert.equal(res.updateAvailable, true);
    assert.equal(res.latestVersion, '0.3.0');
    assert.equal(res.fromCache, false);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /Update available: 0\.2\.1 → 0\.3\.0/);
    assert.match(logs[0], /npm i -g/);

    // Second call uses cache, does not fetch again
    const res2 = await checkCliUpdate({
      isTTY: true,
      currentVersion: '0.2.1',
      cacheFile: tmpCache,
      fetch: mockFetch,
      log: (msg) => logs.push(msg),
    });

    assert.equal(fetchCalled, 1);
    assert.equal(res2.updateAvailable, true);
    assert.equal(res2.latestVersion, '0.3.0');
    assert.equal(res2.fromCache, true);
    assert.equal(logs.length, 2);
  } finally {
    if (fs.existsSync(tmpCache)) {
      fs.unlinkSync(tmpCache);
    }
  }
});

test('checkCliUpdate: does not show banner if current version is up to date or newer', async () => {
  const tmpCache = path.join(os.tmpdir(), `test-agh-cache-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const logs = [];

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ version: '0.3.0' }),
  });

  try {
    const res = await checkCliUpdate({
      isTTY: true,
      currentVersion: '0.3.0',
      cacheFile: tmpCache,
      fetch: mockFetch,
      log: (msg) => logs.push(msg),
    });

    assert.equal(res.updateAvailable, false);
    assert.equal(res.latestVersion, '0.3.0');
    assert.equal(logs.length, 0);
  } finally {
    if (fs.existsSync(tmpCache)) {
      fs.unlinkSync(tmpCache);
    }
  }
});

test('checkCliUpdate: error resilience on network or HTTP failure', async () => {
  const tmpCache = path.join(os.tmpdir(), `test-agh-cache-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const logs = [];

  const failingFetch = async () => {
    throw new Error('Network unreachable');
  };

  const res = await checkCliUpdate({
    isTTY: true,
    currentVersion: '0.2.1',
    cacheFile: tmpCache,
    fetch: failingFetch,
    log: (msg) => logs.push(msg),
  });

  assert.equal(res.checkFailed, true);
  assert.equal(res.error, 'Network unreachable');
  assert.equal(logs.length, 0);
});
