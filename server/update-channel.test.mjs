import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createUpdateChannelHandler,
  isValidChannel,
  channelFromVersion,
  readTargetChannel,
  resolveChannel,
  resolveStateDir,
  writeTargetChannel,
} from './update-channel.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agh-channel-'));
}

function mockRes() {
  let body = null;
  let code = 200;
  const res = {
    status(value) {
      code = value;
      return res;
    },
    json(value) {
      body = value;
      return res;
    },
  };
  return {
    res,
    get body() {
      return body;
    },
    get status() {
      return code;
    },
  };
}

test('isValidChannel / channelFromVersion', () => {
  assert.equal(isValidChannel('stable'), true);
  assert.equal(isValidChannel('nightly'), true);
  assert.equal(isValidChannel('beta'), false);
  assert.equal(channelFromVersion('0.2.1'), 'stable');
  assert.equal(channelFromVersion('0.2.1-nightly.20261020.97eb214'), 'nightly');
});

test('resolveStateDir: AGH_STATE_DIR > AGH_DATA_DIR > user state', () => {
  assert.equal(resolveStateDir({ stateDir: '/explicit', env: {} }), '/explicit');
  assert.equal(resolveStateDir({ env: { AGH_STATE_DIR: '/state' } }), '/state');
  assert.equal(resolveStateDir({ env: { AGH_DATA_DIR: '/data' } }), '/data');
  const fallback = resolveStateDir({ env: { HOME: '/home/tester' }, fs: { accessSync: () => { throw new Error('no'); } } });
  assert.equal(fallback, path.join('/home/tester', '.local', 'state', 'agh-console'));
});

test('resolveStateDir: uses /var/lib/agh-console when writable', () => {
  const fsMock = {
    mkdirSync() {},
    accessSync() {},
    existsSync: () => false,
  };
  assert.equal(resolveStateDir({ env: {}, fs: fsMock }), '/var/lib/agh-console');
});

test('writeTargetChannel / readTargetChannel round-trip atomically', () => {
  const dir = tempDir();
  assert.equal(readTargetChannel({ stateDir: dir }), null);
  const file = writeTargetChannel('nightly', { stateDir: dir });
  assert.equal(file, path.join(dir, 'update-channel'));
  assert.equal(readTargetChannel({ stateDir: dir }), 'nightly');
  writeTargetChannel('stable', { stateDir: dir });
  assert.equal(readTargetChannel({ stateDir: dir }), 'stable');
  fs.writeFileSync(path.join(dir, 'update-channel'), 'beta\n');
  assert.equal(readTargetChannel({ stateDir: dir }), null);
});

test('writeTargetChannel rejects invalid channels', () => {
  assert.throws(() => writeTargetChannel('beta', { stateDir: tempDir() }), /Invalid update channel/);
});

test('resolveChannel: query > state > env > fallback > installed', () => {
  assert.deepEqual(
    resolveChannel({ queryChannel: 'stable', targetChannel: 'nightly', env: { AGH_UPDATE_CHANNEL: 'nightly' }, currentVersion: '0.2.1-nightly.1' }),
    { channel: 'stable', source: 'query' }
  );
  assert.deepEqual(
    resolveChannel({ targetChannel: 'nightly', env: { AGH_UPDATE_CHANNEL: 'stable' }, currentVersion: '0.2.1' }),
    { channel: 'nightly', source: 'state' }
  );
  assert.deepEqual(
    resolveChannel({ env: { AGH_UPDATE_CHANNEL: 'nightly' }, currentVersion: '0.2.1' }),
    { channel: 'nightly', source: 'env' }
  );
  assert.deepEqual(
    resolveChannel({ fallbackChannel: 'stable', currentVersion: '0.2.1-nightly.1' }),
    { channel: 'stable', source: 'option' }
  );
  assert.deepEqual(
    resolveChannel({ currentVersion: '0.2.1-nightly.1' }),
    { channel: 'nightly', source: 'installed' }
  );
});

test('createUpdateChannelHandler: 403 when self-upgrade is disabled', async () => {
  const handler = createUpdateChannelHandler({ env: {}, stateDir: tempDir() });
  const ctx = mockRes();
  await handler({ body: { channel: 'nightly' } }, ctx.res);
  assert.equal(ctx.status, 403);
  assert.match(ctx.body.error, /disabled/);
});

test('createUpdateChannelHandler: validates and persists the channel', async () => {
  const dir = tempDir();
  const handler = createUpdateChannelHandler({ env: { AGH_ENABLE_SELF_UPGRADE: '1' }, stateDir: dir });

  const invalid = mockRes();
  await handler({ body: { channel: 'beta' } }, invalid.res);
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /Invalid update channel/);

  const ok = mockRes();
  await handler({ body: { channel: 'nightly' } }, ok.res);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { ok: true, targetChannel: 'nightly' });
  assert.equal(readTargetChannel({ stateDir: dir }), 'nightly');
});
