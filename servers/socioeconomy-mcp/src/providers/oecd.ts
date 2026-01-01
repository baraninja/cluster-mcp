import { getWithRetry, getJSON, MemoryCache } from '@cluster-mcp/core';
import type { Series } from '@cluster-mcp/core';

// Use stats.oecd.org which automatically redirects to the new sdmx.oecd.org format
// This is the most compatible approach with existing dataset IDs
const BASE = 'https://stats.oecd.org/SDMX-JSON/data';

// Cache for OECD data (1 hour TTL to avoid rate limits)
const oecdCache = new MemoryCache();
const CACHE_TTL = 3600000; // 1 hour

// ISO2 to ISO3 mapping for countries that OECD uses
const ISO2_TO_ISO3: Record<string, string> = {
  'SE': 'SWE', 'DE': 'DEU', 'FR': 'FRA', 'IT': 'ITA', 'ES': 'ESP',
  'GB': 'GBR', 'UK': 'GBR', 'US': 'USA', 'JP': 'JPN', 'AU': 'AUS',
  'CA': 'CAN', 'NL': 'NLD', 'BE': 'BEL', 'AT': 'AUT', 'CH': 'CHE',
  'DK': 'DNK', 'FI': 'FIN', 'NO': 'NOR', 'PL': 'POL', 'PT': 'PRT',
  'GR': 'GRC', 'IE': 'IRL', 'CZ': 'CZE', 'HU': 'HUN', 'SK': 'SVK',
  'SI': 'SVN', 'EE': 'EST', 'LV': 'LVA', 'LT': 'LTU', 'LU': 'LUX',
  'MT': 'MLT', 'CY': 'CYP', 'BG': 'BGR', 'RO': 'ROU', 'HR': 'HRV',
  'TR': 'TUR', 'IS': 'ISL', 'KR': 'KOR', 'MX': 'MEX', 'CL': 'CHL',
  'NZ': 'NZL', 'IL': 'ISR', 'CO': 'COL', 'CR': 'CRI'
};

/**
 * Parse SDMX-JSON 2.0 format from OECD
 * Structure: data.dataSets[0].series -> nested observations
 *           data.structures[0].dimensions.series -> series dimension metadata
 *           data.structures[0].dimensions.observation -> observation dimension metadata (TIME_PERIOD)
 */
function parseOecdSdmxJson2(
  json: any,
  targetGeo: string
): { time: string; value: number; geo?: string }[] {
  const data = json?.data;
  if (!data) return [];

  const structures = data.structures?.[0];
  const dataSets = data.dataSets?.[0];

  if (!structures || !dataSets?.series) return [];

  // Get dimension metadata
  const seriesDims = structures.dimensions?.series || [];
  const obsDims = structures.dimensions?.observation || [];

  // Find REF_AREA dimension position and values
  const refAreaDim = seriesDims.find((d: any) => d.id === 'REF_AREA');
  const refAreaPos = refAreaDim?.keyPosition ?? 0;
  const refAreaValues = refAreaDim?.values || [];

  // Find TIME_PERIOD dimension (observation level)
  const timeDim = obsDims.find((d: any) => d.id === 'TIME_PERIOD');
  const timeValues = timeDim?.values || [];

  // Find the series key(s) that match our target geography
  const targetGeoUpper = targetGeo.toUpperCase();
  const targetGeoIndex = refAreaValues.findIndex(
    (v: any) => v.id?.toUpperCase() === targetGeoUpper
  );

  const results: { time: string; value: number; geo?: string }[] = [];

  // Iterate through all series
  for (const [seriesKey, seriesData] of Object.entries(dataSets.series || {})) {
    const keyParts = seriesKey.split(':').map(Number);
    const geoIndex = keyParts[refAreaPos];

    // Skip if this series is not for our target geography
    if (targetGeoIndex >= 0 && geoIndex !== targetGeoIndex) continue;

    const geoCode = refAreaValues[geoIndex]?.id || targetGeo;
    const observations = (seriesData as any)?.observations || {};

    // Parse observations for this series
    for (const [obsKey, obsData] of Object.entries(observations)) {
      const obsIndex = parseInt(obsKey, 10);
      const time = timeValues[obsIndex]?.id;

      // obsData is typically [value, status] array
      const value = Array.isArray(obsData) ? obsData[0] : obsData;

      if (time && typeof value === 'number' && !Number.isNaN(value)) {
        results.push({
          time,
          value,
          geo: geoCode
        });
      }
    }
  }

  return results;
}

export async function getOecdSeries(
  datasetKey: string,
  geo = 'SE',
  years?: [number, number]
): Promise<Series> {
  // Convert ISO2 to ISO3 if needed (OECD prefers ISO3)
  const geoUpper = geo.toUpperCase();
  const geoFilter = ISO2_TO_ISO3[geoUpper] || geoUpper;

  // Build time filter for stats.oecd.org format
  const startTime = years ? `&startTime=${years[0]}` : '';
  const endTime = years ? `&endTime=${years[1]}` : '';

  const url = `${BASE}/${datasetKey}/${geoFilter}/all?${startTime}${endTime}`;

  // Check cache first
  const cacheKey = `oecd:${datasetKey}:${geoFilter}:${years ? years.join('-') : 'all'}`;
  const cached = oecdCache.get<Series>(cacheKey);
  if (cached) {
    return cached;
  }

  const { json } = await getWithRetry(() => getJSON(url));

  // SDMX-JSON 2.0 has data nested under 'data' property
  if (!(json as any)?.data?.dataSets?.[0]?.series) {
    throw new Error(`Invalid OECD response for ${datasetKey}`);
  }

  const allValues = parseOecdSdmxJson2(json as any, geoFilter);

  // Deduplicate by time period - take first value per year (most datasets have one primary series)
  const seenTimes = new Set<string>();
  const values = allValues.filter(v => {
    if (seenTimes.has(v.time)) return false;
    seenTimes.add(v.time);
    return true;
  });

  // Extract unit from structure metadata
  const structures = (json as any).data?.structures?.[0];
  const unitDim = structures?.dimensions?.series?.find((d: any) => d.id === 'UNIT_MEASURE');
  const defaultUnit = unitDim?.values?.[0]?.id || '';

  const series: Series = {
    semanticId: datasetKey,
    unit: defaultUnit,
    freq: 'A',
    values: values.sort((a, b) => a.time.localeCompare(b.time)),
    source: {
      name: 'oecd',
      id: datasetKey,
      url
    },
    definition: structures?.name || structures?.names?.en,
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
