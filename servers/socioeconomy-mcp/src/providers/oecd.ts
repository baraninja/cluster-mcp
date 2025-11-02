import { getWithRetry, getJSON, sdmxJsonToSeries, MemoryCache } from '@cluster-mcp/core';
import type { Series } from '@cluster-mcp/core';

const BASE = 'https://sdmx.oecd.org/public/rest/data';

// Cache for OECD data (1 hour TTL to avoid rate limits)
const oecdCache = new MemoryCache();
const CACHE_TTL = 3600000; // 1 hour

export async function getOecdSeries(
  datasetKey: string,
  geo = 'SE',
  years?: [number, number]
): Promise<Series> {
  const geoFilter = geo.toUpperCase();
  const timeFilter = years ? `+${years[0]}:${years[1]}` : '';

  const url = `${BASE}/${datasetKey}/${geoFilter}${timeFilter}?format=jsondata&dimensionAtObservation=TIME_PERIOD`;

  // Check cache first
  const cacheKey = `oecd:${datasetKey}:${geoFilter}:${timeFilter}`;
  const cached = oecdCache.get<Series>(cacheKey);
  if (cached) {
    return cached;
  }

  const { json } = await getWithRetry(() => getJSON(url));
  
  if (!(json as any)?.dataSets?.[0]?.observations) {
    throw new Error(`Invalid OECD response for ${datasetKey}`);
  }
  
  const values = sdmxJsonToSeries(json as any, 'TIME_PERIOD', 'REF_AREA');

  const series: Series = {
    semanticId: datasetKey,
    unit: (json as any).structure?.dimensions?.observation?.find((d: any) => d.id === 'OBS_VALUE')?.unit || '',
    freq: 'A',
    values: values.sort((a, b) => a.time.localeCompare(b.time)),
    source: {
      name: 'oecd',
      id: datasetKey,
      url
    },
    definition: (json as any).structure?.name,
    retrievedAt: new Date().toISOString()
  };

  // Cache the result
  oecdCache.set(cacheKey, series, CACHE_TTL);

  return series;
}

export async function searchOecdIndicators(query: string) {
  try {
    const catalogUrl = `${BASE}?format=jsondata&search=${encodeURIComponent(query)}`;
    const { json } = await getWithRetry(() => getJSON(catalogUrl));
    
    return ((json as any)?.dataflows || []).slice(0, 20).map((flow: any) => ({
      provider: 'oecd' as const,
      id: flow.id,
      label: flow.name,
      description: flow.description?.slice(0, 200)
    }));
  } catch (error) {
    console.error('OECD search error:', error);
    return [];
  }
}