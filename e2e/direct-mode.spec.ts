import { test, expect } from 'playwright/test';
import { attachSecuritySniffer } from './helpers/securitySniffer';
import { setupAghMock } from './helpers/mockAgh';

test.describe('Scenario 1: Direct Mode Isolation and Session Lifecycle', () => {
  const DIRECT_PASSWORD = 'DirectSecretPassword#2026!';
  const AGH_SERVER_URL = 'http://192.168.1.100:3000';
  const AGH_USERNAME = 'admin';

  test('enforces strict direct mode isolation, tab FSM reset, and clean session logout', async ({
    page,
  }) => {
    // 1. Attach security sniffer to monitor network requests
    const sniffer = attachSecuritySniffer(page, {
      forbiddenPlaintexts: [DIRECT_PASSWORD],
      throwImmediately: true,
    });

    // Setup AGH upstream mocks
    await setupAghMock(page, {
      validPassword: DIRECT_PASSWORD,
    });

    // 2. Navigate to /login
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);

    // 3. Verify Direct Mode is the default active tab
    const directTab = page.getByRole('button', { name: /Direct Mode|直连模式/i });
    const managedTab = page.getByRole('button', { name: /Managed Mode|托管模式/i });
    await expect(directTab).toBeVisible();
    await expect(managedTab).toBeVisible();

    // Verify Direct form fields are visible
    const serverInput = page.getByPlaceholder('http://192.168.1.2:3000');
    const userInput = page.getByPlaceholder('admin');
    const passwordInput = page.getByPlaceholder('••••••••');
    const connectButton = page.getByRole('button', { name: /Connect|连接/i });

    await expect(serverInput).toBeVisible();
    await expect(userInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(connectButton).toBeVisible();

    // Initial direct view must trigger absolute zero /api/managed/* requests
    expect(sniffer.getManagedRequests().length).toBe(0);

    // 4. Test Direct <-> Managed Tab switching and FSM reset
    // Fill partial inputs in Direct mode
    await serverInput.fill('http://temp.test:3000');
    await userInput.fill('tempuser');

    // Switch to Managed Mode tab
    await managedTab.click();
    await expect(page.getByText(/Console Server Address|Console 服务端地址/i)).toBeVisible();
    await expect(serverInput).not.toBeVisible();

    // Switch back to Direct Mode tab
    await directTab.click();
    await expect(serverInput).toBeVisible();
    await expect(userInput).toBeVisible();

    // Verify unsubmitted form state was cleanly reset
    expect(await userInput.inputValue()).toBe('');

    // Redline: Clear sniffer to monitor clean direct login and subsequent lifecycle
    sniffer.clear();

    // 5. Connect via Direct Mode
    await serverInput.fill(AGH_SERVER_URL);
    await userInput.fill(AGH_USERNAME);
    await passwordInput.fill(DIRECT_PASSWORD);

    await expect(connectButton).toBeEnabled();
    await connectButton.click();

    // 6. Assert: Successfully redirected to root dashboard
    await expect(page).toHaveURL(/http:\/\/[^/]+\/?$/);
    await expect(page).not.toHaveURL(/\/login/);

    // Assert: localStorage has instances and active session
    const storedConfig = await page.evaluate(() => localStorage.getItem('agh.console.cfg.v2'));
    expect(storedConfig).not.toBeNull();
    const parsedStore = JSON.parse(storedConfig!);
    expect(parsedStore.instances).toHaveLength(1);
    expect(parsedStore.instances[0].endpoints[0].url).toBe(AGH_SERVER_URL);
    expect(parsedStore.instances[0].endpoints[0].username).toBe(AGH_USERNAME);
    expect(parsedStore.instances[0].managed).toBeUndefined();
    expect(parsedStore.activeId).toBe(parsedStore.instances[0].id);

    // 7. Strict Redline assertion: Absolute zero /api/managed/* requests were issued during direct login & dashboard view
    const managedRequests = sniffer.getManagedRequests();
    expect(managedRequests.length).toBe(0);
    sniffer.assertClean();

    // 8. Session teardown / Logout flow:
    // Navigate to instance management in settings
    await page.goto('/settings/server');
    await expect(page.getByText(AGH_SERVER_URL)).toBeVisible();

    // Toggle Manage mode
    const manageButton = page.getByRole('button', { name: /Manage|管理/i });
    await expect(manageButton).toBeVisible();
    await manageButton.click();

    // Click delete instance button
    const deleteButton = page.getByRole('button', { name: /Delete|删除/i }).first();
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Confirm deletion in sheet
    const confirmDeleteButton = page.getByRole('button', { name: /Delete instance|删除实例/i });
    await expect(confirmDeleteButton).toBeVisible();
    await confirmDeleteButton.click();

    // Assert: Redirected back to /login
    await expect(page).toHaveURL(/\/login/);

    // Assert: localStorage is wiped clean
    const postLogoutStore = await page.evaluate(() => localStorage.getItem('agh.console.cfg.v2'));
    expect(postLogoutStore).toBeNull();

    // Re-verify direct form is visible again
    await expect(page.getByRole('button', { name: /Connect|连接/i })).toBeVisible();

    // Assert: Zero /api/managed/* requests throughout the entire direct lifecycle
    expect(sniffer.getManagedRequests().length).toBe(0);
    sniffer.assertClean();
  });
});
