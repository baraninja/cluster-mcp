import { getWithRetry, getJSON, jsonstatToSeries, MemoryCache } from '@cluster-mcp/core';
import type { Series } from '@cluster-mcp/core';

const BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0';

// Cache for Eurostat data (30 minutes TTL)
const eurostatCache = new MemoryCache();
const CACHE_TTL = 1800000; // 30 minutes

function detectGeoLevel(geo?: string): 'national' | 'regional' | 'local' | undefined {
  if (!geo || geo.length <= 2) return 'national';
  if (geo.length === 3) return 'regional'; // NUTS1
  if (geo.length === 4) return 'regional'; // NUTS2
  if (geo.length === 5) return 'local';    // NUTS3
  return undefined;
}

// Required dimensions for regional datasets
const DATASET_DIMENSIONS: Record<string, Record<string, string>> = {
  'LFST_R_LFE2EMPRT': { sex: 'T', age: 'Y15-64', unit: 'PC' },
  'LFST_R_LFU3RT': { sex: 'T', age: 'Y15-74', unit: 'PC', isced11: 'TOTAL' },
  'DEMO_R_PJANGRP3': { sex: 'T', age: 'TOTAL' }
};

export async function getEurostatSeries(
  datasetCode: string,
  years?: [number, number],
  geo?: string
): Promise<Series> {
  const params = new URLSearchParams({
    lang: 'EN'
  });

  if (years) {
    for (let year = years[0]; year <= years[1]; year++) {
      params.append('time', String(year));
    }
  }

  if (geo) {
    params.append('geo', geo.toUpperCase());
  }

  // Add required dimensions for regional datasets
  const dimensions = DATASET_DIMENSIONS[datasetCode];
  if (dimensions) {
    Object.entries(dimensions).forEach(([key, value]) => {
      params.append(key, value);
    });
  }

  const url = `${BASE}/data/${encodeURIComponent(datasetCode)}?${params}`;

  // Check cache first
  const cacheKey = `eurostat:${datasetCode}:${geo || 'all'}:${years ? years.join('-') : 'all'}`;
  const cached = eurostatCache.get<Series>(cacheKey);
  if (cached) {
    return cached;
  }

  const { json } = await getWithRetry(() => getJSON(url));

  if (!json) {
    throw new Error(`Invalid Eurostat response for ${datasetCode}`);
  }

  const values = jsonstatToSeries(json as any, 'time', 'geo');

  // No need to filter since we already specified geo in the API request
  const filteredValues = values;

  const geoLevel = detectGeoLevel(geo);

  const series: Series = {
    semanticId: datasetCode,
    unit: (json as any).dataset?.dimension?.unit?.category?.label?.['PC'] || '',
    freq: 'A',
    values: filteredValues.sort((a, b) => a.time.localeCompare(b.time)),
    source: {
      name: 'eurostat',
      id: datasetCode,
      url
    },
    definition: (json as any).dataset?.label,
    retrievedAt: new Date().toISOString(),
    geoLevel,
    geoNote: geoLevel !== 'national' ? `Regional data from Eurostat at ${geoLevel} level` : undefined
  };

  // Cache the result
  eurostatCache.set(cacheKey, series, CACHE_TTL);

  return series;
}

export async function searchEurostatDatasets(query: string) {
  try {
    const catalogUrl = `${BASE}/datasets?lang=EN&search=${encodeURIComponent(query)}`;
    const { json } = await getWithRetry(() => getJSON(catalogUrl));
    
    return ((json as any)?.datasets || []).slice(0, 20).map((dataset: any) => ({
      provider: 'eurostat' as const,
      id: dataset.code,
      label: dataset.title,
      description: dataset.description?.slice(0, 200)
    }));
  } catch (error) {
    console.error('Eurostat search error:', error);
    return [];
  }
}