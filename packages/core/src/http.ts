import { fetch } from 'undici';

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
  
  return {
    json: await response.json(),
    headers: Object.fromEntries(response.headers)
  };
}

export async function getText(url: string, headers: Record<string, string> = {}) {
  const response = await coreFetch(url, { headers });
  
  return {
    text: await response.text(),
    headers: Object.fromEntries(response.headers)
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