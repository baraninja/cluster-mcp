import { getWithRetry, getJSON, jsonstatToSeries } from '@cluster-mcp/core';
import type { Series } from '@cluster-mcp/core';

const BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0';

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
  
  const url = `${BASE}/data/${encodeURIComponent(datasetCode)}?${params}`;
  
  const { json } = await getWithRetry(() => getJSON(url));
  
  if (!json) {
    throw new Error(`Invalid Eurostat response for ${datasetCode}`);
  }
  
  const values = jsonstatToSeries(json as any, 'time', 'geo');
  const filteredValues = geo 
    ? values.filter(v => v.geo?.toUpperCase().startsWith(geo.toUpperCase()))
    : values;
  
  return {
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
    retrievedAt: new Date().toISOString()
  };
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