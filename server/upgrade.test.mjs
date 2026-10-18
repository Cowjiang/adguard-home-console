import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  createUpgradeHandler,
  isSelfUpgradeEnabled,
  resolveUpgradeScript,
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

test('isSelfUpgradeEnabled: evaluates AGH_ENABLE_SELF_UPGRADE correctly', () => {
  assert.equal(isSelfUpgradeEnabled({ AGH_ENABLE_SELF_UPGRADE: '1' }), true);
  assert.equal(isSelfUpgradeEnabled({ AGH_ENABLE_SELF_UPGRADE: 'true' }), true);
  assert.equal(isSelfUpgradeEnabled({ AGH_ENABLE_SELF_UPGRADE: '0' }), false);
  assert.equal(isSelfUpgradeEnabled({ AGH_ENABLE_SELF_UPGRADE: 'false' }), false);
  assert.equal(isSelfUpgradeEnabled({}), false);
});

test('resolveUpgradeScript: priority order', () => {
  assert.equal(resolveUpgradeScript({ scriptPath: '/custom/script.sh' }), '/custom/script.sh');
  assert.equal(resolveUpgradeScript({ env: { AGH_UPGRADE_SCRIPT: '/env/script.sh' } }), '/env/script.sh');
});

test('upgradeHandler & statusHandler: 403 Forbidden when self-upgrade is disabled', async () => {
  const { upgradeHandler, statusHandler } = createUpgradeHandler({
    env: { AGH_ENABLE_SELF_UPGRADE: '0' },
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

test('upgradeHandler: spawns process, responds 200 started, captures stdout/stderr and tracks status', async () => {
  const mockChild = new EventEmitter();
  mockChild.stdout = new EventEmitter();
  mockChild.stderr = new EventEmitter();

  let spawnCalledWith = null;
  const mockSpawn = (cmd, args, opts) => {
    spawnCalledWith = { cmd, args, opts };
    return mockChild;
  };

  const fixedTime = 1700000000000;
  const { upgradeHandler, statusHandler, getState } = createUpgradeHandler({
    env: { AGH_ENABLE_SELF_UPGRADE: '1' },
    scriptPath: '/opt/agh-console/scripts/server-pull.sh',
    spawn: mockSpawn,
    now: () => fixedTime,
  });

  // Check initial state
  const initialStatusCtx = mockReqRes();
  await statusHandler(initialStatusCtx.req, initialStatusCtx.res);
  assert.equal(initialStatusCtx.status, 200);
  assert.equal(initialStatusCtx.response.status, 'idle');

  // Trigger upgrade
  const postCtx = mockReqRes();
  await upgradeHandler(postCtx.req, postCtx.res);
  assert.equal(postCtx.status, 200);
  assert.equal(postCtx.response.ok, true);
  assert.equal(postCtx.response.status, 'started');
  assert.equal(spawnCalledWith.cmd, 'bash');
  assert.deepEqual(spawnCalledWith.args, ['/opt/agh-console/scripts/server-pull.sh']);

  // State should be running
  assert.equal(getState().status, 'running');
  assert.equal(getState().lastRun, new Date(fixedTime).toISOString());

  // Prevent concurrent runs (409 Conflict)
  const conflictCtx = mockReqRes();
  await upgradeHandler(conflictCtx.req, conflictCtx.res);
  assert.equal(conflictCtx.status, 409);
  assert.equal(conflictCtx.response.ok, false);
  assert.match(conflictCtx.response.error, /already in progress/i);

  // Emit output from child
  mockChild.stdout.emit('data', Buffer.from('Downloading v0.3.0...\n'));
  mockChild.stderr.emit('data', Buffer.from('Notice: backup created\n'));

  // Close with 0 (success)
  mockChild.emit('close', 0);

  // Check completed status
  assert.equal(getState().status, 'completed');
  assert.equal(getState().exitCode, 0);
  assert.match(getState().logs, /Downloading v0\.3\.0/);
  assert.match(getState().logs, /Notice: backup created/);

  const completedStatusCtx = mockReqRes();
  await statusHandler(completedStatusCtx.req, completedStatusCtx.res);
  assert.equal(completedStatusCtx.response.status, 'completed');
  assert.equal(completedStatusCtx.response.exitCode, 0);
});

test('upgradeHandler: handles process error and non-zero exit code', async () => {
  const mockChild = new EventEmitter();
  mockChild.stdout = new EventEmitter();
  mockChild.stderr = new EventEmitter();

  const mockSpawn = () => mockChild;

  const { upgradeHandler, statusHandler, getState } = createUpgradeHandler({
    env: { AGH_ENABLE_SELF_UPGRADE: 'true' },
    scriptPath: '/opt/agh-console/scripts/server-pull.sh',
    spawn: mockSpawn,
  });

  const postCtx = mockReqRes();
  await upgradeHandler(postCtx.req, postCtx.res);
  assert.equal(postCtx.status, 200);

  // Emit failure
  mockChild.stderr.emit('data', Buffer.from('Error: checksum mismatch\n'));
  mockChild.emit('close', 1);

  assert.equal(getState().status, 'failed');
  assert.equal(getState().exitCode, 1);
  assert.match(getState().logs, /Error: checksum mismatch/);
  assert.match(getState().error, /exited with code 1/);

  const failedStatusCtx = mockReqRes();
  await statusHandler(failedStatusCtx.req, failedStatusCtx.res);
  assert.equal(failedStatusCtx.response.status, 'failed');
  assert.equal(failedStatusCtx.response.exitCode, 1);
});
