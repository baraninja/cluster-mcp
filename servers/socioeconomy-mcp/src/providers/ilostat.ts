import { getWithRetry, getJSON, sdmxJsonToSeries, MemoryCache } from '@cluster-mcp/core';
import type { Series } from '@cluster-mcp/core';

// Note: ILO migrated to new SDMX endpoint in 2024
const BASE = 'https://sdmx.ilo.org/rest/data';

// Cache for ILO data (30 minute TTL)
const iloCache = new MemoryCache();
const CACHE_TTL = 1800000; // 30 minutes

export async function getIloSeries(
  datasetKey: string,
  geo = 'SE',
  years?: [number, number]
): Promise<Series> {
  const geoFilter = geo.toUpperCase();
  const timeFilter = years ? `.${years[0]}:${years[1]}` : '';

  // Build cache key
  const cacheKey = `ilo:${datasetKey}:${geoFilter}:${years?.join('-') || 'all'}`;

  // Check cache
  const cached = iloCache.get<Series>(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${BASE}/${datasetKey}/${geoFilter}${timeFilter}?format=sdmx-json`;

  const { json } = await getWithRetry(() => getJSON(url));

  if (!(json as any)?.dataSets?.[0]?.observations) {
    throw new Error(`Invalid ILO response for ${datasetKey}`);
  }

  const values = sdmxJsonToSeries(json as any, 'TIME_PERIOD', 'REF_AREA');

  // Try to extract unit from SDMX structure
  const unitDim = (json as any).structure?.dimensions?.observation?.find(
    (d: any) => d.id === 'OBS_VALUE' || d.id === 'UNIT_MEASURE'
  );
  const unit = unitDim?.values?.[0]?.name || unitDim?.unit || '';

  const series: Series = {
    semanticId: datasetKey,
    unit,
    freq: 'A',
    values: values.sort((a, b) => a.time.localeCompare(b.time)),
    source: {
      name: 'ilostat',
      id: datasetKey,
      url
    },
    definition: (json as any).structure?.name,
    retrievedAt: new Date().toISOString()
  };

  // Cache the result
  iloCache.set(cacheKey, series, CACHE_TTL);

  return series;
}

/**
 * Get latest value for an indicator (optimized)
 */
export async function getIloLatestValue(
  datasetKey: string,
  geo = 'SE'
): Promise<{ value: number; year: string } | null> {
  // For latest value, only fetch recent years
  const currentYear = new Date().getFullYear();
  const series = await getIloSeries(datasetKey, geo, [currentYear - 5, currentYear]);

  if (series.values.length === 0) {
    return null;
  }

  const latest = series.values[series.values.length - 1];
  return { value: latest.value, year: latest.time };
}

export async function searchIloIndicators(query: string) {
  // Check cache for search results
  const cacheKey = `ilo:search:${query.toLowerCase()}`;
  const cached = iloCache.get<any[]>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Use the dataflow endpoint for searching
    const catalogUrl = `https://sdmx.ilo.org/rest/dataflow/ILO?format=sdmx-json`;
    const { json } = await getWithRetry(() => getJSON(catalogUrl));

    const dataflows = (json as any)?.data?.dataflows || [];
    const queryLower = query.toLowerCase();

    // Filter dataflows by query
    const results = dataflows
      .filter((flow: any) => {
        const name = (flow.name || '').toLowerCase();
        const id = (flow.id || '').toLowerCase();
        const desc = (flow.description || '').toLowerCase();
        return name.includes(queryLower) || id.includes(queryLower) || desc.includes(queryLower);
      })
      .slice(0, 20)
      .map((flow: any) => ({
        provider: 'ilostat' as const,
        id: flow.id,
        label: flow.name,
        description: flow.description?.slice(0, 200)
      }));

    // Cache search results
    iloCache.set(cacheKey, results, CACHE_TTL);

    return results;
  } catch (error) {
    console.error('ILO search error:', error);
    return [];
  }
}