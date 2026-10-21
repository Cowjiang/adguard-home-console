import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildInstallArgs,
  isDirectExecution,
  channelDistTag,
  packageManager,
  parseChannel,
  resolveHealthUrl,
  runNpmUpgrade,
} from './npm-upgrade.mjs';
import { writeTargetChannel } from './update-channel.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agh-npm-upgrade-'));
}

test('channelDistTag / buildInstallArgs map stable and nightly to dist-tags', () => {
  assert.equal(channelDistTag('stable'), 'latest');
  assert.equal(channelDistTag('nightly'), 'nightly');
  assert.deepEqual(buildInstallArgs({ manager: 'npm', channel: 'stable' }), ['install', '-g', 'agh-console@latest']);
  assert.deepEqual(buildInstallArgs({ manager: 'npm', channel: 'nightly' }), ['install', '-g', 'agh-console@nightly']);
  assert.deepEqual(buildInstallArgs({ manager: 'pnpm', channel: 'nightly' }), [
    'add',
    '-g',
    'agh-console@nightly',
    '--config.minimumReleaseAge=0',
  ]);
  assert.deepEqual(buildInstallArgs({ manager: 'npm', version: '0.2.1' }), ['install', '-g', 'agh-console@0.2.1']);
});

test('parseChannel: argv > env > state file > installed version', () => {
  const stateDir = tempDir();
  writeTargetChannel('nightly', { stateDir });

  assert.equal(parseChannel({ argv: ['--channel', 'stable'], env: { AGH_UPGRADE_CHANNEL: 'nightly' }, stateDir }), 'stable');
  assert.equal(parseChannel({ env: { AGH_UPGRADE_CHANNEL: 'stable' }, stateDir }), 'stable');
  assert.equal(parseChannel({ env: { AGH_STATE_DIR: stateDir }, stateDir }), 'nightly');
  assert.equal(parseChannel({ env: {}, argv: [], currentVersion: '0.2.1-nightly.1' }), 'nightly');
});

test('packageManager defaults to npm and supports pnpm explicitly', () => {
  assert.equal(packageManager({}), 'npm');
  assert.equal(packageManager({ AGH_PACKAGE_MANAGER: 'npm' }), 'npm');
  assert.equal(packageManager({ AGH_PACKAGE_MANAGER: 'pnpm' }), 'pnpm');
});

test('resolveHealthUrl honors AGH_HEALTH_URL and PORT', () => {
  assert.equal(resolveHealthUrl({ AGH_HEALTH_URL: 'http://127.0.0.1:9999/health' }), 'http://127.0.0.1:9999/health');
  assert.equal(resolveHealthUrl({ PORT: '9000' }), 'http://127.0.0.1:9000/api/health');
});

test('isDirectExecution: follows symlinked package paths', () => {
  const dir = tempDir();
  const real = path.join(dir, 'real.mjs');
  fs.writeFileSync(real, '');
  const link = path.join(dir, 'link.mjs');
  fs.symlinkSync(real, link);

  assert.equal(isDirectExecution(link, pathToFileURL(real).href), true);
  assert.equal(isDirectExecution(path.join(dir, 'other.mjs'), pathToFileURL(real).href), false);
  assert.equal(isDirectExecution('', pathToFileURL(real).href), false);
});

test('runNpmUpgrade: installs the nightly dist-tag without restarting', async () => {
  const calls = [];
  const spawn = (cmd, args) => {
    calls.push({ cmd, args });
    return { status: 0 };
  };

  const code = await runNpmUpgrade({
    env: { AGH_UPGRADE_CHANNEL: 'nightly' },
    argv: [],
    previousVersion: '0.2.1',
    restart: false,
    spawn,
  });

  assert.equal(code, 0);
  assert.deepEqual(calls[0], { cmd: 'npm', args: ['install', '-g', 'agh-console@nightly'] });
});

test('runNpmUpgrade: pnpm install, restart and health check', async () => {
  const calls = [];
  const spawn = (cmd, args) => {
    calls.push({ cmd, args });
    return { status: 0 };
  };
  const fetch = async () => ({ ok: true });

  const code = await runNpmUpgrade({
    env: {
      AGH_UPGRADE_CHANNEL: 'stable',
      AGH_PACKAGE_MANAGER: 'pnpm',
      AGH_SERVICE_NAME: 'agh-console',
    },
    argv: [],
    previousVersion: '0.2.1',
    spawn,
    fetch,
    sleep: async () => {},
  });

  assert.equal(code, 0);
  assert.deepEqual(calls[0], {
    cmd: 'pnpm',
    args: ['add', '-g', 'agh-console@latest', '--config.minimumReleaseAge=0'],
  });
  assert.ok(calls.some((call) => call.cmd === 'systemctl' && call.args[0] === 'restart' && call.args[1] === 'agh-console'));
  assert.ok(calls.some((call) => call.cmd === 'systemctl' && call.args[0] === 'is-active'));
});

test('runNpmUpgrade: rolls back to the previous version when restart fails', async () => {
  const calls = [];
  const spawn = (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'systemctl' && args[0] === 'restart') return { status: 1 };
    return { status: 0 };
  };

  const code = await runNpmUpgrade({
    env: { AGH_UPGRADE_CHANNEL: 'stable' },
    argv: [],
    previousVersion: '0.2.1',
    spawn,
  });

  assert.equal(code, 1);
  assert.ok(calls.some((call) => call.cmd === 'npm' && call.args.includes('agh-console@0.2.1')));
});

test('runNpmUpgrade: returns non-zero when install fails', async () => {
  const code = await runNpmUpgrade({
    env: { AGH_UPGRADE_CHANNEL: 'stable' },
    argv: [],
    previousVersion: '0.2.1',
    spawn: () => ({ status: 1 }),
  });
  assert.equal(code, 1);
});
