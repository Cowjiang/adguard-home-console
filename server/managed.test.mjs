import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import {
  createManagedHandler,
  isValidId,
  atomicWriteJsonSync,
  resolveDataDir,
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

test('atomicWriteJsonSync: writes JSON atomically and creates missing directories', () => {
  const tempDir = createTempDir();
  try {
    const targetPath = path.join(tempDir, 'nested', 'dir', 'sample.json');
    const data = { hello: 'world', count: 42 };

    atomicWriteJsonSync(targetPath, data);

    assert.ok(fs.existsSync(targetPath));
    const content = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    assert.deepEqual(content, data);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('managed API: full workflow test against isolated temporary directory', async (t) => {
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
    checksum: 'checksum11111111111111111111111111111111111111111111111111111111111111',
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
    checksum: 'checksum22222222222222222222222222222222222222222222222222222222222222',
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

  // 11. Idempotency test: Re-uploading snap-1 with identical checksum
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
  // Ciphertext should not be in the summary
  assert.equal(snapshotSummaries[0].ciphertext, undefined);

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

  // Verify snap-2 is deleted from disk and snapshot list
  const listAfterSnapDeleteRes = await fetch(`${baseUrl}/instances/inst-1/snapshots`);
  const listAfterSnapDelete = await listAfterSnapDeleteRes.json();
  assert.equal(listAfterSnapDelete.length, 1);
  assert.equal(listAfterSnapDelete[0].id, 'snap-1');
  assert.equal(
    fs.existsSync(path.join(tempDir, 'snapshots', 'inst-1', 'snap-2.json')),
    false
  );

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
