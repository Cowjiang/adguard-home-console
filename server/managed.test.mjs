import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import {
  createManagedHandler,
  isValidId,
  resolveSafePath,
  atomicWriteJson,
  resolveDataDir,
  withLock,
  rebuildSnapshotsIndex,
} from './managed.mjs';

function createTempDir(prefix = 'test-managed-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('isValidId: strictly validates IDs and blocks path traversal attempts', () => {
  // Valid IDs
  assert.equal(isValidId('inst-1'), true);
  assert.equal(isValidId('inst_2'), true);
  assert.equal(isValidId('instance.primary.v1'), true);
  assert.equal(isValidId('aB123_-.'), true);

  // Invalid IDs & Path Traversal
  assert.equal(isValidId(''), false);
  assert.equal(isValidId('.'), false);
  assert.equal(isValidId('..'), false);
  assert.equal(isValidId('../instance'), false);
  assert.equal(isValidId('instance/sub'), false);
  assert.equal(isValidId('instance\\sub'), false);
  assert.equal(isValidId('instance..sub'), false);
  assert.equal(isValidId('inst space'), false);
  assert.equal(isValidId('inst$1'), false);
  assert.equal(isValidId('inst/../etc/passwd'), false);
  assert.equal(isValidId(null), false);
  assert.equal(isValidId(123), false);
});

test('resolveSafePath: prevents path traversal beyond base directory', () => {
  const baseDir = '/tmp/safe-base';
  assert.equal(
    resolveSafePath(baseDir, 'snapshots', 'inst-1'),
    path.resolve(baseDir, 'snapshots', 'inst-1')
  );

  assert.throws(
    () => resolveSafePath(baseDir, '..', 'evil'),
    /Path traversal attempt detected/
  );
  assert.throws(
    () => resolveSafePath(baseDir, 'snapshots', '..', '..', 'etc', 'passwd'),
    /Path traversal attempt detected/
  );
});

test('atomicWriteJson: writes JSON atomically and creates missing directories asynchronously', async () => {
  const tempDir = createTempDir();
  try {
    const targetPath = path.join(tempDir, 'nested', 'dir', 'sample.json');
    const data = { hello: 'world', count: 42 };

    await atomicWriteJson(targetPath, data);

    assert.ok(fs.existsSync(targetPath));
    const content = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    assert.deepEqual(content, data);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('withLock: guarantees FIFO serial execution and handles task errors gracefully', async () => {
  const order = [];
  const results = [];

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Run two tasks concurrently
  const p1 = withLock('test-lock', async () => {
    await delay(30);
    order.push('task1');
    return 1;
  });

  const p2 = withLock('test-lock', async () => {
    order.push('task2');
    return 2;
  });

  results.push(await p1);
  results.push(await p2);

  assert.deepEqual(order, ['task1', 'task2']);
  assert.deepEqual(results, [1, 2]);

  // Error resilience: an error in task3 does not block task4
  let task3Caught = false;
  const p3 = withLock('test-lock', async () => {
    throw new Error('Task 3 failure');
  }).catch((err) => {
    task3Caught = true;
    return 'caught-task3';
  });

  const p4 = withLock('test-lock', async () => {
    return 'task4-ok';
  });

  const res3 = await p3;
  const res4 = await p4;

  assert.equal(task3Caught, true);
  assert.equal(res3, 'caught-task3');
  assert.equal(res4, 'task4-ok');
});

test('managed API: full workflow test against isolated temporary directory with snapshots index', async (t) => {
  const tempDir = createTempDir('test-managed-workflow-');
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Mount managed router pointing to isolated tempDir
  const router = createManagedHandler({ dataDir: tempDir });
  app.use('/api/managed', router);

  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/managed`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // 1. GET /status
  const statusRes = await fetch(`${baseUrl}/status`);
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.equal(statusData.ok, true);
  assert.equal(statusData.managed, true);
  assert.equal(statusData.dataDir, path.resolve(tempDir));

  // 2. GET /instances on empty database
  const emptyInstancesRes = await fetch(`${baseUrl}/instances`);
  assert.equal(emptyInstancesRes.status, 200);
  const emptyInstances = await emptyInstancesRes.json();
  assert.deepEqual(emptyInstances, []);

  // 3. POST /instances: Security Redline (password field rejection)
  const passwordRejectRes = await fetch(`${baseUrl}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'inst-1',
      label: 'Home Gateway',
      url: 'http://192.168.1.1:3000',
      username: 'root',
      salt: 'c2FsdDE2Ynl0ZXNhbHQ=',
      password: 'mypassword123', // Redline violation
    }),
  });
  assert.equal(passwordRejectRes.status, 400);
  const passwordRejectData = await passwordRejectRes.json();
  assert.equal(
    passwordRejectData.error,
    'Password must never be sent to the managed console server'
  );

  // 4. POST /instances: Missing required fields
  const missingFieldRes = await fetch(`${baseUrl}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'inst-1',
      label: 'Home Gateway',
      url: 'http://192.168.1.1:3000',
      // missing username and salt
    }),
  });
  assert.equal(missingFieldRes.status, 400);

  // 5. POST /instances: Invalid ID format (Path Traversal attempt)
  const traversalRes = await fetch(`${baseUrl}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: '../malicious-id',
      label: 'Malicious',
      url: 'http://192.168.1.1:3000',
      username: 'root',
      salt: 'c2FsdDE2Ynl0ZXNhbHQ=',
    }),
  });
  assert.equal(traversalRes.status, 400);
  const traversalData = await traversalRes.json();
  assert.equal(traversalData.error, 'Invalid instance ID format');

  // 6. POST /instances: Create valid instance
  const createInstanceRes = await fetch(`${baseUrl}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'inst-1',
      label: 'Home Gateway',
      url: 'http://192.168.1.1:3000',
      username: 'admin',
      salt: 'c2FsdDE2Ynl0ZXNhbHQ=',
    }),
  });
  assert.equal(createInstanceRes.status, 200);
  const createInstanceData = await createInstanceRes.json();
  assert.equal(createInstanceData.ok, true);
  assert.equal(createInstanceData.instance.id, 'inst-1');
  assert.equal(createInstanceData.instance.label, 'Home Gateway');
  assert.ok(createInstanceData.instance.updatedAt);

  // Verify stored in instances.json on disk
  const instancesOnDisk = JSON.parse(
    fs.readFileSync(path.join(tempDir, 'instances.json'), 'utf8')
  );
  assert.equal(instancesOnDisk.length, 1);
  assert.equal(instancesOnDisk[0].id, 'inst-1');

  // 7. POST /instances: Update existing instance
  const updateInstanceRes = await fetch(`${baseUrl}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'inst-1',
      label: 'Home Gateway Renamed',
      url: 'http://192.168.1.1:3000',
      username: 'admin',
      salt: 'c2FsdDE2Ynl0ZXNhbHQ=',
      updatedAt: '2026-10-18T10:00:00.000Z',
    }),
  });
  assert.equal(updateInstanceRes.status, 200);
  const listAfterUpdateRes = await fetch(`${baseUrl}/instances`);
  const listAfterUpdate = await listAfterUpdateRes.json();
  assert.equal(listAfterUpdate.length, 1);
  assert.equal(listAfterUpdate[0].label, 'Home Gateway Renamed');
  assert.equal(listAfterUpdate[0].updatedAt, '2026-10-18T10:00:00.000Z');

  // 8. GET /instances/:id/snapshots when empty
  const emptySnapshotsRes = await fetch(`${baseUrl}/instances/inst-1/snapshots`);
  assert.equal(emptySnapshotsRes.status, 200);
  const emptySnapshots = await emptySnapshotsRes.json();
  assert.deepEqual(emptySnapshots, []);

  // 9. PUT /instances/:id/snapshots/:snapshotId validation
  // Invalid snapshotId (path traversal)
  const invalidSnapPutRes = await fetch(`${baseUrl}/instances/inst-1/snapshots/..%2fbad`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'bad', instanceId: 'inst-1' }),
  });
  assert.equal(invalidSnapPutRes.status, 400);

  // Mismatched body id
  const mismatchPutRes = await fetch(`${baseUrl}/instances/inst-1/snapshots/snap-1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'snap-wrong',
      instanceId: 'inst-1',
    }),
  });
  assert.equal(mismatchPutRes.status, 400);

  // 10. PUT /instances/:id/snapshots/:snapshotId: Upload snapshots
  const blob1 = {
    id: 'snap-1',
    instanceId: 'inst-1',
    createdAt: '2026-10-18T01:00:00.000Z',
    version: 1,
    kdf: {
      algorithm: 'PBKDF2-HMAC-SHA256',
      iterations: 600000,
      salt: 'c2FsdDE2Ynl0ZXNhbHQ=',
    },
    cipher: {
      algorithm: 'AES-256-GCM',
      iv: 'aXZmb3JzbmFwMQ==',
      tagLength: 128,
    },
    ciphertext: 'Y2lwaGVydGV4dGRhdGEx',
    metaSummary: {
      trigger: 'manual',
      moduleCount: 9,
    },
  };

  const blob2 = {
    id: 'snap-2',
    instanceId: 'inst-1',
    createdAt: '2026-10-18T02:00:00.000Z',
    version: 1,
    kdf: {
      algorithm: 'PBKDF2-HMAC-SHA256',
      iterations: 600000,
      salt: 'c2FsdDE2Ynl0ZXNhbHQ=',
    },
    cipher: {
      algorithm: 'AES-256-GCM',
      iv: 'aXZmb3JzbmFwMg==',
      tagLength: 128,
    },
    ciphertext: 'Y2lwaGVydGV4dGRhdGEy',
  };

  const put1Res = await fetch(`${baseUrl}/instances/inst-1/snapshots/snap-1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blob1),
  });
  assert.equal(put1Res.status, 200);

  const put2Res = await fetch(`${baseUrl}/instances/inst-1/snapshots/snap-2`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blob2),
  });
  assert.equal(put2Res.status, 200);

  // Verify snapshots_index.json was created and indexed correctly
  const indexPath = path.join(tempDir, 'snapshots', 'inst-1', 'snapshots_index.json');
  assert.ok(fs.existsSync(indexPath));
  const initialIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  assert.equal(initialIndex.length, 2);
  assert.equal(initialIndex[0].id, 'snap-2');
  assert.equal(initialIndex[1].id, 'snap-1');

  // 11. Idempotency test: Re-uploading snap-1 with identical ciphertext
  const putIdempotentRes = await fetch(`${baseUrl}/instances/inst-1/snapshots/snap-1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blob1),
  });
  assert.equal(putIdempotentRes.status, 200);
  const putIdempotentData = await putIdempotentRes.json();
  assert.equal(putIdempotentData.deduplicated, true);

  // 12. GET /instances/:id/snapshots: Verify summary list ordered descending by createdAt
  const listSnapshotsRes = await fetch(`${baseUrl}/instances/inst-1/snapshots`);
  assert.equal(listSnapshotsRes.status, 200);
  const snapshotSummaries = await listSnapshotsRes.json();
  assert.equal(snapshotSummaries.length, 2);
  // snap-2 (02:00) should be before snap-1 (01:00)
  assert.equal(snapshotSummaries[0].id, 'snap-2');
  assert.equal(snapshotSummaries[1].id, 'snap-1');
  assert.deepEqual(snapshotSummaries[1].metaSummary, {
    trigger: 'manual',
    moduleCount: 9,
  });
  // Ciphertext and checksum must not be exposed in the summary
  assert.equal(snapshotSummaries[0].ciphertext, undefined);
  assert.equal(snapshotSummaries[0].checksum, undefined);
  assert.equal(snapshotSummaries[1].checksum, undefined);

  // 12b. Verify automatic index reconstruction if snapshots_index.json is deleted
  fs.unlinkSync(indexPath);
  assert.equal(fs.existsSync(indexPath), false);
  const listRecoveredRes = await fetch(`${baseUrl}/instances/inst-1/snapshots`);
  assert.equal(listRecoveredRes.status, 200);
  const recoveredList = await listRecoveredRes.json();
  assert.equal(recoveredList.length, 2);
  assert.equal(recoveredList[0].id, 'snap-2');
  assert.equal(recoveredList[1].id, 'snap-1');
  assert.ok(fs.existsSync(indexPath)); // Successfully regenerated on the fly

  // 13. GET /instances/:id/snapshots/:snapshotId: Fetch full encrypted blob
  const getSnap1Res = await fetch(`${baseUrl}/instances/inst-1/snapshots/snap-1`);
  assert.equal(getSnap1Res.status, 200);
  const snap1Data = await getSnap1Res.json();
  assert.deepEqual(snap1Data, blob1);

  // 14. GET non-existent snapshot
  const getNonExistentRes = await fetch(`${baseUrl}/instances/inst-1/snapshots/snap-none`);
  assert.equal(getNonExistentRes.status, 404);

  // 15. DELETE single snapshot
  const deleteSnapRes = await fetch(`${baseUrl}/instances/inst-1/snapshots/snap-2`, {
    method: 'DELETE',
  });
  assert.equal(deleteSnapRes.status, 200);

  // Verify snap-2 is deleted from disk and snapshot index
  const listAfterSnapDeleteRes = await fetch(`${baseUrl}/instances/inst-1/snapshots`);
  const listAfterSnapDelete = await listAfterSnapDeleteRes.json();
  assert.equal(listAfterSnapDelete.length, 1);
  assert.equal(listAfterSnapDelete[0].id, 'snap-1');
  assert.equal(
    fs.existsSync(path.join(tempDir, 'snapshots', 'inst-1', 'snap-2.json')),
    false
  );
  // Verify snapshots_index.json reflects the deletion
  const indexAfterDelete = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  assert.equal(indexAfterDelete.length, 1);
  assert.equal(indexAfterDelete[0].id, 'snap-1');

  // 16. DELETE instance and ensure its snapshots directory is cleaned up
  const deleteInstRes = await fetch(`${baseUrl}/instances/inst-1`, {
    method: 'DELETE',
  });
  assert.equal(deleteInstRes.status, 200);

  // Verify instances list is now empty
  const listAfterInstDeleteRes = await fetch(`${baseUrl}/instances`);
  const listAfterInstDelete = await listAfterInstDeleteRes.json();
  assert.deepEqual(listAfterInstDelete, []);

  // Verify snapshots directory for inst-1 is cleaned up
  assert.equal(
    fs.existsSync(path.join(tempDir, 'snapshots', 'inst-1')),
    false
  );
});

test('managed API: rejects malformed snapshot payloads according to contract validation', async (t) => {
  const tempDir = createTempDir('test-managed-validation-');
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  const router = createManagedHandler({ dataDir: tempDir });
  app.use('/api/managed', router);

  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/managed`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const validBase = {
    id: 'snap-val',
    instanceId: 'inst-val',
    ciphertext: 'Y2lwaGVydGV4dA==',
    kdf: {
      algorithm: 'PBKDF2-HMAC-SHA256',
      iterations: 600000,
      salt: 'c2FsdDE2Ynl0ZXNhbHQ=',
    },
    cipher: {
      algorithm: 'AES-256-GCM',
      iv: 'aXZmb3JzbmFwMQ==',
      tagLength: 128,
    },
  };

  // 1. Missing ciphertext
  const resNoCiphertext = await fetch(`${baseUrl}/instances/inst-val/snapshots/snap-val`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validBase, ciphertext: undefined }),
  });
  assert.equal(resNoCiphertext.status, 400);

  // 2. Invalid Base64 in ciphertext
  const resBadBase64 = await fetch(`${baseUrl}/instances/inst-val/snapshots/snap-val`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validBase, ciphertext: 'Not-Valid-Base64!@#$' }),
  });
  assert.equal(resBadBase64.status, 400);

  // 3. Invalid or missing KDF
  const resNoKdf = await fetch(`${baseUrl}/instances/inst-val/snapshots/snap-val`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validBase, kdf: null }),
  });
  assert.equal(resNoKdf.status, 400);

  const resBadKdfIterations = await fetch(`${baseUrl}/instances/inst-val/snapshots/snap-val`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...validBase,
      kdf: { ...validBase.kdf, iterations: -5 },
    }),
  });
  assert.equal(resBadKdfIterations.status, 400);

  const resMissingSalt = await fetch(`${baseUrl}/instances/inst-val/snapshots/snap-val`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...validBase,
      kdf: { ...validBase.kdf, salt: '' },
    }),
  });
  assert.equal(resMissingSalt.status, 400);

  // 4. Invalid or missing Cipher
  const resNoCipher = await fetch(`${baseUrl}/instances/inst-val/snapshots/snap-val`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validBase, cipher: null }),
  });
  assert.equal(resNoCipher.status, 400);

  const resMissingIv = await fetch(`${baseUrl}/instances/inst-val/snapshots/snap-val`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...validBase,
      cipher: { ...validBase.cipher, iv: '' },
    }),
  });
  assert.equal(resMissingIv.status, 400);

  const resBadTagLength = await fetch(`${baseUrl}/instances/inst-val/snapshots/snap-val`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...validBase,
      cipher: { ...validBase.cipher, tagLength: 0 },
    }),
  });
  assert.equal(resBadTagLength.status, 400);
});

test('managed API: handles concurrent instance registrations without lost updates (Async Mutex)', async (t) => {
  const tempDir = createTempDir('test-managed-concurrent-');
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  const router = createManagedHandler({ dataDir: tempDir });
  app.use('/api/managed', router);

  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/managed`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const CONCURRENCY_COUNT = 20;

  // Fire CONCURRENCY_COUNT requests simultaneously
  const requests = Array.from({ length: CONCURRENCY_COUNT }, (_, i) => {
    return fetch(`${baseUrl}/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `inst-conc-${i}`,
        label: `Concurrent Node ${i}`,
        url: `http://10.0.0.${i}:3000`,
        username: `user_${i}`,
        salt: `c2FsdF9jb25jXzE2Ynl0ZXNf${i}=`,
      }),
    });
  });

  const responses = await Promise.all(requests);
  for (const res of responses) {
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
  }

  // Verify all CONCURRENCY_COUNT instances are saved with no lost updates
  const listRes = await fetch(`${baseUrl}/instances`);
  assert.equal(listRes.status, 200);
  const instancesList = await listRes.json();
  assert.equal(instancesList.length, CONCURRENCY_COUNT);

  const savedIds = new Set(instancesList.map((inst) => inst.id));
  for (let i = 0; i < CONCURRENCY_COUNT; i++) {
    assert.ok(
      savedIds.has(`inst-conc-${i}`),
      `Expected inst-conc-${i} to be present in instances.json`
    );
  }
});
