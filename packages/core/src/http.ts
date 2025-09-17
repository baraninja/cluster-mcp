import { fetch } from 'undici';

export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset?: number;
  windowLimits?: Record<string, number>;
  windowRemaining?: Record<string, number>;
  retryAfterMs?: number;
}

type HeaderMap = Record<string, string>;

function toHeaderMap(headers: Headers): HeaderMap {
  const entries: [string, string][] = [];
  headers.forEach((value, key) => {
    entries.push([key.toLowerCase(), value]);
  });
  return Object.fromEntries(entries);
}

function parseNumericHeader(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRetryAfterHeader(value?: string): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export function extractRateLimit(headers: HeaderMap): RateLimitInfo | undefined {
  const info: RateLimitInfo = {};
  const limit = parseNumericHeader(headers['x-ratelimit-limit'] || headers['ratelimit-limit']);
  const remaining = parseNumericHeader(headers['x-ratelimit-remaining'] || headers['ratelimit-remaining']);
  const reset = parseNumericHeader(headers['x-ratelimit-reset'] || headers['ratelimit-reset']);

  if (limit !== undefined) info.limit = limit;
  if (remaining !== undefined) info.remaining = remaining;
  if (reset !== undefined) info.reset = reset;

  const windowLimits: Record<string, number> = {};
  const windowRemaining: Record<string, number> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (!key.startsWith('x-ratelimit-')) continue;
    const suffix = key.replace('x-ratelimit-', '');
    if (['limit', 'remaining', 'reset'].includes(suffix)) continue;
    const parsed = parseNumericHeader(value);
    if (parsed === undefined) continue;
    if (suffix.endsWith('-remaining')) {
      const window = suffix.replace('-remaining', '');
      windowRemaining[window] = parsed;
    } else {
      windowLimits[suffix] = parsed;
    }
  }

  if (Object.keys(windowLimits).length) {
    info.windowLimits = windowLimits;
  }
  if (Object.keys(windowRemaining).length) {
    info.windowRemaining = windowRemaining;
  }

  const retryAfter = parseRetryAfterHeader(headers['retry-after']);
  if (retryAfter !== undefined) {
    info.retryAfterMs = retryAfter;
  }

  return Object.keys(info).length ? info : undefined;
}

async function coreFetch(url: string, init?: RequestInit, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'cluster-mcp/0.1',
        ...(init?.headers || {})
      }
    });
    
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getJSON(url: string, headers: Record<string, string> = {}) {
  const response = await coreFetch(url, {
    headers: {
      'Accept-Encoding': 'gzip',
      ...headers
    }
  });
  
  const headerMap = toHeaderMap(response.headers);
  return {
    json: await response.json(),
    headers: headerMap,
    rateLimit: extractRateLimit(headerMap)
  };
}

export async function getText(url: string, headers: Record<string, string> = {}) {
  const response = await coreFetch(url, { headers });
  
  const headerMap = toHeaderMap(response.headers);
  return {
    text: await response.text(),
    headers: headerMap,
    rateLimit: extractRateLimit(headerMap)
  };
}

export async function getWithRetry<T>(
  fn: () => Promise<T>,
  tries = 3,
  baseDelayMs = 350
): Promise<T> {
  let lastError: unknown;
  
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < tries - 1) {
        const delayMs = baseDelayMs * (i + 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError;
}

export function buildUserAgent(contactEmail?: string): string {
  const base = 'cluster-mcp/0.1';
  return contactEmail ? `${base} (mailto:${contactEmail})` : base;
}
