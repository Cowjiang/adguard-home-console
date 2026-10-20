import type { Page } from 'playwright/test';

export interface MockAghOptions {
  /** If provided, requests with basic auth headers are checked against this password */
  validPassword?: string;
  /** Custom user rules returned by /api/agh/filtering/status */
  userRules?: string[];
  /** Upstream DNS list returned by /api/agh/dns_info */
  upstreamDns?: string[];
  /** AGH server version */
  version?: string;
}

/**
 * Sets up Playwright route interception for AdGuard Home upstream proxy calls (`/api/agh/**`).
 * Provides deterministic mock responses for status, stats, filtering, clients, and general endpoints.
 */
export async function setupAghMock(page: Page, options: MockAghOptions = {}) {
  const {
    validPassword,
    userRules = ['||default-blocked-domain.test^'],
    upstreamDns = ['1.1.1.1', '8.8.8.8'],
    version = '0.107.50',
  } = options;

  await page.route('**/api/agh/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    // 1. Check basic auth if validPassword is provided
    if (validPassword !== undefined) {
      const auth = req.headers()['authorization'] || '';
      const expectedAuth = 'Basic ' + Buffer.from(`admin:${validPassword}`).toString('base64');
      if (auth && auth !== expectedAuth) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Unauthorized: invalid credentials' }),
        });
        return;
      }
    }

    // 2. /api/agh/status
    if (url.includes('/api/agh/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version,
          language: 'en',
          dns_addresses: ['127.0.0.1'],
          dns_port: 53,
          http_port: 3000,
          protection_enabled: true,
          protection_disabled_duration: 0,
          dhcp_available: false,
          running: true,
          start_time: 1700000000,
        }),
      });
      return;
    }

    // 3. /api/agh/filtering/status
    if (url.includes('/api/agh/filtering/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          interval: 24,
          filters: [
            {
              id: 1,
              name: 'AdGuard Base filter',
              url: 'https://filters.adtidy.org/extension/chromium/filters/2.txt',
              enabled: true,
              rules_count: 50000,
              last_updated: '2026-10-18T00:00:00Z',
            },
          ],
          whitelist_filters: [],
          user_rules: userRules,
        }),
      });
      return;
    }

    // 4. /api/agh/dns_info
    if (url.includes('/api/agh/dns_info')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          upstream_dns: upstreamDns,
          upstream_dns_file: '',
          bootstraps: ['9.9.9.9'],
          protection_enabled: true,
          blocking_mode: 'default',
          blocking_ipv4: '',
          blocking_ipv6: '',
          edns_cs_enabled: false,
          dnssec_enabled: true,
          cache_size: 4194304,
          cache_ttl_min: 0,
          cache_ttl_max: 0,
          cache_optimistic: false,
        }),
      });
      return;
    }

    // 5. /api/agh/stats
    if (url.includes('/api/agh/stats')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          time_units: 'hours',
          num_dns_queries: 1234,
          num_blocked_filtering: 89,
          num_replaced_safebrowsing: 0,
          num_replaced_safesearch: 0,
          num_replaced_parental: 0,
          avg_processing_time: 0.015,
          dns_queries: [100, 150, 200, 250],
          blocked_filtering: [5, 10, 8, 12],
          replaced_safebrowsing: [],
          replaced_parental: [],
          top_queried_domains: [{ 'example.com': 150 }],
          top_blocked_domains: [{ 'tracker.test': 45 }],
          top_clients: [{ '192.168.1.100': 300 }],
          top_upstreams_responses: [{ '1.1.1.1': 500 }],
          top_upstreams_avg_time: [{ '1.1.1.1': 0.012 }],
        }),
      });
      return;
    }

    // 6. /api/agh/clients
    if (url.includes('/api/agh/clients')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clients: [],
          auto_clients: [],
          supported_tags: [],
        }),
      });
      return;
    }

    // 7. /api/agh/rewrite/list
    if (url.includes('/api/agh/rewrite/list')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    // 8. /api/agh/access/list
    if (url.includes('/api/agh/access/list')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          allowed_clients: [],
          disallowed_clients: [],
          blocked_hosts: [],
        }),
      });
      return;
    }

    // 9. /api/agh/querylog/config & /api/agh/querylog_info
    if (url.includes('/api/agh/querylog/config') || url.includes('/api/agh/querylog_info')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          interval: 604800000,
          anonymize_client_ip: false,
          ignored: [],
          ignored_enabled: false,
        }),
      });
      return;
    }

    // 10. /api/agh/stats/config & /api/agh/stats_info
    if (url.includes('/api/agh/stats/config') || url.includes('/api/agh/stats_info')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          interval: 604800000,
          ignored: [],
          ignored_enabled: false,
        }),
      });
      return;
    }

    // 11. /api/agh/blocked_services/all
    if (url.includes('/api/agh/blocked_services/all')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          blocked_services: [],
        }),
      });
      return;
    }

    // 12. /api/agh/safesearch/status
    if (url.includes('/api/agh/safesearch/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: false,
        }),
      });
      return;
    }

    // Default fallback 200 OK
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}
