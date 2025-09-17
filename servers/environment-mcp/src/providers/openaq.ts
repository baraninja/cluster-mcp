import { getJSON, getWithRetry, extractRateLimit, mapRegionCode, type RateLimitInfo } from '@cluster-mcp/core';
import type { GetAirQualityParams } from '../tools/get_air_quality.js';
import type { LatestAtParams } from '../tools/latest_at.js';

const BASE_URL = 'https://api.openaq.org/v3';
const DEFAULT_LIMIT = 100;
const MAX_SENSOR_REQUESTS = 5;

const PARAMETER_IDS: Record<string, number> = {
  pm10: 1,
  pm25: 2,
  o3: 3,
  co: 4,
  no2: 5,
  so2: 6,
  pm1: 19
};

export interface OpenAQLocationMeasurement {
  locationId: number | string;
  location?: string;
  city?: string;
  country?: string;
  parameter: string;
  value: number;
  unit?: string;
  dateUtc?: string;
  latitude?: number;
  longitude?: number;
  sourceNames?: string[];
}

export interface OpenAQResponse<T = unknown> {
  meta?: Record<string, unknown>;
  results: T[];
  rateLimit?: RateLimitInfo;
  url: string;
  suggestions?: OpenAQSiteSummary[];
  parameterLatest?: OpenAQLocationMeasurement[];
}

export interface OpenAQSiteSummary {
  locationId: number | string;
  location?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  parameters?: string[];
  latitude?: number;
  longitude?: number;
  sensors?: { id: number; parameter: string }[];
}

const countryIdCache = new Map<string, number>();

export async function fetchMeasurements(
  params: GetAirQualityParams
): Promise<OpenAQResponse<OpenAQLocationMeasurement>> {
  const normalizedParameter = params.parameter.toLowerCase();
  const isoCountry = params.country ? mapRegionCode(params.country, 'ISO2') ?? params.country : undefined;
  const locations = await suggestLocations({
    city: params.city,
    country: isoCountry,
    parameter: normalizedParameter
  });

  const sensorTargets: Array<{ location: OpenAQSiteSummary; sensorId: number }> = [];
  for (const location of locations) {
    if (!location.sensors) continue;
    for (const sensor of location.sensors) {
      if (sensor.parameter.toLowerCase() === normalizedParameter) {
        sensorTargets.push({ location, sensorId: sensor.id });
      }
    }
  }

  if (sensorTargets.length === 0 && locations.length > 0) {
    for (const location of locations.slice(0, 5)) {
      const sensors = await fetchLocationSensors(location.locationId);
      for (const sensor of sensors) {
        if (sensor.parameter.toLowerCase() === normalizedParameter) {
          sensorTargets.push({ location, sensorId: sensor.id });
        }
      }
      if (sensorTargets.length >= MAX_SENSOR_REQUESTS) {
        break;
      }
    }
  }

  const results: OpenAQLocationMeasurement[] = [];
  let lastRateLimit: RateLimitInfo | undefined;
  let lastUrl = '';

  for (const target of sensorTargets.slice(0, MAX_SENSOR_REQUESTS)) {
    const { json, rateLimit, url } = await request(
      `sensors/${target.sensorId}/measurements`,
      buildMeasurementSearch(params)
    );
    lastRateLimit = rateLimit;
    lastUrl = url;
    const rows = Array.isArray(json?.results) ? json.results : [];
    for (const row of rows) {
      const measurement = normaliseMeasurement({
        ...row,
        parameter: normalizedParameter,
        locationId: target.location.locationId,
        location: target.location.location,
        city: target.location.city,
        country: target.location.country,
        coordinates: row.coordinates ?? {
          latitude: target.location.latitude,
          longitude: target.location.longitude
        }
      });
      results.push(measurement);
      if (results.length >= DEFAULT_LIMIT) break;
    }
    if (results.length >= DEFAULT_LIMIT) break;
  }

  if (results.length > 0) {
    return {
      meta: { sensorsQueried: sensorTargets.slice(0, MAX_SENSOR_REQUESTS).map((s) => s.sensorId) },
      results,
      rateLimit: lastRateLimit,
      url: lastUrl,
      suggestions: locations
    };
  }

  const directMeasurements = await fetchDirectMeasurements(params, normalizedParameter);
  if (directMeasurements.results.length > 0) {
    return {
      ...directMeasurements,
      suggestions: locations.length ? locations : directMeasurements.suggestions
    };
  }

  const fallbackMeta = directMeasurements.meta ?? { message: 'No sensor-level measurements available for requested filters' };

  const responsePayload: OpenAQResponse<OpenAQLocationMeasurement> = {
    meta: fallbackMeta,
    results: [],
    rateLimit: lastRateLimit,
    url: '',
    suggestions: locations
  };

  if (!isoCountry) {
    responsePayload.parameterLatest = await fetchParameterLatest(normalizedParameter);
  }

  return responsePayload;
}

export async function fetchLatest(
  params: LatestAtParams
): Promise<OpenAQResponse<OpenAQLocationMeasurement>> {
  const response = await request(`locations/${encodeURIComponent(params.locationId)}/latest`);
  const rows = Array.isArray(response.json?.results) ? response.json.results : [];
  const results: OpenAQLocationMeasurement[] = [];

  for (const row of rows) {
    const sensorId = row.sensorsId ?? row.sensorId;
    let parameterName: string | undefined;
    if (sensorId) {
      const sensorDetails = await request(`sensors/${sensorId}`);
      const sensorPayload = Array.isArray(sensorDetails.json?.results)
        ? sensorDetails.json.results[0]
        : sensorDetails.json;
      parameterName = sensorPayload?.parameter?.name ?? sensorPayload?.parameter?.id;
    }
    results.push(
      normaliseMeasurement({
        ...row,
        parameter: parameterName ?? 'unknown',
        locationId: row.locationsId ?? params.locationId,
        location: row.location,
        country: row.country,
        city: row.city
      })
    );
  }

  return {
    meta: response.json?.meta,
    results,
    rateLimit: response.rateLimit,
    url: response.url
  };
}

export async function suggestLocations(options: {
  city?: string;
  country?: string;
  parameter?: string;
}): Promise<OpenAQSiteSummary[]> {
  const search = new URLSearchParams({ limit: '50' });
  search.set('include', 'sensors');
  if (options.city) search.set('city', options.city);
  if (options.parameter) {
    const id = PARAMETER_IDS[options.parameter.toLowerCase()];
    if (id) {
      search.set('parameters_id', String(id));
    } else {
      search.set('parameter', options.parameter);
    }
  }

  if (options.country) {
    const iso2 = options.country.toUpperCase();
    const countryId = await getCountryId(iso2);
    if (countryId) {
      search.set('countries_id', String(countryId));
    }
  }

  const response = await request('locations', search);
  if (!Array.isArray(response.json?.results)) return [];

  const isoFilter = options.country ? options.country.toUpperCase() : undefined;

  const mapped = response.json.results.map((item: any) => ({
    locationId: item.id ?? item.locationId ?? item.location,
    location: item.name ?? item.location,
    city: item.city,
    country: typeof item.country === 'string' ? item.country : item.country?.name ?? item.country?.code,
    countryCode: typeof item.country === 'string' ? item.country : item.country?.code,
    parameters: Array.isArray(item.parameters)
      ? item.parameters.map((p: any) => p.parameter?.name ?? p.parameter ?? p)
      : undefined,
    latitude: item.coordinates?.latitude,
    longitude: item.coordinates?.longitude,
    sensors: Array.isArray(item.sensors)
      ? item.sensors.map((sensor: any) => ({
          id: sensor.id,
          parameter: sensor.parameter?.name ?? sensor.parameter ?? 'unknown'
        }))
      : undefined
  }));

  return isoFilter
    ? mapped.filter((location: OpenAQSiteSummary) =>
        location.countryCode?.toUpperCase() === isoFilter || location.country?.toUpperCase() === isoFilter
      )
    : mapped;
}

interface RequestResult {
  json: any;
  url: string;
  rateLimit?: RateLimitInfo;
}

function buildMeasurementSearch(params: GetAirQualityParams): URLSearchParams {
  const search = new URLSearchParams({ limit: String(DEFAULT_LIMIT) });
  if (params.period?.from) search.set('date_from', normaliseDate(params.period.from, 'start'));
  if (params.period?.to) search.set('date_to', normaliseDate(params.period.to, 'end'));
  return search;
}

async function fetchParameterLatest(parameter: string): Promise<OpenAQLocationMeasurement[]> {
  const parameterId = PARAMETER_IDS[parameter.toLowerCase()];
  if (!parameterId) return [];
  const response = await request(`parameters/${parameterId}/latest`, new URLSearchParams({ limit: '20' }));
  const rows = Array.isArray(response.json?.results) ? response.json.results : [];
  return rows.map((row: any) => normaliseMeasurement({ ...row, parameter }));
}

async function fetchLocationSensors(locationId: number | string): Promise<Array<{ id: number; parameter: string }>> {
  const response = await request(`locations/${encodeURIComponent(locationId)}/sensors`, new URLSearchParams({ limit: '50' }));
  const rows = Array.isArray(response.json?.results) ? response.json.results : [];
  return rows
    .map((row: any) => ({
      id: row.id,
      parameter: row.parameter?.name ?? row.parameter?.id ?? row.parameter ?? 'unknown'
    }))
    .filter((sensor: { id: number | string; parameter: string }) => typeof sensor.id === 'number' || typeof sensor.id === 'string');
}

async function fetchDirectMeasurements(
  params: GetAirQualityParams,
  parameter: string
): Promise<OpenAQResponse<OpenAQLocationMeasurement>> {
  const search = buildMeasurementSearch(params);
  const parameterId = PARAMETER_IDS[parameter.toLowerCase()];
  if (parameterId) {
    search.set('parameters_id', String(parameterId));
  } else {
    search.set('parameter', parameter);
  }
  const iso2 = params.country ? mapRegionCode(params.country, 'ISO2') ?? params.country.toUpperCase() : undefined;
  if (iso2) {
    search.set('country', iso2);
    const countryId = await getCountryId(iso2);
    if (countryId) {
      const id = String(countryId);
      search.set('countries_id', id);
      search.set('country_id', id);
    }
  }
  if (params.city) {
    search.set('city', params.city);
  }

  const response = await request('measurements', search);
  const rows = Array.isArray(response.json?.results) ? response.json.results : [];
  const isoFilter = iso2 ? iso2.toUpperCase() : undefined;
  const measurements: OpenAQLocationMeasurement[] = rows.map((row: any) =>
    normaliseMeasurement({
      ...row,
      parameter,
      locationId: row.locationId ?? row.location_id ?? row.location
    })
  );

  const filtered = isoFilter
    ? measurements.filter((row: OpenAQLocationMeasurement) => row.country?.toUpperCase() === isoFilter)
    : measurements;

  let results = filtered.slice(0, DEFAULT_LIMIT);

  if (isoFilter && results.length === 0) {
    return {
      meta: { message: `No measurements returned for ISO2=${isoFilter}` },
      results: [],
      rateLimit: response.rateLimit,
      url: response.url,
      suggestions: []
    };
  }

  if (!isoFilter && results.length === 0) {
    results = measurements.slice(0, DEFAULT_LIMIT);
  }

  return {
    meta: response.json?.meta,
    results,
    rateLimit: response.rateLimit,
    url: response.url,
    suggestions: []
  };
}

async function getCountryId(iso2: string): Promise<number | undefined> {
  const key = iso2.toUpperCase();
  if (countryIdCache.has(key)) return countryIdCache.get(key);
  const response = await request('countries', new URLSearchParams({ code: key }));
  const id = response.json?.results?.[0]?.id;
  if (typeof id === 'number') {
    countryIdCache.set(key, id);
    return id;
  }
  return undefined;
}

async function request(path: string, searchParams?: URLSearchParams): Promise<RequestResult> {
  const base = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  const cleanPath = path.replace(/^\/+/, '');
  const url = new URL(cleanPath, base);
  if (searchParams) {
    for (const [key, value] of searchParams.entries()) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json'
  };

  const apiKey = process.env.OPENAQ_API_KEY;
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  try {
    const { json, headers: responseHeaders, rateLimit } = await getWithRetry(() => getJSON(url.toString(), headers));
    return {
      json,
      url: url.toString(),
      rateLimit: rateLimit ?? extractRateLimit(responseHeaders)
    };
  } catch (error) {
    if (error instanceof Error && /404/.test(error.message)) {
      return {
        json: { results: [], meta: { note: 'Not Found' } },
        url: url.toString()
      };
    }
    throw error;
  }
}

function normaliseMeasurement(raw: any): OpenAQLocationMeasurement {
  const coordinates = raw.coordinates || raw.coordinate || {};
  const date = raw.date?.utc ?? raw.dateUtc ?? raw.date_utc ?? raw.datetime?.utc ?? raw.datetime;
  const locationId = raw.locationId ?? raw.location_id ?? raw.location ?? raw.id;
  const locationName = raw.location ?? raw.locationName ?? raw.name;
  const sourceNames = Array.isArray(raw.sourceNames)
    ? raw.sourceNames
    : raw.sourceName
    ? [raw.sourceName]
    : undefined;
  const parameter = typeof raw.parameter === 'string'
    ? raw.parameter
    : raw.parameter?.name ?? raw.parameter?.id ?? 'unknown';
  const country = typeof raw.country === 'string'
    ? raw.country
    : raw.country?.code ?? raw.country?.name;

  return {
    locationId,
    location: locationName,
    city: raw.city,
    country,
    parameter,
    value: Number(raw.value),
    unit: raw.unit ?? raw.parameter?.units,
    dateUtc: date ? String(date) : undefined,
    latitude: typeof coordinates.latitude === 'number' ? coordinates.latitude : undefined,
    longitude: typeof coordinates.longitude === 'number' ? coordinates.longitude : undefined,
    sourceNames
  };
}

function normaliseDate(value: string, boundary: 'start' | 'end'): string {
  if (!value) return value;
  if (value.includes('T')) return value;
  if (boundary === 'start') {
    return `${value}T00:00:00Z`;
  }
  return `${value}T23:59:59Z`;
}
