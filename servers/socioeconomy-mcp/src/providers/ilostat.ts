import { getWithRetry, getJSON, sdmxJsonToSeries } from '@cluster-mcp/core';
import type { Series } from '@cluster-mcp/core';

const BASE = 'https://sdmx.ilo.org/rest/data';

export async function getIloSeries(
  datasetKey: string,
  geo = 'SE',
  years?: [number, number]
): Promise<Series> {
  const geoFilter = geo.toUpperCase();
  const timeFilter = years ? `.${years[0]}:${years[1]}` : '';
  
  const url = `${BASE}/${datasetKey}/${geoFilter}${timeFilter}?format=sdmx-json`;
  
  const { json } = await getWithRetry(() => getJSON(url));
  
  if (!(json as any)?.dataSets?.[0]?.observations) {
    throw new Error(`Invalid ILO response for ${datasetKey}`);
  }
  
  const values = sdmxJsonToSeries(json as any, 'TIME_PERIOD', 'REF_AREA');
  
  return {
    semanticId: datasetKey,
    unit: (json as any).structure?.dimensions?.observation?.find((d: any) => d.id === 'OBS_VALUE')?.unit || '',
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
}

export async function searchIloIndicators(query: string) {
  try {
    const catalogUrl = `${BASE}?format=sdmx-json&search=${encodeURIComponent(query)}`;
    const { json } = await getWithRetry(() => getJSON(catalogUrl));
    
    return ((json as any)?.dataflows || []).slice(0, 20).map((flow: any) => ({
      provider: 'ilostat' as const,
      id: flow.id,
      label: flow.name,
      description: flow.description?.slice(0, 200)
    }));
  } catch (error) {
    console.error('ILO search error:', error);
    return [];
  }
}