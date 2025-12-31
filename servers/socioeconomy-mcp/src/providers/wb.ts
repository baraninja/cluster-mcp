import { getWithRetry, getJSON, MemoryCache } from '@cluster-mcp/core';
import type { Series } from '@cluster-mcp/core';

const BASE = 'https://api.worldbank.org/v2';

// Cache for World Bank data (30 minute TTL)
const wbCache = new MemoryCache();
const CACHE_TTL = 1800000; // 30 minutes

// World Bank region aggregates
export const WB_REGION_CODES: Record<string, string> = {
  'WLD': 'World',
  'EUU': 'European Union',
  'OED': 'OECD members',
  'EAP': 'East Asia & Pacific',
  'ECA': 'Europe & Central Asia',
  'LAC': 'Latin America & Caribbean',
  'MNA': 'Middle East & North Africa',
  'NAC': 'North America',
  'SAS': 'South Asia',
  'SSA': 'Sub-Saharan Africa',
  'HIC': 'High income',
  'MIC': 'Middle income',
  'LIC': 'Low income',
  'LMC': 'Lower middle income',
  'UMC': 'Upper middle income',
  'EMU': 'Euro area'
};

// Income level codes for filtering
export const WB_INCOME_LEVELS = ['HIC', 'MIC', 'LIC', 'LMC', 'UMC'] as const;
export type WbIncomeLevel = typeof WB_INCOME_LEVELS[number];

export interface WbSeriesOptions {
  /** Most Recent Values - get last N values regardless of year */
  mrv?: number;
  /** Only return non-empty values (use with mrv) */
  mrnev?: boolean;
  /** Gap fill - interpolate missing values */
  gapfill?: boolean;
  /** Include footnotes in response */
  footnotes?: boolean;
}

export async function getWbSeries(
  indicatorId: string,
  geo = 'SE',
  years?: [number, number],
  options: WbSeriesOptions = {}
): Promise<Series> {
  const geoUpper = geo.toUpperCase();

  // Check if this is a region aggregate code
  const isRegionAggregate = WB_REGION_CODES[geoUpper] !== undefined;

  // World Bank only supports ISO country codes (2 characters) or region codes
  // If NUTS code is provided (e.g., SE11), extract country code
  const isSubNational = !isRegionAggregate && geoUpper.length > 2;
  const geoCode = isSubNational ? geoUpper.slice(0, 2) : geoUpper;

  // Build cache key
  const cacheKey = `wb:${indicatorId}:${geoCode}:${years?.join('-') || 'all'}:${JSON.stringify(options)}`;

  // Check cache
  const cached = wbCache.get<Series>(cacheKey);
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    format: 'json',
    per_page: '20000'
  });

  // Apply options
  if (options.mrv) {
    params.set('mrv', String(options.mrv));
    if (options.mrnev) {
      params.set('mrnev', String(options.mrv));
    }
  } else if (years) {
    params.set('date', `${years[0]}:${years[1]}`);
  }

  if (options.gapfill) {
    params.set('gapfill', 'Y');
  }

  if (options.footnotes) {
    params.set('footnote', 'y');
  }

  const url = `${BASE}/country/${geoCode}/indicator/${indicatorId}?${params}`;

  const { json } = await getWithRetry(() => getJSON(url));

  if (!Array.isArray(json) || json.length < 2) {
    throw new Error(`Invalid World Bank response for ${indicatorId}`);
  }

  const [metadata, dataPoints] = json;
  const values = (dataPoints || [])
    .filter((point: any) => point.value != null)
    .map((point: any) => ({
      time: String(point.date),
      value: Number(point.value)
    }))
    .sort((a: any, b: any) => a.time.localeCompare(b.time));

  const unit = metadata?.sourceNote?.includes('%') ? '%' : (metadata?.unit || '');

  const series: Series = {
    semanticId: indicatorId,
    unit,
    freq: 'A',
    values,
    source: {
      name: 'wb',
      id: indicatorId,
      url
    },
    definition: metadata?.sourceNote,
    retrievedAt: new Date().toISOString(),
    geoLevel: isRegionAggregate ? undefined : 'national',
    geoNote: isSubNational
      ? `World Bank does not support sub-national data. Returning national data for ${geoCode} instead of ${geo}`
      : (isRegionAggregate ? `Aggregate data for: ${WB_REGION_CODES[geoUpper]}` : undefined)
  };

  // Cache the result
  wbCache.set(cacheKey, series, CACHE_TTL);

  return series;
}

/**
 * Get countries by income level
 */
export async function getCountriesByIncomeLevel(incomeLevel: WbIncomeLevel): Promise<string[]> {
  const cacheKey = `wb:countries:income:${incomeLevel}`;

  const cached = wbCache.get<string[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${BASE}/country?format=json&per_page=500&incomeLevel=${incomeLevel}`;
  const { json } = await getWithRetry(() => getJSON(url));

  if (!Array.isArray(json) || json.length < 2) {
    return [];
  }

  const [, countries] = json;
  const codes = (countries || []).map((c: any) => c.id);

  wbCache.set(cacheKey, codes, CACHE_TTL * 2); // Longer cache for country lists

  return codes;
}

/**
 * Get latest value for an indicator (optimized)
 */
export async function getWbLatestValue(
  indicatorId: string,
  geo = 'SE'
): Promise<{ value: number; year: string } | null> {
  const series = await getWbSeries(indicatorId, geo, undefined, { mrv: 1, mrnev: true });

  if (series.values.length === 0) {
    return null;
  }

  const latest = series.values[series.values.length - 1];
  return { value: latest.value, year: latest.time };
}

export async function searchWbIndicators(query: string) {
  const url = `${BASE}/indicator?format=json&per_page=100&search=${encodeURIComponent(query)}`;
  
  try {
    const { json } = await getWithRetry(() => getJSON(url));
    
    if (!Array.isArray(json) || json.length < 2) {
      return [];
    }
    
    const [, indicators] = json;
    
    return (indicators || []).map((indicator: any) => ({
      provider: 'wb' as const,
      id: indicator.id,
      label: indicator.name,
      unit: indicator.unit,
      description: indicator.sourceNote?.slice(0, 200)
    }));
  } catch (error) {
    console.error('World Bank search error:', error);
    return [];
  }
}