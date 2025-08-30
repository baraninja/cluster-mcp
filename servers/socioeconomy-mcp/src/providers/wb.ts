import { getWithRetry, getJSON } from '@cluster-mcp/core';
import type { Series } from '@cluster-mcp/core';

const BASE = 'https://api.worldbank.org/v2';

export async function getWbSeries(
  indicatorId: string, 
  geo = 'SE', 
  years?: [number, number]
): Promise<Series> {
  const isoCode = geo.slice(0, 2).toUpperCase();
  
  const params = new URLSearchParams({
    format: 'json',
    per_page: '20000'
  });
  
  if (years) {
    params.set('date', `${years[0]}:${years[1]}`);
  }
  
  const url = `${BASE}/country/${isoCode}/indicator/${indicatorId}?${params}`;
  
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
  
  return {
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
    retrievedAt: new Date().toISOString()
  };
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