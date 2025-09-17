import {
  getJSON,
  getWithRetry,
  mapRegionCode,
  normaliseUnit,
  type Series,
  type Profile
} from '@cluster-mcp/core';
import {
  lookupCatalogIndicator,
  lookupDimensionTitle,
  searchCatalogIndicators
} from './who_catalog.js';
import type {
  SearchIndicatorParams
} from '../tools/search_indicator.js';
import type { GetSeriesParams } from '../tools/get_series.js';
import type { GetMetadataParams } from '../tools/get_metadata.js';

const BASE_URL = 'https://ghoapi.azureedge.net/';
const JSON_HEADERS = { Accept: 'application/json' } as const;

interface WhoIndicatorResponse {
  IndicatorCode: string;
  IndicatorName: string;
  Language?: string;
}

interface WhoObservation {
  IndicatorCode: string;
  SpatialDim: string;
  TimeDim: number;
  NumericValue?: number;
  Dim1?: string | null;
  Value?: string;
}

export interface WhoIndicatorSummary {
  provider: 'who';
  id: string;
  label: string;
  unit?: string;
  language?: string;
}

const indicatorLabelCache = new Map<string, string>();

export async function searchWhoIndicators(params: SearchIndicatorParams): Promise<WhoIndicatorSummary[]> {
  const query = params.q.trim();
  if (!query) return [];

  const results: WhoIndicatorSummary[] = [];
  const seen = new Set<string>();

  const localMatches = await searchCatalogIndicators(query, 50);
  for (const match of localMatches) {
    indicatorLabelCache.set(match.code, match.name);
    results.push({
      provider: 'who',
      id: match.code,
      label: match.name,
      unit: inferUnitFromName(match.name),
      language: match.language
    });
    seen.add(match.code);
    if (results.length >= 25) {
      break;
    }
  }

  if (results.length < 25) {
    const escaped = escapeOdataLiteral(query.toUpperCase());
    const filter = `contains(toupper(IndicatorName),'${escaped}')`;
    const url = `${BASE_URL}Indicator?$filter=${encodeURIComponent(filter)}&$top=25`;
    try {
      const { json } = await getWithRetry(() => getJSON(url, JSON_HEADERS));
      const payload = json as Record<string, any> | undefined;
      const items: WhoIndicatorResponse[] = Array.isArray(payload?.value) ? payload!.value : [];
      for (const item of items) {
        if (seen.has(item.IndicatorCode)) continue;
        indicatorLabelCache.set(item.IndicatorCode, item.IndicatorName);
        results.push({
          provider: 'who',
          id: item.IndicatorCode,
          label: item.IndicatorName,
          unit: inferUnitFromName(item.IndicatorName),
          language: item.Language
        });
        if (results.length >= 25) break;
      }
    } catch (error) {
      console.error('WHO indicator search failed:', error);
    }
  }

  return results;
}

export async function getWhoMetadata(params: GetMetadataParams): Promise<Profile | null> {
  const code = params.id;
  const local = await lookupCatalogIndicator(code);
  if (local) {
    indicatorLabelCache.set(local.code, local.name);
    const unitInfo = inferUnitFromName(local.name);
    return {
      provider: 'who',
      id: local.code,
      label: local.name,
      unit: unitInfo,
      description: local.name,
      frequency: 'A'
    };
  }

  const filter = `IndicatorCode eq '${escapeOdataLiteral(code)}'`;
  const url = `${BASE_URL}Indicator?$filter=${encodeURIComponent(filter)}&$top=1`;

  try {
    const { json } = await getWithRetry(() => getJSON(url, JSON_HEADERS));
    const payload = json as Record<string, any> | undefined;
    const indicator: WhoIndicatorResponse | undefined = Array.isArray(payload?.value) ? payload!.value[0] : undefined;
    if (!indicator) {
      return null;
    }

    indicatorLabelCache.set(indicator.IndicatorCode, indicator.IndicatorName);
    const unitInfo = inferUnitFromName(indicator.IndicatorName);

    return {
      provider: 'who',
      id: indicator.IndicatorCode,
      label: indicator.IndicatorName,
      unit: unitInfo,
      description: indicator.IndicatorName,
      frequency: 'A'
    };
  } catch (error) {
    console.error('WHO metadata lookup failed:', error);
    return null;
  }
}

export async function getWhoSeries(
  indicatorCode: string,
  options: GetSeriesParams
): Promise<Series | null> {
  const iso3 = mapRegionCode(options.geo ?? 'SE', 'ISO3');
  if (!iso3) {
    throw new Error(`Unable to map geo code ${options.geo ?? 'SE'} to ISO3 for WHO request`);
  }

  const requestedDim1 = options.dim1;
  const filterClauses: string[] = [];
  if (requestedDim1) {
    filterClauses.push(`Dim1 eq '${escapeOdataLiteral(requestedDim1)}'`);
  }
  if (options.years && options.years.length > 0) {
    const years = options.years.map((year) => Math.trunc(year)).sort((a, b) => a - b);
    const startYear = years[0];
    const endYear = years[years.length - 1];
    const startDate = `${startYear}-01-01`;
    const endDateExclusive = `${endYear + 1}-01-01`;
    filterClauses.push(`date(TimeDimensionBegin) ge ${startDate}`);
    filterClauses.push(`date(TimeDimensionBegin) lt ${endDateExclusive}`);
  }

  const filterExpression = filterClauses.join(' and ');

  const url = buildWhoUrl(`api/${indicatorCode}`, {
    $format: 'json',
    $top: '1000',
    $filter: filterExpression || undefined
  });

  const { json } = await getWithRetry(() => getJSON(url, JSON_HEADERS));
  const payload = json as Record<string, any> | undefined;
  const rows: WhoObservation[] = Array.isArray(payload?.value) ? payload!.value : [];

  const filteredRows = rows.filter((row) => {
    if (row.SpatialDim?.toUpperCase() !== iso3.toUpperCase()) return false;
    if (requestedDim1 && row.Dim1 !== requestedDim1) return false;
    if (options.years) {
      const [start, end] = options.years.map((year) => Math.trunc(year));
      if (row.TimeDim < start || row.TimeDim > end) return false;
    }
    return true;
  });

  const values = filteredRows
    .filter((row) => typeof row.NumericValue === 'number')
    .map((row) => ({
      time: String(row.TimeDim),
      value: Number(row.NumericValue),
      geo: row.SpatialDim
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  if (values.length === 0) {
    return null;
  }

  const distinctDim1 = Array.from(
    new Set(
      filteredRows
        .map((row) => (typeof row.Dim1 === 'string' && row.Dim1.length > 0 ? row.Dim1 : null))
        .filter((value): value is string => Boolean(value))
    )
  );

  const resolvedDim1 = requestedDim1 ?? (distinctDim1.length === 1 ? distinctDim1[0] : undefined);
  const dimNote = resolvedDim1 ? await formatDimensionNote(resolvedDim1) : undefined;

  const indicatorLabel = await lookupIndicatorLabel(indicatorCode);
  const inferredUnit = inferUnitFromName(indicatorLabel ?? indicatorCode);

  return {
    semanticId: options.semanticId,
    unit: inferredUnit ?? 'unknown',
    freq: 'A',
    values,
    source: {
      name: 'who',
      id: indicatorCode,
      url
    },
    definition: indicatorLabel ?? undefined,
    methodNotes: dimNote ? `Dimension filter: ${dimNote}` : undefined,
    retrievedAt: new Date().toISOString()
  };
}

async function lookupIndicatorLabel(code: string): Promise<string | null> {
  if (indicatorLabelCache.has(code)) {
    return indicatorLabelCache.get(code) ?? null;
  }

  const local = await lookupCatalogIndicator(code);
  if (local) {
    indicatorLabelCache.set(local.code, local.name);
    return local.name;
  }

  const filter = `IndicatorCode eq '${escapeOdataLiteral(code)}'`;
  const url = `${BASE_URL}Indicator?$filter=${encodeURIComponent(filter)}&$top=1`;
  try {
    const { json } = await getWithRetry(() => getJSON(url, JSON_HEADERS));
    const payload = json as Record<string, any> | undefined;
    const label = Array.isArray(payload?.value) ? payload!.value[0]?.IndicatorName : undefined;
    if (label) {
      indicatorLabelCache.set(code, label);
    }
    return label ?? null;
  } catch (error) {
    console.error('WHO label lookup failed:', error);
    return null;
  }
}

function escapeOdataLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function inferUnitFromName(name?: string): string | undefined {
  if (!name) return undefined;
  const match = name.match(/\(([^)]+)\)/);
  if (!match) return undefined;
  const candidate = match[1]!.trim();
  const normalised = normaliseUnit(candidate).unit;
  return normalised === 'unknown' ? candidate : normalised;
}

async function formatDimensionNote(dim1: string): Promise<string | undefined> {
  if (!dim1) return undefined;
  const [dimensionCode, ...rest] = dim1.split('_');
  const valueCode = rest.join('_');
  const title = await lookupDimensionTitle(dimensionCode);
  if (title && valueCode) {
    return `${title} (${valueCode})`;
  }
  if (title) {
    return title;
  }
  return dim1;
}

function buildWhoUrl(path: string, params: Record<string, string | undefined>): string {
  const base = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  const queryParts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      queryParts.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  if (queryParts.length > 0) {
    url.search = queryParts.join('&');
  }
  return url.toString();
}
