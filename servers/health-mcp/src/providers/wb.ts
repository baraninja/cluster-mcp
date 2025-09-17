import { getWithRetry, getJSON, mapRegionCode, type Series } from '@cluster-mcp/core';
import type { GetSeriesParams } from '../tools/get_series.js';

const BASE = 'https://api.worldbank.org/v2';

export async function getWorldBankSeries(
  indicatorId: string,
  params: GetSeriesParams
): Promise<Series | null> {
  const iso2 = mapRegionCode(params.geo ?? 'SE', 'ISO2');
  if (!iso2) {
    throw new Error(`Unable to map geo code ${params.geo ?? 'SE'} to ISO2 for World Bank request`);
  }

  const searchParams = new URLSearchParams({
    format: 'json',
    per_page: '20000'
  });

  if (params.years) {
    searchParams.set('date', `${Math.trunc(params.years[0])}:${Math.trunc(params.years[1])}`);
  }

  const url = `${BASE}/country/${iso2.toLowerCase()}/indicator/${indicatorId}?${searchParams}`;
  const { json } = await getWithRetry(() => getJSON(url));

  if (!Array.isArray(json) || json.length < 2) {
    return null;
  }

  const [, dataPoints] = json;
  const values = (dataPoints || [])
    .filter((point: any) => point?.value != null)
    .map((point: any) => ({
      time: String(point.date),
      value: Number(point.value),
      geo: iso2
    }))
    .sort((a: { time: string }, b: { time: string }) => a.time.localeCompare(b.time));

  if (values.length === 0) {
    return null;
  }

  return {
    semanticId: params.semanticId,
    unit: 'unknown',
    freq: 'A',
    values,
    source: {
      name: 'wb',
      id: indicatorId,
      url
    },
    retrievedAt: new Date().toISOString()
  };
}
