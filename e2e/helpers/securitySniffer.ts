import type { Page, Request } from 'playwright/test';

export interface SecurityViolation {
  type: 'PLAINTEXT_LEAK' | 'INVALID_ENCRYPTION_PAYLOAD' | 'PROHIBITED_KEY_FOUND';
  message: string;
  url: string;
  method: string;
  detail?: any;
}

export interface InspectedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData: string | null;
  postDataJson: any | null;
  timestamp: number;
}

export interface SecuritySnifferOptions {
  /** List of forbidden plaintext strings (e.g. passwords, secrets) that must never appear anywhere in managed requests */
  forbiddenPlaintexts?: string[];
  /** Whether to throw immediately when a violation occurs during request lifecycle (default: false, collects into violations array) */
  throwImmediately?: boolean;
}

/** Standard Base64 regex for ciphertext validation */
export const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Blackbox Security Sniffer for /api/managed/* requests.
 * Intercepts, records, and verifies that no plaintext secrets leak
 * across body, headers, or query string, and enforces that snapshot
 * upload payloads satisfy end-to-end zero-knowledge encryption contracts.
 */
export class SecuritySniffer {
  private page: Page;
  private forbiddenPlaintexts: Set<string>;
  private throwImmediately: boolean;
  public violations: SecurityViolation[] = [];
  public managedRequests: InspectedRequest[] = [];
  private requestListener: (req: Request) => void;

  constructor(page: Page, options: SecuritySnifferOptions = {}) {
    this.page = page;
    this.forbiddenPlaintexts = new Set(
      (options.forbiddenPlaintexts || []).filter((s) => typeof s === 'string' && s.length > 0)
    );
    this.throwImmediately = options.throwImmediately ?? false;

    this.requestListener = (request: Request) => this.handleRequest(request);
    this.page.on('request', this.requestListener);
  }

  /**
   * Adds additional sensitive strings to the forbidden plaintext blacklist.
   */
  public addForbiddenStrings(strings: string[]): void {
    for (const str of strings) {
      if (typeof str === 'string' && str.length > 0) {
        this.forbiddenPlaintexts.add(str);
      }
    }
  }

  /**
   * Handler for outgoing browser requests.
   */
  private handleRequest(request: Request): void {
    const url = request.url();

    // Only monitor requests directed towards /api/managed/*
    if (!url.includes('/api/managed/')) {
      return;
    }

    const method = request.method();
    const headers = request.headers();
    const postData = request.postData();
    let postDataJson: any = null;

    if (postData) {
      try {
        postDataJson = JSON.parse(postData);
      } catch {
        postDataJson = null;
      }
    }

    const record: InspectedRequest = {
      url,
      method,
      headers,
      postData,
      postDataJson,
      timestamp: Date.now(),
    };
    this.managedRequests.push(record);

    // 1. Audit URL & Query for plaintext leaks
    let decodedUrl = url;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      // keep raw url if decode fails
    }

    for (const secret of this.forbiddenPlaintexts) {
      if (url.includes(secret) || decodedUrl.includes(secret)) {
        this.recordViolation({
          type: 'PLAINTEXT_LEAK',
          message: `Forbidden plaintext secret found in request URL: ${url}`,
          url,
          method,
        });
      }
    }

    // 2. Audit Headers for plaintext leaks
    for (const [key, val] of Object.entries(headers)) {
      let decodedVal = val;
      try {
        decodedVal = decodeURIComponent(val);
      } catch {
        // keep raw value
      }

      for (const secret of this.forbiddenPlaintexts) {
        if (val.includes(secret) || decodedVal.includes(secret)) {
          this.recordViolation({
            type: 'PLAINTEXT_LEAK',
            message: `Forbidden plaintext secret found in header '${key}': ${val}`,
            url,
            method,
          });
        }
      }
    }

    // 3. Audit Body / PostData for plaintext leaks
    if (postData) {
      let decodedBody = postData;
      try {
        decodedBody = decodeURIComponent(postData);
      } catch {
        // keep raw body
      }

      for (const secret of this.forbiddenPlaintexts) {
        if (postData.includes(secret) || decodedBody.includes(secret)) {
          this.recordViolation({
            type: 'PLAINTEXT_LEAK',
            message: `Forbidden plaintext secret found in request body`,
            url,
            method,
            detail: { matchedSecret: secret },
          });
        }
      }
    }

    // 4. Audit instance registration for prohibited keys (e.g. password field)
    const isInstanceRegistration = /\/api\/managed\/instances(?:\/|\?|#|$)/.test(url) && (method === 'POST' || method === 'PUT');
    if (isInstanceRegistration) {
      if (postDataJson && typeof postDataJson === 'object') {
        if ('password' in postDataJson) {
          this.recordViolation({
            type: 'PROHIBITED_KEY_FOUND',
            message: `Prohibited 'password' field detected in instance registration payload`,
            url,
            method,
          });
        }
      }
    }

    // 5. Audit Snapshot upload payload encryption specifications
    // PUT /api/managed/instances/:id/snapshots/:snapshotId
    const isSnapshotUpload =
      /\/api\/managed\/instances\/[^/]+\/snapshots\/[^/?#]+(?:\/|\?|#|$)/.test(url) &&
      (method === 'PUT' || method === 'POST');

    if (isSnapshotUpload) {
      this.validateSnapshotUploadPayload(url, method, postData, postDataJson);
    }
  }

  /**
   * Validates snapshot upload payload against zero-knowledge encryption contract.
   */
  private validateSnapshotUploadPayload(
    url: string,
    method: string,
    postData: string | null,
    json: any
  ): void {
    if (!postData || !json || typeof json !== 'object' || Array.isArray(json)) {
      this.recordViolation({
        type: 'INVALID_ENCRYPTION_PAYLOAD',
        message: 'Snapshot upload payload must be a non-empty JSON object',
        url,
        method,
      });
      return;
    }

    // Check ciphertext
    if (
      typeof json.ciphertext !== 'string' ||
      !json.ciphertext.trim() ||
      !BASE64_REGEX.test(json.ciphertext.trim())
    ) {
      this.recordViolation({
        type: 'INVALID_ENCRYPTION_PAYLOAD',
        message: 'Snapshot payload missing valid Base64 ciphertext',
        url,
        method,
        detail: { ciphertext: json.ciphertext },
      });
    }

    // Check KDF specification
    if (
      !json.kdf ||
      typeof json.kdf !== 'object' ||
      typeof json.kdf.salt !== 'string' ||
      !json.kdf.salt.trim() ||
      typeof json.kdf.iterations !== 'number' ||
      !Number.isInteger(json.kdf.iterations) ||
      json.kdf.iterations <= 0
    ) {
      this.recordViolation({
        type: 'INVALID_ENCRYPTION_PAYLOAD',
        message: 'Snapshot payload missing valid KDF configuration (salt, positive iterations)',
        url,
        method,
        detail: { kdf: json.kdf },
      });
    }

    // Check Cipher specification
    if (
      !json.cipher ||
      typeof json.cipher !== 'object' ||
      typeof json.cipher.iv !== 'string' ||
      !json.cipher.iv.trim() ||
      typeof json.cipher.tagLength !== 'number' ||
      !Number.isInteger(json.cipher.tagLength) ||
      json.cipher.tagLength <= 0
    ) {
      this.recordViolation({
        type: 'INVALID_ENCRYPTION_PAYLOAD',
        message: 'Snapshot payload missing valid Cipher configuration (iv, positive tagLength)',
        url,
        method,
        detail: { cipher: json.cipher },
      });
    }

    // Redline: Ensure unencrypted plaintext config fields are NEVER exposed at root
    const prohibitedPlaintextFields = ['password', 'data', 'user_rules', 'rules', 'upstream_dns'];
    for (const field of prohibitedPlaintextFields) {
      if (field in json) {
        this.recordViolation({
          type: 'PLAINTEXT_LEAK',
          message: `Prohibited unencrypted configuration field '${field}' found at snapshot root`,
          url,
          method,
        });
      }
    }
  }

  private recordViolation(violation: SecurityViolation): void {
    this.violations.push(violation);
    if (this.throwImmediately) {
      throw new Error(`[SecuritySniffer Violation] ${violation.message} (${violation.method} ${violation.url})`);
    }
  }

  /**
   * Asserts that no security or encryption violations were encountered.
   */
  public assertNoViolations(): void {
    if (this.violations.length > 0) {
      const messages = this.violations
        .map((v, i) => `[${i + 1}] ${v.type}: ${v.message} (${v.method} ${v.url})`)
        .join('\n');
      throw new Error(`SecuritySniffer detected ${this.violations.length} violation(s):\n${messages}`);
    }
  }

  /**
   * Alias for assertNoViolations()
   */
  public assertClean(): void {
    this.assertNoViolations();
  }

  /**
   * Returns all intercepted requests directed to /api/managed/*
   */
  public getManagedRequests(): InspectedRequest[] {
    return [...this.managedRequests];
  }

  /**
   * Clears accumulated records and violations.
   */
  public clear(): void {
    this.violations = [];
    this.managedRequests = [];
  }

  /**
   * Detaches the network listener from the page.
   */
  public detach(): void {
    this.page.off('request', this.requestListener);
  }
}

/**
 * Convenience helper to instantiate and attach a SecuritySniffer to a Playwright Page.
 */
export function attachSecuritySniffer(
  page: Page,
  options?: SecuritySnifferOptions
): SecuritySniffer {
  return new SecuritySniffer(page, options);
}
