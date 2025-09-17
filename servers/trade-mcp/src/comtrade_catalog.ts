import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export interface HsCatalogEntry {
  code: string;
  text: string;
  level?: number;
  parent?: string;
  searchText: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, 'comtrade_data');

let hsCatalogPromise: Promise<HsCatalogEntry[]> | null = null;

export async function searchHsCatalog(query: string, limit = 25): Promise<HsCatalogEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const catalog = await loadHsCatalog();
  const needle = trimmed.toLowerCase();
  const results: HsCatalogEntry[] = [];

  for (const entry of catalog) {
    if (entry.searchText.includes(needle) || entry.code.startsWith(needle)) {
      results.push(entry);
    }
    if (results.length >= limit) break;
  }

  return results;
}

async function loadHsCatalog(): Promise<HsCatalogEntry[]> {
  if (!hsCatalogPromise) {
    hsCatalogPromise = readHsCatalog();
  }
  return hsCatalogPromise;
}

async function readHsCatalog(): Promise<HsCatalogEntry[]> {
  const path = join(DATA_DIR, 'hs_2022.csv');
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`[trade-mcp] HS catalogue missing at ${path}`);
      return [];
    }
    throw error;
  }
  const rows = parseCsv(raw);

  const entries: HsCatalogEntry[] = [];
  for (const row of rows) {
    const code = row[0]?.trim();
    const text = row[1]?.trim();
    if (!code || code === 'code' || !text) continue;
    const level = row[3] ? Number(row[3]) : undefined;
    entries.push({
      code,
      text,
      parent: row[2]?.trim() || undefined,
      level: Number.isFinite(level) ? level : undefined,
      searchText: `${code} ${text}`.toLowerCase()
    });
  }

  entries.sort((a, b) => a.code.localeCompare(b.code));
  return entries;
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      current.push(value);
      value = '';
      continue;
    }

    if (char === '\r') {
      if (source[i + 1] === '\n') i += 1;
      current.push(value);
      rows.push(current);
      current = [];
      value = '';
      continue;
    }

    if (char === '\n') {
      current.push(value);
      rows.push(current);
      current = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value || current.length) {
    current.push(value);
    rows.push(current);
  }

  return rows;
}
