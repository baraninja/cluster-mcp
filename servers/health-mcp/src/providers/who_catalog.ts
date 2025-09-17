import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export interface WhoCatalogIndicator {
  code: string;
  name: string;
  language?: string;
  searchName: string;
}

export interface WhoCatalogDimension {
  code: string;
  title: string;
  searchTitle: string;
}

interface WhoCatalogData {
  indicators: WhoCatalogIndicator[];
  indicatorMap: Map<string, WhoCatalogIndicator>;
  dimensions: Map<string, WhoCatalogDimension>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', 'data');
const INDICATOR_FILE = join(DATA_DIR, 'who_gho_indicators.csv');
const DIMENSION_FILE = join(DATA_DIR, 'who_gho_dimensions.csv');

let cachedCatalog: Promise<WhoCatalogData> | null = null;

export async function loadWhoCatalog(): Promise<WhoCatalogData> {
  if (!cachedCatalog) {
    cachedCatalog = buildCatalog();
  }
  return cachedCatalog;
}

export async function searchCatalogIndicators(query: string, limit = 25): Promise<WhoCatalogIndicator[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const catalog = await loadWhoCatalog();
  const results: WhoCatalogIndicator[] = [];
  for (const item of catalog.indicators) {
    if (item.searchName.includes(normalized)) {
      results.push(item);
      if (results.length >= limit) break;
    }
  }
  return results;
}

export async function lookupCatalogIndicator(code: string): Promise<WhoCatalogIndicator | undefined> {
  const catalog = await loadWhoCatalog();
  return catalog.indicatorMap.get(code.toUpperCase());
}

export async function lookupDimensionTitle(code: string): Promise<string | undefined> {
  if (!code) return undefined;
  const catalog = await loadWhoCatalog();
  return catalog.dimensions.get(code.toUpperCase())?.title;
}

async function buildCatalog(): Promise<WhoCatalogData> {
  const indicatorCsv = await readMaybe(INDICATOR_FILE);
  const dimensionCsv = await readMaybe(DIMENSION_FILE);

  const indicators: WhoCatalogIndicator[] = [];
  const indicatorMap = new Map<string, WhoCatalogIndicator>();

  for (const row of parseCsv(indicatorCsv ?? '')) {
    const [code, name, language] = row;
    if (!code || code === 'IndicatorCode') continue;
    const entry: WhoCatalogIndicator = {
      code,
      name: name ?? '',
      language: language || undefined,
      searchName: `${code} ${name ?? ''}`.toLowerCase()
    };
    indicators.push(entry);
    indicatorMap.set(code.toUpperCase(), entry);
  }

  const dimensions = new Map<string, WhoCatalogDimension>();
  for (const row of parseCsv(dimensionCsv ?? '')) {
    const [code, title] = row;
    if (!code || code === 'Code') continue;
    dimensions.set(code.toUpperCase(), {
      code,
      title: title ?? '',
      searchTitle: `${code} ${title ?? ''}`.toLowerCase()
    });
  }

  // Sort once by indicator name to provide stable ordering
  indicators.sort((a, b) => a.name.localeCompare(b.name));

  return { indicators, indicatorMap, dimensions };
}

async function readMaybe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`WHO catalog file missing: ${path}`);
      return null;
    }
    throw error;
  }
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let value = '';
  let inQuotes = false;
  let i = 0;

  const pushValue = () => {
    current.push(value);
    value = '';
  };

  const pushRow = () => {
    if (current.length > 0) {
      rows.push(current);
    }
    current = [];
  };

  while (i < source.length) {
    const char = source[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          value += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      value += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ',') {
      pushValue();
      i += 1;
      continue;
    }

    if (char === '\r') {
      if (source[i + 1] === '\n') {
        i += 2;
      } else {
        i += 1;
      }
      pushValue();
      pushRow();
      continue;
    }

    if (char === '\n') {
      i += 1;
      pushValue();
      pushRow();
      continue;
    }

    value += char;
    i += 1;
  }

  if (value.length > 0 || current.length > 0) {
    pushValue();
    pushRow();
  }

  return rows;
}
