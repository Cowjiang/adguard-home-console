import { test, expect, type Page } from 'playwright/test';
import { attachSecuritySniffer } from './helpers/securitySniffer';
import { setupAghMock } from './helpers/mockAgh';

interface IdbState {
  snapshots: any[];
  outbox: any[];
}

/**
 * Directly inspects the underlying IndexedDB database `agh_console_snapshots` (version 2)
 * to verify raw physical storage of managed_snapshots and managed_outbox stores.
 */
async function getIndexedDbState(page: Page): Promise<IdbState> {
  return page.evaluate(async () => {
    return new Promise<IdbState>((resolve) => {
      const req = indexedDB.open('agh_console_snapshots', 2);
      req.onsuccess = () => {
        const db = req.result;
        const res: IdbState = { snapshots: [], outbox: [] };
        const hasSnapshots = db.objectStoreNames.contains('managed_snapshots');
        const hasOutbox = db.objectStoreNames.contains('managed_outbox');
        if (!hasSnapshots && !hasOutbox) {
          db.close();
          return resolve(res);
        }

        const storesToRead: string[] = [];
        if (hasSnapshots) storesToRead.push('managed_snapshots');
        if (hasOutbox) storesToRead.push('managed_outbox');

        const tx = db.transaction(storesToRead, 'readonly');
        let pending = storesToRead.length;

        if (hasSnapshots) {
          const snapStore = tx.objectStore('managed_snapshots');
          const getAll = snapStore.getAll();
          getAll.onsuccess = () => {
            res.snapshots = getAll.result || [];
            if (--pending === 0) {
              db.close();
              resolve(res);
            }
          };
          getAll.onerror = () => {
            if (--pending === 0) {
              db.close();
              resolve(res);
            }
          };
        }

        if (hasOutbox) {
          const outboxStore = tx.objectStore('managed_outbox');
          const getAll = outboxStore.getAll();
          getAll.onsuccess = () => {
            res.outbox = getAll.result || [];
            if (--pending === 0) {
              db.close();
              resolve(res);
            }
          };
          getAll.onerror = () => {
            if (--pending === 0) {
              db.close();
              resolve(res);
            }
          };
        }
      };
      req.onerror = () => resolve({ snapshots: [], outbox: [] });
    });
  });
}

/**
 * Polls the underlying IndexedDB until the snapshot status is updated and outbox queue is cleared.
 */
async function pollIndexedDbSyncState(
  page: Page,
  snapshotId: string
): Promise<{ outboxCount: number; status: string | null }> {
  return page.evaluate(async (snapId: string) => {
    return new Promise<{ outboxCount: number; status: string | null }>((resolve) => {
      const req = indexedDB.open('agh_console_snapshots', 2);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['managed_snapshots', 'managed_outbox'], 'readonly');
        const snapStore = tx.objectStore('managed_snapshots');
        const outboxStore = tx.objectStore('managed_outbox');

        const getSnap = snapStore.get(snapId);
        const getOutbox = outboxStore.getAll();

        let snapStatus: string | null = null;
        let outboxCount = -1;

        getSnap.onsuccess = () => {
          snapStatus = getSnap.result?.status || null;
          if (outboxCount !== -1) {
            db.close();
            resolve({ outboxCount, status: snapStatus });
          }
        };

        getOutbox.onsuccess = () => {
          const tasks = getOutbox.result || [];
          outboxCount = tasks.filter((t: any) => t.snapshotId === snapId).length;
          if (snapStatus !== null) {
            db.close();
            resolve({ outboxCount, status: snapStatus });
          }
        };
      };
      req.onerror = () => resolve({ outboxCount: -1, status: null });
    });
  }, snapshotId);
}

test.describe('Scenario 3: Offline Outbox Resilience and Network Recovery Auto-Upload', () => {
  const AGH_PASSWORD = 'OfflineResilience#Secret2026';
  const SENSITIVE_RULE = '||custom-offline-tracker.internal^';
  const AGH_URL = 'http://192.168.1.1:3000';
  const AGH_USER = 'admin';

  test('creates snapshot while offline, enqueues to outbox, and auto-uploads upon network online event', async ({
    browser,
    request,
  }) => {
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const instanceLabel = `Router-Offline-Auto-${randomSuffix}`;
    const snapshotLabel = `Offline Snapshot Auto ${randomSuffix}`;

    const context = await browser.newContext();
    const page = await context.newPage();
    let registeredInstanceId = '';

    try {
      // 1. Attach security sniffer to intercept and verify zero-knowledge encryption
      const sniffer = attachSecuritySniffer(page, {
        forbiddenPlaintexts: [AGH_PASSWORD, SENSITIVE_RULE],
      });

      // 2. Setup AGH upstream mock with sensitive rule
      await setupAghMock(page, {
        validPassword: AGH_PASSWORD,
        userRules: [SENSITIVE_RULE],
      });

      // 3. Navigate to /login and register a managed instance
      await page.goto('/login');
      await expect(page).toHaveURL(/\/login/);

      const managedTab = page.getByRole('button', { name: /Managed Mode|托管模式/i });
      await managedTab.click();

      const registerNewBtn = page
        .getByRole('button', {
          name: /Register (new |Managed )?Instance|登记新托管实例/i,
        })
        .first();
      await expect(registerNewBtn).toBeVisible();
      await registerNewBtn.click();

      await page.getByPlaceholder('http://192.168.1.2:3000').fill(AGH_URL);
      await page.getByPlaceholder('admin').fill(AGH_USER);
      await page.getByPlaceholder('••••••••').fill(AGH_PASSWORD);
      await page.getByPlaceholder(/Instance Name|实例名称/i).fill(instanceLabel);

      const registerSubmitBtn = page.getByRole('button', {
        name: /Register & Connect|登记并进入/i,
      });
      await expect(registerSubmitBtn).toBeEnabled();

      const [regResponse] = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.url().includes('/api/managed/instances') &&
            res.request().method() === 'POST'
        ),
        registerSubmitBtn.click(),
      ]);

      expect(regResponse.status()).toBe(200);
      const regResult = await regResponse.json();
      expect(regResult.ok).toBe(true);
      registeredInstanceId = regResult.instance.id;
      expect(registeredInstanceId).toBeTruthy();

      // Verify registration redirected to dashboard
      await expect(page).toHaveURL(/http:\/\/[^/]+\/?$/);
      await expect(page).not.toHaveURL(/\/login/);

      // 4. Navigate to Snapshots settings page while online
      await page.goto('/settings/snapshots');
      await expect(page).toHaveURL(/\/settings\/snapshots/);

      const createSnapBtn = page
        .getByRole('button', { name: /Create Snapshot|创建快照/i })
        .first();
      await expect(createSnapBtn).toBeVisible();

      // 5. Simulate network failure / offline disconnection
      await context.setOffline(true);

      // 6. Create snapshot in offline state
      await createSnapBtn.click();

      const snapLabelInput = page.getByPlaceholder(
        /Before changing upstream DNS|例如修改上游 DNS 前/i
      );
      await expect(snapLabelInput).toBeVisible();
      await snapLabelInput.fill(snapshotLabel);

      const createSubmitBtn = page
        .getByRole('button', { name: /Create Snapshot|创建快照/i })
        .last();
      await createSubmitBtn.click();

      // 7. Assert: Snapshot is created locally and visible in UI
      await expect(page.getByText(snapshotLabel)).toBeVisible();

      // Assert: UI shows outbox pending badge
      await expect(page.getByText(/1 (pending|个待同步)/i)).toBeVisible();

      // 8. Assert: IndexedDB state while offline
      const idbOfflineState = await getIndexedDbState(page);

      const pendingSnapshot = idbOfflineState.snapshots.find(
        (s) => s.snapshot?.meta?.label === snapshotLabel
      );
      expect(pendingSnapshot).toBeDefined();
      expect(pendingSnapshot.status).toBe('pending_upload');
      expect(pendingSnapshot.instanceId).toBe(registeredInstanceId);

      const pendingTask = idbOfflineState.outbox.find(
        (t) => t.snapshotId === pendingSnapshot.id
      );
      expect(pendingTask).toBeDefined();
      expect(pendingTask.action).toBe('upload');
      expect(pendingTask.instanceId).toBe(registeredInstanceId);

      // 9. Assert: Server storage has NOT received this snapshot file while offline
      const serverSnapsBeforeSyncRes = await request.get(
        `/api/managed/instances/${registeredInstanceId}/snapshots`
      );
      expect(serverSnapsBeforeSyncRes.status()).toBe(200);
      const serverSnapsBeforeSync = await serverSnapsBeforeSyncRes.json();
      expect(
        serverSnapsBeforeSync.some((s: any) => s.id === pendingSnapshot.id)
      ).toBe(false);

      // 10. Simulate network recovery
      await context.setOffline(false);

      // 11. Trigger Outbox automatic sync via browser online event
      const [uploadResponse] = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.url().includes(`/api/managed/instances/${registeredInstanceId}/snapshots/${pendingSnapshot.id}`) &&
            res.request().method() === 'PUT'
        ),
        page.evaluate(() => window.dispatchEvent(new Event('online'))),
      ]);

      expect(uploadResponse.status()).toBe(200);

      // 12. Assert: Security Sniffer validation on upload payload
      const uploadReq = sniffer
        .getManagedRequests()
        .find(
          (r) =>
            r.url.includes(`/snapshots/${pendingSnapshot.id}`) &&
            r.method === 'PUT'
        );
      expect(uploadReq).toBeDefined();
      expect(uploadReq?.postDataJson).toBeDefined();
      expect(uploadReq?.postDataJson.ciphertext).toBeTruthy();
      expect(uploadReq?.postDataJson.cipher.iv).toBeTruthy();
      expect(uploadReq?.postDataJson.kdf.salt).toBeTruthy();
      // Zero-knowledge redline: no plaintexts or unencrypted fields
      expect(uploadReq?.postDataJson.user_rules).toBeUndefined();
      expect(uploadReq?.postDataJson.data).toBeUndefined();
      expect(uploadReq?.postData).not.toContain(SENSITIVE_RULE);
      expect(uploadReq?.postData).not.toContain(AGH_PASSWORD);
      sniffer.assertClean();

      // 13. Assert: IndexedDB outbox queue is cleared and status is 'synced'
      await expect
        .poll(async () => {
          return pollIndexedDbSyncState(page, pendingSnapshot.id);
        })
        .toEqual({ outboxCount: 0, status: 'synced' });

      // Assert: UI updates to All Synced
      await expect(page.getByText(/All Synced|全部已同步/i)).toBeVisible();

      // 14. Assert: Server storage contains the snapshot record
      const serverSnapsAfterSyncRes = await request.get(
        `/api/managed/instances/${registeredInstanceId}/snapshots`
      );
      expect(serverSnapsAfterSyncRes.status()).toBe(200);
      const serverSnapsAfterSync = await serverSnapsAfterSyncRes.json();
      expect(
        serverSnapsAfterSync.some((s: any) => s.id === pendingSnapshot.id)
      ).toBe(true);
    } finally {
      // 15. Cleanup: Delete registered instance from server and destroy browser context
      if (registeredInstanceId) {
        await request.delete(`/api/managed/instances/${registeredInstanceId}`);
      }
      await context.close();
    }
  });

  test('creates snapshot while offline and syncs via UI "Sync now" button upon network recovery', async ({
    browser,
    request,
  }) => {
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const instanceLabel = `Router-Offline-Manual-${randomSuffix}`;
    const snapshotLabel = `Offline Snapshot Manual ${randomSuffix}`;

    const context = await browser.newContext();
    const page = await context.newPage();
    let registeredInstanceId = '';

    try {
      const sniffer = attachSecuritySniffer(page, {
        forbiddenPlaintexts: [AGH_PASSWORD, SENSITIVE_RULE],
      });

      await setupAghMock(page, {
        validPassword: AGH_PASSWORD,
        userRules: [SENSITIVE_RULE],
      });

      await page.goto('/login');
      const managedTab = page.getByRole('button', { name: /Managed Mode|托管模式/i });
      await managedTab.click();

      const registerNewBtn = page
        .getByRole('button', {
          name: /Register (new |Managed )?Instance|登记新托管实例/i,
        })
        .first();
      await registerNewBtn.click();

      await page.getByPlaceholder('http://192.168.1.2:3000').fill(AGH_URL);
      await page.getByPlaceholder('admin').fill(AGH_USER);
      await page.getByPlaceholder('••••••••').fill(AGH_PASSWORD);
      await page.getByPlaceholder(/Instance Name|实例名称/i).fill(instanceLabel);

      const registerSubmitBtn = page.getByRole('button', {
        name: /Register & Connect|登记并进入/i,
      });
      const [regResponse] = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.url().includes('/api/managed/instances') &&
            res.request().method() === 'POST'
        ),
        registerSubmitBtn.click(),
      ]);
      const regResult = await regResponse.json();
      registeredInstanceId = regResult.instance.id;

      await expect(page).toHaveURL(/http:\/\/[^/]+\/?$/);

      await page.goto('/settings/snapshots');
      await expect(page).toHaveURL(/\/settings\/snapshots/);

      const createSnapBtn = page
        .getByRole('button', { name: /Create Snapshot|创建快照/i })
        .first();
      await expect(createSnapBtn).toBeVisible();

      // 1. Disconnect network
      await context.setOffline(true);

      // 2. Create snapshot while offline
      await createSnapBtn.click();
      const snapLabelInput = page.getByPlaceholder(
        /Before changing upstream DNS|例如修改上游 DNS 前/i
      );
      await snapLabelInput.fill(snapshotLabel);
      await page
        .getByRole('button', { name: /Create Snapshot|创建快照/i })
        .last()
        .click();

      await expect(page.getByText(snapshotLabel)).toBeVisible();
      await expect(page.getByText(/1 (pending|个待同步)/i)).toBeVisible();

      // 3. Directly verify IndexedDB state while offline
      const idbOfflineState = await getIndexedDbState(page);
      const pendingSnapshot = idbOfflineState.snapshots.find(
        (s) => s.snapshot?.meta?.label === snapshotLabel
      );
      expect(pendingSnapshot).toBeDefined();
      expect(pendingSnapshot.status).toBe('pending_upload');
      expect(pendingSnapshot.instanceId).toBe(registeredInstanceId);

      const pendingTask = idbOfflineState.outbox.find(
        (t) => t.snapshotId === pendingSnapshot.id
      );
      expect(pendingTask).toBeDefined();
      expect(pendingTask.action).toBe('upload');
      expect(pendingTask.instanceId).toBe(registeredInstanceId);

      // 4. Assert server does not have snapshot yet while offline
      const serverSnapsBeforeSyncRes = await request.get(
        `/api/managed/instances/${registeredInstanceId}/snapshots`
      );
      expect(serverSnapsBeforeSyncRes.status()).toBe(200);
      const serverSnapsBeforeSync = await serverSnapsBeforeSyncRes.json();
      expect(
        serverSnapsBeforeSync.some((s: any) => s.id === pendingSnapshot.id)
      ).toBe(false);

      // 5. Recover network
      await context.setOffline(false);

      // 6. Sync via UI button
      const syncButton = page.getByRole('button', { name: /Sync now|立即同步/i });
      await expect(syncButton).toBeVisible();

      const [uploadResponse] = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.url().includes(`/snapshots/${pendingSnapshot.id}`) &&
            res.request().method() === 'PUT'
        ),
        syncButton.click(),
      ]);

      expect(uploadResponse.status()).toBe(200);

      // 7. Security Sniffer verification on upload payload
      const uploadReq = sniffer
        .getManagedRequests()
        .find(
          (r) =>
            r.url.includes(`/snapshots/${pendingSnapshot.id}`) &&
            r.method === 'PUT'
        );
      expect(uploadReq).toBeDefined();
      expect(uploadReq?.postDataJson).toBeDefined();
      expect(uploadReq?.postDataJson.ciphertext).toBeTruthy();
      expect(uploadReq?.postDataJson.cipher.iv).toBeTruthy();
      expect(uploadReq?.postDataJson.kdf.salt).toBeTruthy();
      expect(uploadReq?.postDataJson.user_rules).toBeUndefined();
      expect(uploadReq?.postDataJson.data).toBeUndefined();
      expect(uploadReq?.postData).not.toContain(SENSITIVE_RULE);
      expect(uploadReq?.postData).not.toContain(AGH_PASSWORD);
      sniffer.assertClean();

      // 8. Assert IndexedDB outbox queue is cleared and status is 'synced'
      await expect
        .poll(async () => {
          return pollIndexedDbSyncState(page, pendingSnapshot.id);
        })
        .toEqual({ outboxCount: 0, status: 'synced' });

      // 9. Verify UI updates to All Synced
      await expect(page.getByText(/All Synced|全部已同步/i)).toBeVisible();

      // 10. Assert server contains snapshot file
      const serverSnapsAfterSyncRes = await request.get(
        `/api/managed/instances/${registeredInstanceId}/snapshots`
      );
      expect(serverSnapsAfterSyncRes.status()).toBe(200);
      const serverSnapsAfterSync = await serverSnapsAfterSyncRes.json();
      expect(
        serverSnapsAfterSync.some((s: any) => s.id === pendingSnapshot.id)
      ).toBe(true);
    } finally {
      // 11. Cleanup: Delete registered instance from server and close context
      if (registeredInstanceId) {
        await request.delete(`/api/managed/instances/${registeredInstanceId}`);
      }
      await context.close();
    }
  });
});
