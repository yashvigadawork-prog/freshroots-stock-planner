import type { ZohoConfig } from "./config";

export type ZohoErrorKind = "not_configured" | "auth" | "unavailable" | "rejected" | "blocked";

/** Messages are written for Raghav and never contain secrets. */
export class ZohoError extends Error {
  constructor(public kind: ZohoErrorKind, message: string) {
    super(message);
  }
}

type Fetch = typeof fetch;
export type ClientOptions = {
  fetch?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  now?: () => number;
};

/**
 * The ONLY Zoho calls this app may ever make: read purchase orders, and create one new purchase order
 * (Zoho saves it as a draft). Anything else, such as editing, deleting, approving or issuing, is refused here.
 */
export function isAllowed(method: string, path: string): boolean {
  if (method === "GET") return /^\/purchaseorders(\/\d+)?$/.test(path);
  if (method === "POST") return path === "/purchaseorders";
  return false;
}

const TOKEN_SKEW_MS = 60_000;
const g = globalThis as unknown as { __zohoToken?: { value: string; exp: number; key: string } };

export class ZohoClient {
  private f: Fetch;
  private sleep: (ms: number) => Promise<void>;
  private attempts: number;
  private base: number;
  private timeout: number;
  private now: () => number;

  constructor(private cfg: ZohoConfig, opts: ClientOptions = {}) {
    this.f = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.attempts = opts.attempts ?? 3;
    this.base = opts.baseDelayMs ?? 700;
    this.timeout = opts.timeoutMs ?? 12_000;
    this.now = opts.now ?? Date.now;
  }

  /** Runs `fn`, retrying with growing waits (0.7s, 1.4s, ...) only when Zoho is slow or down. */
  private async retrying<T>(fn: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let i = 0; i < this.attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        if (!(e instanceof ZohoError) || e.kind !== "unavailable" || i === this.attempts - 1) throw e;
        await this.sleep(this.base * 2 ** i);
      }
    }
    throw last;
  }

  private async fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
    let res: Response;
    try {
      res = await this.f(url, { ...init, signal: AbortSignal.timeout(this.timeout) });
    } catch {
      throw new ZohoError("unavailable", "Zoho did not answer in time.");
    }
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* not JSON */
    }
    if (res.status === 429 || res.status >= 500) throw new ZohoError("unavailable", `Zoho is busy or down (it answered ${res.status}).`);
    return { status: res.status, body };
  }

  private async accessToken(force = false): Promise<string> {
    const key = `${this.cfg.accountsBase}|${this.cfg.clientId}`;
    const cached = g.__zohoToken;
    if (!force && cached && cached.key === key && cached.exp > this.now()) return cached.value;
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      refresh_token: this.cfg.refreshToken,
    });
    const { status, body } = await this.retrying(() =>
      this.fetchJson(`${this.cfg.accountsBase}/oauth/v2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
      }),
    );
    // Zoho reports a bad refresh token with HTTP 200 and an "error" field.
    if (typeof body.access_token !== "string") {
      const why = typeof body.error === "string" ? body.error : `status ${status}`;
      throw new ZohoError("auth", `Zoho did not accept the saved credentials (${why}). Check the client ID, client secret and refresh token, and that the data centre is right.`);
    }
    const ttl = (typeof body.expires_in === "number" ? body.expires_in : 3600) * 1000;
    g.__zohoToken = { value: body.access_token, exp: this.now() + ttl - TOKEN_SKEW_MS, key };
    return body.access_token;
  }

  /** `path` starts with "/", e.g. "/purchaseorders". */
  async request(method: "GET" | "POST", path: string, opts: { query?: Record<string, string>; json?: unknown } = {}): Promise<Record<string, unknown>> {
    if (!isAllowed(method, path)) {
      throw new ZohoError("blocked", "This app is only allowed to read purchase orders and create draft ones. That request was blocked.");
    }
    const q = new URLSearchParams({ organization_id: this.cfg.organizationId, ...(opts.query ?? {}) });
    const url = `${this.cfg.apiBase}${path}?${q}`;
    let refreshed = false;
    return this.retrying(async () => {
      for (;;) {
        const token = await this.accessToken(refreshed);
        const { status, body } = await this.fetchJson(url, {
          method,
          headers: { Authorization: `Zoho-oauthtoken ${token}`, ...(opts.json ? { "content-type": "application/json" } : {}) },
          body: opts.json ? JSON.stringify(opts.json) : undefined,
        });
        if (status === 401 && !refreshed) {
          refreshed = true; // the saved access token may have expired: get a new one once
          continue;
        }
        if (status === 401) throw new ZohoError("auth", "Zoho refused the credentials. Check they were created with the purchase order scopes.");
        if (status >= 400 || (typeof body.code === "number" && body.code !== 0)) {
          const msg = typeof body.message === "string" ? body.message.slice(0, 200) : `status ${status}`;
          throw new ZohoError("rejected", `Zoho said no: ${msg}`);
        }
        return body;
      }
    });
  }
}

export function forgetToken() {
  delete g.__zohoToken;
}
