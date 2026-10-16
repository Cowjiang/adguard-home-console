import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRuntime,
  compareVersions,
  isNewerVersion,
  createVersionHandler,
  CACHE_TTL_MS,
} from './version.mjs';

function mockReqRes(query = {}) {
  let responseData = null;
  let statusCode = 200;
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseData = data;
      return res;
    },
  };
  return {
    req: { query },
    res,
    get response() {
      return responseData;
    },
    get status() {
      return statusCode;
    },
  };
}

const mockManifest = {
  schemaVersion: '1.0',
  appName: 'agh-console',
  channel: 'stable',
  version: '0.3.0',
  releaseTag: 'v0.3.0',
  publishedAt: '2026-10-16T00:00:00.000Z',
  releaseNotes: 'New features',
  htmlUrl: 'https://github.com/Cowjiang/adguard-home-console/releases/tag/v0.3.0',
  downloads: {
    tarball: 'https://github.com/Cowjiang/adguard-home-console/releases/download/v0.3.0/agh-console.tar.gz',
    ipa: 'https://github.com/Cowjiang/adguard-home-console/releases/download/v0.3.0/agh-console.ipa',
    docker: 'ghcr.io/cowjiang/agh-console:0.3.0',
    npm: 'agh-console@0.3.0',
  },
};

test('detectRuntime: detects docker via env or .dockerenv', () => {
  assert.equal(detectRuntime({ AGH_RUNTIME: 'docker' }, { existsSync: () => false }), 'docker');
  assert.equal(detectRuntime({}, { existsSync: (p) => p === '/.dockerenv' }), 'docker');
});

test('detectRuntime: detects systemd via INVOCATION_ID', () => {
  assert.equal(detectRuntime({ INVOCATION_ID: 'abc-123' }, { existsSync: () => false }), 'systemd');
});

test('detectRuntime: detects npm via package manager env', () => {
  assert.equal(detectRuntime({ npm_package_name: 'agh-console' }, { existsSync: () => false }), 'npm');
  assert.equal(detectRuntime({ npm_config_user_agent: 'npm/10.0.0' }, { existsSync: () => false }), 'npm');
});

test('detectRuntime: falls back to standalone', () => {
  assert.equal(detectRuntime({}, { existsSync: () => false }), 'standalone');
});

test('semver: compareVersions and isNewerVersion', () => {
  // Minor & patch upgrades
  assert.equal(isNewerVersion('0.2.1', '0.2.2'), true);
  assert.equal(isNewerVersion('0.2.1', '0.3.0'), true);
  assert.equal(isNewerVersion('0.2.1', '1.0.0'), true);

  // Same or older versions
  assert.equal(isNewerVersion('0.2.1', '0.2.1'), false);
  assert.equal(isNewerVersion('0.3.0', '0.2.1'), false);

  // Nightly upgrades
  assert.equal(isNewerVersion('0.1.0-nightly.20261007.aaa', '0.1.0-nightly.20261008.bbb'), true);
  assert.equal(isNewerVersion('0.1.0-nightly.20261008.bbb', '0.1.0-nightly.20261007.aaa'), false);

  // Stable release is newer than its prerelease
  assert.equal(isNewerVersion('0.2.1-nightly.20261007.aaa', '0.2.1'), true);
  assert.equal(isNewerVersion('0.2.1', '0.2.1-nightly.20261007.aaa'), false);
});

test('versionHandler: detects available update', async () => {
  let fetchCount = 0;
  const mockFetch = async () => {
    fetchCount++;
    return {
      ok: true,
      json: async () => mockManifest,
    };
  };

  const handler = createVersionHandler({
    currentVersion: '0.2.1',
    channel: 'stable',
    detectRuntime: () => 'docker',
    fetch: mockFetch,
  });

  const ctx = mockReqRes();
  await handler(ctx.req, ctx.res);

  assert.equal(ctx.status, 200);
  assert.equal(ctx.response.ok, true);
  assert.equal(ctx.response.currentVersion, '0.2.1');
  assert.equal(ctx.response.channel, 'stable');
  assert.equal(ctx.response.runtime, 'docker');
  assert.equal(ctx.response.hasUpdate, true);
  assert.deepEqual(ctx.response.latest, mockManifest);
  assert.equal(fetchCount, 1);
});

test('versionHandler: current version is up to date (hasUpdate: false)', async () => {
  const handler = createVersionHandler({
    currentVersion: '0.3.0',
    channel: 'stable',
    fetch: async () => ({
      ok: true,
      json: async () => mockManifest,
    }),
  });

  const ctx = mockReqRes();
  await handler(ctx.req, ctx.res);

  assert.equal(ctx.response.ok, true);
  assert.equal(ctx.response.hasUpdate, false);
  assert.equal(ctx.response.latest.version, '0.3.0');
});

test('versionHandler: caches manifest for 12 hours', async () => {
  let fetchCount = 0;
  let currentTime = 1000000;

  const mockFetch = async () => {
    fetchCount++;
    return {
      ok: true,
      json: async () => ({ ...mockManifest, version: `0.3.${fetchCount}` }),
    };
  };

  const handler = createVersionHandler({
    currentVersion: '0.2.1',
    cacheTtlMs: CACHE_TTL_MS,
    now: () => currentTime,
    fetch: mockFetch,
  });

  // First request: cache miss, fetches
  const call1 = mockReqRes();
  await handler(call1.req, call1.res);
  assert.equal(fetchCount, 1);
  assert.equal(call1.response.latest.version, '0.3.1');

  // Second request after 1 hour (within 12h): cache hit, no fetch
  currentTime += 1 * 60 * 60 * 1000;
  const call2 = mockReqRes();
  await handler(call2.req, call2.res);
  assert.equal(fetchCount, 1);
  assert.equal(call2.response.latest.version, '0.3.1');

  // Third request with force=1: cache bypass, fetches
  const call3 = mockReqRes({ force: '1' });
  await handler(call3.req, call3.res);
  assert.equal(fetchCount, 2);
  assert.equal(call3.response.latest.version, '0.3.2');

  // Fourth request after 13 hours from third fetch: cache expired, fetches
  currentTime += 13 * 60 * 60 * 1000;
  const call4 = mockReqRes();
  await handler(call4.req, call4.res);
  assert.equal(fetchCount, 3);
  assert.equal(call4.response.latest.version, '0.3.3');
});

test('versionHandler: error resilience when remote is unreachable', async () => {
  const handler = createVersionHandler({
    currentVersion: '0.2.1',
    channel: 'stable',
    detectRuntime: () => 'standalone',
    fetch: async () => {
      throw new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:443');
    },
  });

  const ctx = mockReqRes();
  await handler(ctx.req, ctx.res);

  assert.equal(ctx.status, 200);
  assert.equal(ctx.response.ok, true);
  assert.equal(ctx.response.currentVersion, '0.2.1');
  assert.equal(ctx.response.channel, 'stable');
  assert.equal(ctx.response.runtime, 'standalone');
  assert.equal(ctx.response.checkFailed, true);
  assert.match(ctx.response.error, /ECONNREFUSED/);
});

test('versionHandler: error resilience when upstream returns HTTP error status', async () => {
  const handler = createVersionHandler({
    currentVersion: '0.2.1',
    fetch: async () => ({
      ok: false,
      status: 404,
    }),
  });

  const ctx = mockReqRes();
  await handler(ctx.req, ctx.res);

  assert.equal(ctx.status, 200);
  assert.equal(ctx.response.ok, true);
  assert.equal(ctx.response.checkFailed, true);
  assert.match(ctx.response.error, /HTTP 404/);
});
