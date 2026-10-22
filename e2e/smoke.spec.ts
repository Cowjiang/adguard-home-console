import { test, expect } from 'playwright/test';
import { attachSecuritySniffer } from './helpers/securitySniffer';

test.describe('E2E Infrastructure Smoke Test', () => {
  test('redirects unauthenticated user from / to /login and renders console heading', async ({
    page,
  }) => {
    // Attach security sniffer to monitor all /api/managed/* requests
    const sniffer = attachSecuritySniffer(page, {
      forbiddenPlaintexts: ['SuperSecretPassword123!', 'UnencryptedRuleTest'],
    });

    // 1. Visit root '/'
    await page.goto('/');

    // 2. Expect automatic redirect to '/login'
    await expect(page).toHaveURL(/\/login/);

    // 3. Check page title contains console branding
    await expect(page).toHaveTitle(/AGH Console|AdGuard Home/i);

    // 4. Check main heading contains console name
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/AGH Console|AdGuard Home/i);

    // 5. Assert that no security violations or plain text leaks occurred
    sniffer.assertNoViolations();
  });

  test('managed server status endpoint confirms running in isolated test data directory', async ({
    request,
  }) => {
    const res = await request.get('/api/managed/status');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.managed).toBe(true);
    expect(body.dataDir).toContain('test-results');
  });

  test('security sniffer catches plaintext leaks and reports violations', async ({ page }) => {
    await page.goto('/login');

    const sniffer = attachSecuritySniffer(page, {
      forbiddenPlaintexts: ['LeakSecretPassword999'],
    });

    // Dispatch a request containing forbidden plaintext
    await page.evaluate(async () => {
      try {
        await fetch('/api/managed/instances?leak=LeakSecretPassword999');
      } catch {}
    });

    expect(sniffer.violations.length).toBeGreaterThan(0);
    expect(sniffer.violations[0].type).toBe('PLAINTEXT_LEAK');
    expect(() => sniffer.assertNoViolations()).toThrow(/PLAINTEXT_LEAK/);

    sniffer.clear();
    expect(sniffer.violations.length).toBe(0);
    expect(() => sniffer.assertNoViolations()).not.toThrow();
  });
});
