import { test, expect } from 'playwright/test';
import { attachSecuritySniffer } from './helpers/securitySniffer';
import { setupAghMock } from './helpers/mockAgh';

test.describe('Scenario 2: Dual-Device Zero-Knowledge Sync and Anti-fragile Decryption', () => {
  const AGH_PASSWORD = 'SuperSecretPassword#2026';
  const WRONG_PASSWORD = 'WrongPassword#999';
  const SENSITIVE_RULE = '||custom-blocked-ads-tracker.corp^';
  const AGH_URL = 'http://192.168.1.1:3000';
  const AGH_USER = 'admin';

  test('cross-device zero-knowledge registration, encrypted sync, and anti-fragile recovery', async ({
    browser,
  }) => {
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const instanceLabel = `Router-Sync-${randomSuffix}`;

    // =========================================================================
    // DEVICE A: Setup & Registration & Snapshot Upload
    // =========================================================================
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    // 1. Attach security sniffer with forbidden plaintext secrets
    const snifferA = attachSecuritySniffer(pageA, {
      forbiddenPlaintexts: [AGH_PASSWORD, SENSITIVE_RULE],
    });

    // Setup AGH mocks on Device A with the sensitive rule
    await setupAghMock(pageA, {
      validPassword: AGH_PASSWORD,
      userRules: [SENSITIVE_RULE],
    });

    // 2. Device A navigates to /login and switches to Managed Mode
    await pageA.goto('/login');
    await expect(pageA).toHaveURL(/\/login/);

    const managedTabA = pageA.getByRole('button', { name: /Managed Mode|托管模式/i });
    await managedTabA.click();

    // 3. Click "Register Managed Instance"
    const registerNewBtnA = pageA.getByRole('button', {
      name: /Register (new |Managed )?Instance|登记新托管实例/i,
    }).first();
    await expect(registerNewBtnA).toBeVisible();
    await registerNewBtnA.click();

    // 4. Fill in instance registration details
    const serverInputA = pageA.getByPlaceholder('http://192.168.1.2:3000');
    const userInputA = pageA.getByPlaceholder('admin');
    const passwordInputA = pageA.getByPlaceholder('••••••••');
    const labelInputA = pageA.getByPlaceholder(/Instance Name|实例名称/i);

    await serverInputA.fill(AGH_URL);
    await userInputA.fill(AGH_USER);
    await passwordInputA.fill(AGH_PASSWORD);
    await labelInputA.fill(instanceLabel);

    // 5. Submit registration and wait for server response
    const registerSubmitBtnA = pageA.getByRole('button', {
      name: /Register & Connect|登记并进入/i,
    });
    await expect(registerSubmitBtnA).toBeEnabled();

    const [regResponse] = await Promise.all([
      pageA.waitForResponse(
        (res) =>
          res.url().includes('/api/managed/instances') &&
          res.request().method() === 'POST'
      ),
      registerSubmitBtnA.click(),
    ]);

    expect(regResponse.status()).toBe(200);
    const regResult = await regResponse.json();
    expect(regResult.ok).toBe(true);
    const registeredInstanceId = regResult.instance.id;
    expect(registeredInstanceId).toBeTruthy();

    // 6. Security Sniffer verification on Device A registration
    const regReq = snifferA
      .getManagedRequests()
      .find(
        (r) =>
          r.url.includes('/api/managed/instances') && r.method === 'POST'
      );
    expect(regReq).toBeDefined();
    expect(regReq?.postDataJson).toBeDefined();
    expect(regReq?.postDataJson.label).toBe(instanceLabel);
    expect(regReq?.postDataJson.username).toBe(AGH_USER);
    expect(regReq?.postDataJson.salt).toBeDefined();
    // Strict redline: password must NEVER be in registration payload
    expect(regReq?.postDataJson.password).toBeUndefined();
    expect(regReq?.postData).not.toContain(AGH_PASSWORD);
    snifferA.assertClean();

    // 7. Verify Device A navigated to root dashboard
    await expect(pageA).toHaveURL(/http:\/\/[^/]+\/?$/);
    await expect(pageA).not.toHaveURL(/\/login/);

    // 8. Device A creates a snapshot with custom rules
    await pageA.goto('/settings/snapshots');

    const createSnapBtnA = pageA
      .getByRole('button', { name: /Create Snapshot|创建快照/i })
      .first();
    await expect(createSnapBtnA).toBeVisible();
    await createSnapBtnA.click();

    // Fill snapshot label in creation sheet
    const snapLabelInput = pageA.getByPlaceholder(
      /Before changing upstream DNS|例如修改上游 DNS 前/i
    );
    await expect(snapLabelInput).toBeVisible();
    await snapLabelInput.fill('Snapshot with Custom Rules');

    // Confirm creation and intercept the snapshot upload PUT
    const [uploadResponse] = await Promise.all([
      pageA.waitForResponse(
        (res) =>
          res.url().includes('/snapshots/') &&
          (res.request().method() === 'PUT' || res.request().method() === 'POST')
      ),
      pageA
        .getByRole('button', { name: /Create Snapshot|创建快照/i })
        .last()
        .click(),
    ]);

    expect(uploadResponse.status()).toBe(200);

    // Verify snapshot appears in Device A UI
    await expect(pageA.getByText('Snapshot with Custom Rules')).toBeVisible();

    // 9. Security Sniffer verification on snapshot upload payload
    const uploadReq = snifferA
      .getManagedRequests()
      .find((r) => r.url.includes('/snapshots/') && r.method === 'PUT');
    expect(uploadReq).toBeDefined();
    expect(uploadReq?.postDataJson).toBeDefined();
    // Payload must adhere to zero-knowledge standard: ciphertext, kdf, cipher
    expect(uploadReq?.postDataJson.ciphertext).toBeTruthy();
    expect(uploadReq?.postDataJson.cipher.iv).toBeTruthy();
    expect(uploadReq?.postDataJson.kdf.salt).toBeTruthy();
    // Redline: Unencrypted rule plaintexts or passwords must NEVER appear anywhere in request
    expect(uploadReq?.postDataJson.user_rules).toBeUndefined();
    expect(uploadReq?.postDataJson.data).toBeUndefined();
    expect(uploadReq?.postData).not.toContain(SENSITIVE_RULE);
    expect(uploadReq?.postData).not.toContain(AGH_PASSWORD);
    snifferA.assertClean();

    // =========================================================================
    // DEVICE B: Independent Clean Context (Simulating New Device)
    // =========================================================================
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    // Monitor unhandled rejections / page errors on Device B
    const pageErrorsB: Error[] = [];
    pageB.on('pageerror', (err) => pageErrorsB.push(err));

    const snifferB = attachSecuritySniffer(pageB, {
      forbiddenPlaintexts: [AGH_PASSWORD, SENSITIVE_RULE, WRONG_PASSWORD],
    });

    await setupAghMock(pageB, {
      validPassword: AGH_PASSWORD,
      userRules: [SENSITIVE_RULE],
    });

    // 10. Device B opens /login and switches to Managed Mode
    await pageB.goto('/login');
    await expect(pageB).toHaveURL(/\/login/);

    const managedTabB = pageB.getByRole('button', { name: /Managed Mode|托管模式/i });
    await managedTabB.click();

    // 11. Verify Device B discovers the instance registered by Device A
    const instanceCardB = pageB.getByText(instanceLabel);
    await expect(instanceCardB).toBeVisible();

    // 12. Click instance to enter Activation Phase
    await instanceCardB.click();
    await expect(
      pageB.getByText(/Activate Instance Session|激活实例会话/i)
    ).toBeVisible();

    const activationPasswordInputB = pageB.getByPlaceholder('••••••••');
    await expect(activationPasswordInputB).toBeVisible();

    // =========================================================================
    // Anti-Fragile Test: Wrong Password Attempt on Device B
    // =========================================================================
    await activationPasswordInputB.fill(WRONG_PASSWORD);
    const activateButtonB = pageB.getByRole('button', {
      name: /Activate & Connect|激活并连接/i,
    });
    await activateButtonB.click();

    // Assert: UI displays graceful error message
    await expect(
      pageB.getByText(
        /Incorrect username or password|用户名或密码错误|无法连接/i
      )
    ).toBeVisible();

    // Assert: Device B stays on /login and does not enter dashboard
    await expect(pageB).toHaveURL(/\/login/);

    // Assert: Absolutely no unhandled rejections or crashes
    expect(pageErrorsB).toHaveLength(0);

    // Assert: IndexedDB on Device B does NOT contain any decrypted or corrupt snapshot data
    const idbDataAfterWrongPass = await pageB.evaluate(async () => {
      if (typeof indexedDB.databases === 'function') {
        const dbs = await indexedDB.databases();
        const hasDb = dbs.some((d) => d.name === 'agh_console_snapshots');
        if (!hasDb) return [];
      }
      return new Promise<any[]>((resolve) => {
        const req = indexedDB.open('agh_console_snapshots');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('managed_snapshots')) {
            db.close();
            return resolve([]);
          }
          const tx = db.transaction('managed_snapshots', 'readonly');
          const store = tx.objectStore('managed_snapshots');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            db.close();
            resolve(getAll.result);
          };
          getAll.onerror = () => {
            db.close();
            resolve([]);
          };
        };
        req.onerror = () => resolve([]);
      });
    });
    expect(idbDataAfterWrongPass.filter((r) => r.snapshot)).toHaveLength(0);

    // =========================================================================
    // Happy Path: Correct Password Activation & Snapshot Restoration
    // =========================================================================
    await activationPasswordInputB.fill(AGH_PASSWORD);
    await activateButtonB.click();

    // Assert: Successfully activated and redirected to dashboard
    await expect(pageB).toHaveURL(/http:\/\/[^/]+\/?$/);
    await expect(pageB).not.toHaveURL(/\/login/);

    // 13. Navigate to Snapshots settings on Device B
    await pageB.goto('/settings/snapshots');
    

    // Assert: Restored snapshot is visible on Device B
    await expect(pageB.getByText('Snapshot with Custom Rules')).toBeVisible();

    // 14. Verify full zero-knowledge decryption in Device B storage
    const restoredSnapshot = await pageB.evaluate(async () => {
      return new Promise<any>((resolve) => {
        const req = indexedDB.open('agh_console_snapshots', 2);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('managed_snapshots')) {
            db.close();
            return resolve(null);
          }
          const tx = db.transaction('managed_snapshots', 'readonly');
          const store = tx.objectStore('managed_snapshots');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const recs = getAll.result || [];
            const found = recs.find(
              (r: any) =>
                r.snapshot?.meta?.label === 'Snapshot with Custom Rules'
            );
            db.close();
            resolve(found ? found.snapshot : null);
          };
          getAll.onerror = () => {
            db.close();
            resolve(null);
          };
        };
        req.onerror = () => resolve(null);
      });
    });

    expect(restoredSnapshot).not.toBeNull();
    expect(restoredSnapshot.meta.label).toBe('Snapshot with Custom Rules');
    expect(restoredSnapshot.data.user_rules).toContain(SENSITIVE_RULE);

    // Redline: Verify neither sniffer detected any security leaks
    snifferA.assertClean();
    snifferB.assertClean();
    expect(pageErrorsB).toHaveLength(0);

    // Cleanup: Remove registered instance from server
    await pageA.request.delete(`/api/managed/instances/${registeredInstanceId}`);

    await contextA.close();
    await contextB.close();
  });
});
