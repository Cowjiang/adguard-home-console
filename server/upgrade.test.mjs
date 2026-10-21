import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  createUpgradeHandler,
  detectDeployment,
  isSelfUpgradeEnabled,
  resolveUpgradeScript,
  shouldDetachUpgrade,
  NPM_UPGRADE_SCRIPT,
  DEFAULT_SCRIPT_FALLBACK,
  STATUS_FILE,
} from './upgrade.mjs';

function mockReqRes(options = {}) {
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
    req: { body: options.body || {}, query: options.query || {} },
    res,
    get response() {
      return responseData;
    },
    get status() {
      return statusCode;
    },
  };
}

function mockChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function tempState() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agh-upgrade-'));
}

test('isSelfUpgradeEnabled: evaluates AGH_ENABLE_SELF_UPGRADE correctly', () => {
  assert.equal(isSelfUpgradeEnabled({ AGH_ENABLE_SELF_UPGRADE: '1' }), true);
  assert.equal(isSelfUpgradeEnabled({ AGH_ENABLE_SELF_UPGRADE: 'true' }), true);
  assert.equal(isSelfUpgradeEnabled({ AGH_ENABLE_SELF_UPGRADE: '0' }), false);
  assert.equal(isSelfUpgradeEnabled({ AGH_ENABLE_SELF_UPGRADE: 'false' }), false);
  assert.equal(isSelfUpgradeEnabled({}), false);
});

test('detectDeployment: explicit env and runtime overrides', () => {
  assert.equal(detectDeployment({ env: { AGH_DEPLOYMENT: 'npm' } }), 'npm');
  assert.equal(detectDeployment({ env: { AGH_DEPLOYMENT: 'docker' } }), 'docker');
  assert.equal(detectDeployment({ env: { AGH_RUNTIME: 'docker' } }), 'docker');
  assert.equal(detectDeployment({ env: { AGH_RUNTIME: 'npm' } }), 'npm');
});

test('resolveUpgradeScript: custom script wins, deployment picks the built-in updater', () => {
  assert.equal(resolveUpgradeScript({ scriptPath: '/custom/script.sh' }), '/custom/script.sh');
  assert.equal(resolveUpgradeScript({ env: { AGH_UPGRADE_SCRIPT: '/env/script.sh' } }), '/env/script.sh');
  assert.equal(
    resolveUpgradeScript({ env: {}, deployment: 'npm', fs: { existsSync: () => false } }),
    NPM_UPGRADE_SCRIPT
  );
  assert.equal(
    resolveUpgradeScript({ env: {}, deployment: 'tarball', fs: { existsSync: () => false } }),
    DEFAULT_SCRIPT_FALLBACK
  );
  assert.equal(
    resolveUpgradeScript({ env: {}, deployment: 'docker', fs: { existsSync: () => false } }),
    null
  );
});

test('shouldDetachUpgrade: explicit and env decisions', () => {
  assert.equal(shouldDetachUpgrade({ detach: true, env: {} }), true);
  assert.equal(shouldDetachUpgrade({ detach: false, env: { INVOCATION_ID: 'x' } }), false);
  assert.equal(shouldDetachUpgrade({ env: { AGH_UPGRADE_DETACH: '1' } }), true);
  assert.equal(shouldDetachUpgrade({ env: { AGH_UPGRADE_DETACH: '0' } }), false);
});

test('upgradeHandler & statusHandler: 403 Forbidden when self-upgrade is disabled', async () => {
  const { upgradeHandler, statusHandler } = createUpgradeHandler({
    env: { AGH_ENABLE_SELF_UPGRADE: '0' },
    stateDir: tempState(),
  });

  const ctxPost = mockReqRes();
  await upgradeHandler(ctxPost.req, ctxPost.res);
  assert.equal(ctxPost.status, 403);
  assert.equal(ctxPost.response.ok, false);
  assert.match(ctxPost.response.error, /disabled/i);

  const ctxGet = mockReqRes();
  await statusHandler(ctxGet.req, ctxGet.res);
  assert.equal(ctxGet.status, 403);
  assert.equal(ctxGet.response.ok, false);
  assert.match(ctxGet.response.error, /disabled/i);
});

test('upgradeHandler: validates the requested channel before touching state', async () => {
  const stateDir = tempState();
  let spawned = false;
  const { upgradeHandler } = createUpgradeHandler({
    env: { AGH_ENABLE_SELF_UPGRADE: '1' },
    stateDir,
    spawn: () => {
      spawned = true;
      return mockChild();
    },
  });

  const ctx = mockReqRes({ body: { channel: 'beta' } });
  await upgradeHandler(ctx.req, ctx.res);

  assert.equal(ctx.status, 400);
  assert.match(ctx.response.error, /Invalid update channel/);
  assert.equal(spawned, false);
  assert.equal(fs.existsSync(path.join(stateDir, 'update-channel')), false);
});

test('upgradeHandler: persists the channel and spawns the channel-aware runner', async () => {
  const stateDir = tempState();
  const child = mockChild();
  let spawnCalledWith = null;
  const mockSpawn = (cmd, args, opts) => {
    spawnCalledWith = { cmd, args, opts };
    return child;
  };
  const fixedTime = 1700000000000;

  const { upgradeHandler, statusHandler, getState } = createUpgradeHandler({
    env: { AGH_ENABLE_SELF_UPGRADE: '1' },
    stateDir,
    deployment: 'tarball',
    scriptPath: '/opt/agh-console/scripts/server-pull.sh',
    detach: false,
    spawn: mockSpawn,
    now: () => fixedTime,
  });

  const postCtx = mockReqRes({ body: { channel: 'nightly' } });
  await upgradeHandler(postCtx.req, postCtx.res);

  assert.equal(postCtx.status, 200);
  assert.equal(postCtx.response.ok, true);
  assert.equal(postCtx.response.status, 'started');
  assert.equal(postCtx.response.channel, 'nightly');
  assert.equal(postCtx.response.detached, false);
  assert.equal(fs.readFileSync(path.join(stateDir, 'update-channel'), 'utf8').trim(), 'nightly');
  assert.equal(fs.existsSync(path.join(stateDir, '.upgrade-runner.sh')), true);

  assert.equal(spawnCalledWith.cmd, 'bash');
  assert.match(spawnCalledWith.args[0], /\.upgrade-runner\.sh$/);
  assert.ok(spawnCalledWith.args.includes('/opt/agh-console/scripts/server-pull.sh'));
  assert.equal(spawnCalledWith.opts.env.AGH_UPGRADE_CHANNEL, 'nightly');
  assert.equal(spawnCalledWith.opts.env.AGH_STATE_DIR, stateDir);

  assert.equal(getState().status, 'running');
  assert.equal(getState().channel, 'nightly');
  assert.equal(getState().lastRun, new Date(fixedTime).toISOString());

  const conflictCtx = mockReqRes();
  await upgradeHandler(conflictCtx.req, conflictCtx.res);
  assert.equal(conflictCtx.status, 409);
  assert.match(conflictCtx.response.error, /already in progress/i);

  child.stdout.emit('data', Buffer.from('Downloading v0.3.0...\n'));
  child.emit('close', 0);

  assert.equal(getState().status, 'completed');
  assert.equal(getState().exitCode, 0);
  assert.match(getState().logs, /Downloading v0\.3\.0/);

  const completedStatusCtx = mockReqRes();
  await statusHandler(completedStatusCtx.req, completedStatusCtx.res);
  assert.equal(completedStatusCtx.response.status, 'completed');
  assert.equal(completedStatusCtx.response.channel, 'nightly');
});

test('upgradeHandler: falls back to the persisted channel when the body omits it', async () => {
  const stateDir = tempState();
  fs.writeFileSync(path.join(stateDir, 'update-channel'), 'nightly\n');
  let spawnCalledWith = null;
  const { upgradeHandler } = createUpgradeHandler({
    env: { AGH_ENABLE_SELF_UPGRADE: '1' },
    stateDir,
    deployment: 'tarball',
    scriptPath: '/opt/agh-console/scripts/server-pull.sh',
    detach: false,
    spawn: (cmd, args, opts) => {
      spawnCalledWith = { cmd, args, opts };
      return mockChild();
    },
  });

  const ctx = mockReqRes();
  await upgradeHandler(ctx.req, ctx.res);
  assert.equal(ctx.response.channel, 'nightly');
  assert.equal(spawnCalledWith.opts.env.AGH_UPGRADE_CHANNEL, 'nightly');
});

test('upgradeHandler: reports persistence failure without spawning', async () => {
  let spawned = false;
  const { upgradeHandler } = createUpgradeHandler({
    env: { AGH_ENABLE_SELF_UPGRADE: '1' },
    stateDir: tempState(),
    writeTargetChannel: () => {
      throw new Error('permission denied');
    },
    spawn: () => {
      spawned = true;
      return mockChild();
    },
  });

  const ctx = mockReqRes({ body: { channel: 'stable' } });
  await upgradeHandler(ctx.req, ctx.res);
  assert.equal(ctx.status, 500);
  assert.match(ctx.response.error, /permission denied/);
  assert.equal(spawned, false);
});

test('upgradeHandler: refuses Docker deployments', async () => {
  const { upgradeHandler } = createUpgradeHandler({
    env: { AGH_ENABLE_SELF_UPGRADE: '1' },
    stateDir: tempState(),
    deployment: 'docker',
  });

  const ctx = mockReqRes({ body: { channel: 'stable' } });
  await upgradeHandler(ctx.req, ctx.res);
  assert.equal(ctx.status, 400);
  assert.match(ctx.response.error, /Docker/);
});

test('upgradeHandler: handles process error and non-zero exit code', async () => {
  const child = mockChild();
  const stateDir = tempState();
  const { upgradeHandler, statusHandler, getState } = createUpgradeHandler({
    env: { AGH_ENABLE_SELF_UPGRADE: 'true' },
    stateDir,
    deployment: 'tarball',
    scriptPath: '/opt/agh-console/scripts/server-pull.sh',
    detach: false,
    spawn: () => child,
  });

  const postCtx = mockReqRes();
  await upgradeHandler(postCtx.req, postCtx.res);
  assert.equal(postCtx.status, 200);

  child.stderr.emit('data', Buffer.from('Error: checksum mismatch\n'));
  child.emit('close', 1);

  assert.equal(getState().status, 'failed');
  assert.equal(getState().exitCode, 1);
  assert.match(getState().logs, /Error: checksum mismatch/);
  assert.match(getState().error, /exited with code 1/);

  const failedStatusCtx = mockReqRes();
  await statusHandler(failedStatusCtx.req, failedStatusCtx.res);
  assert.equal(failedStatusCtx.response.status, 'failed');
  assert.equal(failedStatusCtx.response.exitCode, 1);
});

test('upgrade status survives a server restart through the status file', async () => {
  const stateDir = tempState();
  fs.writeFileSync(
    path.join(stateDir, STATUS_FILE),
    JSON.stringify({ status: 'completed', channel: 'nightly', exitCode: 0, updatedAt: '2026-10-21T00:00:00Z' })
  );
  const { statusHandler } = createUpgradeHandler({
    env: { AGH_ENABLE_SELF_UPGRADE: '1' },
    stateDir,
    deployment: 'tarball',
    scriptPath: '/opt/agh-console/scripts/server-pull.sh',
  });

  const ctx = mockReqRes();
  await statusHandler(ctx.req, ctx.res);
  assert.equal(ctx.response.status, 'completed');
  assert.equal(ctx.response.channel, 'nightly');
});
