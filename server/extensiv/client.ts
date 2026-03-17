/**
 * Extensiv 3PL Warehouse Manager API Client
 * Handles OAuth token management with auto-refresh every 50 minutes.
 */

import axios, { AxiosInstance } from "axios";

export interface ExtensivClientConfig {
  clientId: string;
  clientSecret: string;
  tplGuid: string;
  userLoginId: number;
  baseUrl?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface TokenCache {
  token: string;
  expiresAt: number; // Unix ms
}

// In-memory token cache keyed by clientId
const tokenCache = new Map<string, TokenCache>();

export async function getExtensivToken(config: ExtensivClientConfig): Promise<string> {
  const cacheKey = config.clientId;
  const cached = tokenCache.get(cacheKey);
  const now = Date.now();

  // Refresh if no token or within 10 minutes of expiry (token lasts 1 hour, refresh at 50 min)
  if (cached && cached.expiresAt - now > 10 * 60 * 1000) {
    return cached.token;
  }

  const base64Auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const baseUrl = config.baseUrl || "https://secure-wms.com";

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("tpl", `{${config.tplGuid.replace(/[{}]/g, "")}}`);
  params.append("user_login_id", String(config.userLoginId));

  const response = await axios.post<TokenResponse>(
    `${baseUrl}/AuthServer/api/Token`,
    params.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${base64Auth}`,
      },
    }
  );

  const token = response.data.access_token;
  // Cache for 50 minutes (3000 seconds) regardless of expires_in
  tokenCache.set(cacheKey, {
    token,
    expiresAt: now + 50 * 60 * 1000,
  });

  return token;
}

export function createExtensivClient(config: ExtensivClientConfig): {
  get: (path: string, params?: Record<string, unknown>) => Promise<unknown>;
  getWithHeaders: (path: string, params?: Record<string, unknown>) => Promise<{ data: unknown; headers: Record<string, string> }>;
  put: (path: string, body: unknown, etag?: string) => Promise<{ data: unknown; status: number }>;
  post: (path: string, body: unknown) => Promise<{ data: unknown; status: number }>;
} {
  const baseUrl = config.baseUrl || "https://secure-wms.com";

  const makeHeaders = async (extra?: Record<string, string>) => {
    const token = await getExtensivToken(config);
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/hal+json",
      "Content-Type": "application/json",
      "Accept-Language": "en-US,en;q=0.8",
      ...extra,
    };
  };

  return {
    async get(path: string, params?: Record<string, unknown>) {
      const headers = await makeHeaders();
      const response = await axios.get(`${baseUrl}${path}`, { headers, params, validateStatus: () => true, timeout: 60000 });
      if (response.status >= 400) {
        const err = new Error(`Extensiv API error ${response.status} on GET ${path}`) as Error & { status: number; responseData: unknown };
        err.status = response.status;
        err.responseData = response.data;
        throw err;
      }
      return response.data;
    },

    async getWithHeaders(path: string, params?: Record<string, unknown>): Promise<{ data: unknown; headers: Record<string, string> }> {
      const headers = await makeHeaders();
      const response = await axios.get(`${baseUrl}${path}`, { headers, params, validateStatus: () => true, timeout: 60000 });
      if (response.status >= 400) {
        const err = new Error(`Extensiv API error ${response.status} on GET ${path}`) as Error & { status: number; responseData: unknown };
        err.status = response.status;
        err.responseData = response.data;
        throw err;
      }
      return { data: response.data, headers: response.headers as Record<string, string> };
    },

    async put(path: string, body: unknown, etag?: string) {
      const extra: Record<string, string> = {};
      if (etag) extra["If-Match"] = `"${etag}"`;
      const headers = await makeHeaders(extra);
      const response = await axios.put(`${baseUrl}${path}`, body, { headers, validateStatus: () => true });
      return { data: response.data, status: response.status };
    },

    async post(path: string, body: unknown) {
      const headers = await makeHeaders();
      const response = await axios.post(`${baseUrl}${path}`, body, { headers, validateStatus: () => true });
      return { data: response.data, status: response.status };
    },
  };
}

// Invalidate cached token for a config (e.g., after credential change)
export function invalidateToken(clientId: string) {
  tokenCache.delete(clientId);
}
