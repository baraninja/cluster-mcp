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

// Common synonyms/aliases for HS search terms
const SEARCH_SYNONYMS: Record<string, string[]> = {
  'electric vehicles': ['electric', 'motor vehicles', '8703'],
  'ev': ['electric', 'motor vehicles'],
  'cars': ['motor cars', 'motor vehicles', 'automobiles'],
  'trucks': ['motor vehicles', 'goods', 'lorries'],
  'phones': ['telephone', 'cellular', 'mobile'],
  'computers': ['data-processing', 'automatic data processing'],
  'laptops': ['portable', 'data-processing'],
  'chips': ['integrated circuits', 'semiconductors'],
  'semiconductors': ['integrated circuits', 'electronic'],
  'timber': ['wood', 'sawn', 'lumber'],
  'lumber': ['wood', 'sawn', 'timber'],
  'beef': ['bovine', 'meat', 'cattle'],
  'pork': ['swine', 'meat', 'pig'],
  'chicken': ['poultry', 'fowls', 'meat'],
  'medicines': ['medicaments', 'pharmaceutical'],
  'drugs': ['medicaments', 'pharmaceutical'],
  'clothing': ['garments', 'apparel', 'wearing'],
  'clothes': ['garments', 'apparel', 'wearing']
};

export async function searchHsCatalog(query: string, limit = 25): Promise<HsCatalogEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const catalog = await loadHsCatalog();

  // Check for synonym expansion
  const lowerQuery = trimmed.toLowerCase();
  const synonyms = SEARCH_SYNONYMS[lowerQuery];

  // Split query into words for multi-word search
  // Require words to be 3+ chars unless they're numeric (HS codes)
  const words = trimmed.toLowerCase().split(/\s+/).filter(w =>
    w.length >= 3 || /^\d+$/.test(w)
  );

  // Add synonym words if available
  if (synonyms) {
    for (const syn of synonyms) {
      const synWords = syn.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      words.push(...synWords);
    }
  }

  // Deduplicate words
  const uniqueWords = [...new Set(words)];

  // Score and collect results
  const scored: Array<{ entry: HsCatalogEntry; score: number }> = [];

  // Only do exact phrase match for queries 3+ chars (avoid "ev" matching "beverages")
  const doExactMatch = lowerQuery.length >= 3 || /^\d+$/.test(lowerQuery);

  for (const entry of catalog) {
    // Exact phrase match gets highest score
    if (doExactMatch && (entry.searchText.includes(lowerQuery) || entry.code.startsWith(lowerQuery))) {
      scored.push({ entry, score: 100 + uniqueWords.length });
      continue;
    }

    // Count how many words match (OR logic with scoring)
    let matchCount = 0;
    for (const word of uniqueWords) {
      if (entry.searchText.includes(word) || entry.code.includes(word)) {
        matchCount++;
      }
    }

    // Include if at least one word matches
    if (matchCount > 0) {
      // Score: more matching words = higher score
      scored.push({ entry, score: matchCount });
    }
  }

  // Sort by score descending, then by code for stability
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.code.localeCompare(b.entry.code);
  });

  return scored.slice(0, limit).map(s => s.entry);
}

export interface HsChapter {
  code: string;
  description: string;
}

export async function getHsChapters(): Promise<HsChapter[]> {
  const catalog = await loadHsCatalog();

  // HS chapters are 2-digit codes (01-99)
  const chapters = catalog
    .filter(entry => /^\d{2}$/.test(entry.code))
    .map(entry => {
      // Clean up description - remove redundant code prefix if present
      let desc = entry.text;
      const codePrefix = `${entry.code} - `;
      if (desc.startsWith(codePrefix)) {
        desc = desc.slice(codePrefix.length);
      }
      return {
        code: entry.code,
        description: desc
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  return chapters;
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
