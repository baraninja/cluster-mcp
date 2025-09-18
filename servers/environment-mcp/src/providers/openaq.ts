import {
  getJSON,
  getWithRetry,
  extractRateLimit,
  mapRegionCode,
  getCountry,
  type RateLimitInfo
} from '@cluster-mcp/core';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { GetAirQualityParams } from '../tools/get_air_quality.js';
import type { LatestAtParams } from '../tools/latest_at.js';
import type { SearchLocationsParams } from '../tools/search_locations.js';


const BASE_URL = 'https://api.openaq.org/v3';
const DEFAULT_LIMIT = 100;
const MAX_SENSOR_REQUESTS = 5;
const MAX_RESULTS_PER_SENSOR = 1000;
const DEFAULT_RADIUS_KM = 50;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COUNTRIES_DATA_PATH = path.resolve(__dirname, '..', 'data', 'openaq_countries.json');
const openAqCountries = JSON.parse(readFileSync(COUNTRIES_DATA_PATH, 'utf8')) as {
  countries?: Record<string, any>;
  reverse?: Record<string, any>;
};

type OpenAQCountryEntry = { id: number; code: string; name: string };
const OPENAQ_COUNTRIES: Record<string, OpenAQCountryEntry> = (openAqCountries?.countries ?? {}) as Record<string, OpenAQCountryEntry>;
const OPENAQ_COUNTRIES_BY_ID: Record<number, OpenAQCountryEntry> = (openAqCountries?.reverse ?? {}) as Record<number, OpenAQCountryEntry>;

const HEALTH_GUIDELINES: Record<string, { limit: number; label: string }> = {
  pm25: { limit: 15, label: 'WHO 24h guideline (15 µg/m³)' },
  pm10: { limit: 45, label: 'WHO 24h guideline (45 µg/m³)' },
  no2: { limit: 25, label: 'WHO 24h guideline (25 µg/m³)' },
  o3: { limit: 100, label: 'WHO 8h guideline (100 µg/m³)' },
  so2: { limit: 40, label: 'WHO 24h guideline (40 µg/m³)' }
};

const PARAMETER_IDS: Record<string, number> = {
  pm10: 1,
  pm25: 2,
  o3: 3,
  co: 4,
  no2: 5,
  so2: 6,
  pm1: 19
};

function getOpenAQCountryInfo(code?: string): OpenAQCountryEntry | undefined {
  if (!code) return undefined;
  const trimmed = code.trim();
  if (!trimmed) return undefined;

  const iso2 = mapRegionCode(trimmed, 'ISO2');
  if (iso2) {
    const match = OPENAQ_COUNTRIES[iso2.toUpperCase()];
    if (match) return match;
  }

  const direct = OPENAQ_COUNTRIES[trimmed.toUpperCase()];
  if (direct) return direct;

  const iso3 = mapRegionCode(trimmed, 'ISO3');
  if (iso3) {
    const match = OPENAQ_COUNTRIES[iso3.toUpperCase()];
    if (match) return match;
  }

  const byName = Object.values(OPENAQ_COUNTRIES).find((entry) => entry.name.toUpperCase() === trimmed.toUpperCase());
  if (byName) return byName;

  const country = getCountry(trimmed);
  if (country) {
    const mapped = OPENAQ_COUNTRIES[country.iso2.toUpperCase()] ?? OPENAQ_COUNTRIES[country.iso3.toUpperCase()];
    if (mapped) return mapped;
    const byOfficialName = Object.values(OPENAQ_COUNTRIES).find((entry) => entry.name.toUpperCase() === country.name.toUpperCase());
    if (byOfficialName) return byOfficialName;
  }

  return undefined;
}

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
  sensorId?: number | string;
  health?: HealthAssessment;
}

export interface HealthAssessment {
  status: 'meets_guideline' | 'exceeds_guideline';
  guideline: string;
  exceedance?: number;
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

export interface OpenAQLocationSearchResult {
  query: SearchLocationsParams;
  results: OpenAQSiteSummary[];
  rateLimit?: RateLimitInfo;
  url: string;
  meta?: Record<string, unknown>;
}

export interface HistoricalMeasurementsParams {
  locationId: number | string;
  parameter: string;
  period?: { from?: string; to?: string };
  limit?: number;
  sensorLimit?: number;
}

export interface AveragedMeasurementsParams {
  locationId: number | string;
  parameter: string;
  averaging: 'hours' | 'days' | 'months' | 'years';
  rollup?: string;
  period?: { from?: string; to?: string };
  limit?: number;
  sensorLimit?: number;
}

export interface OpenAQAveragedMeasurement {
  sensorId: number | string;
  parameter: string;
  value: number;
  unit?: string;
  periodStartUtc?: string;
  periodEndUtc?: string;
  locationId?: number | string;
  location?: string;
  city?: string;
  country?: string;
  coverage?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  health?: HealthAssessment;
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

export async function searchLocations(params: SearchLocationsParams): Promise<OpenAQLocationSearchResult> {
  const isoCountry = params.country ? mapRegionCode(params.country, 'ISO2') ?? params.country : undefined;
  const requestLimit = Math.min(params.limit ?? 50, 1000);
  const maxPages = 5;
  const baseParams = new URLSearchParams({ limit: String(requestLimit) });
  const countryInfo = getOpenAQCountryInfo(isoCountry ?? params.country);

  if (params.includeSensors ?? true) {
    baseParams.set('include', 'sensors');
  }

  if (params.parameter) {
    const id = PARAMETER_IDS[params.parameter.toLowerCase()];
    if (id) {
      baseParams.set('parameters_id', String(id));
    } else {
      baseParams.set('parameter', params.parameter);
    }
  }

  if (isoCountry) {
    const isoUpper = isoCountry.toUpperCase();
    baseParams.set('country', isoUpper);
    if (countryInfo) {
      baseParams.set('countries_id', String(countryInfo.id));
    } else {
      const fallbackId = await getCountryId(isoUpper);
      if (fallbackId) {
        baseParams.set('countries_id', String(fallbackId));
      }
    }
  } else if (countryInfo) {
    baseParams.set('countries_id', String(countryInfo.id));
  }

  if (params.city) {
    baseParams.set('city', params.city);
  }

  if (params.bbox) {
    const { west, south, east, north } = params.bbox;
    baseParams.set('bbox', `${west},${south},${east},${north}`);
  }

  if (params.coordinates) {
    const { latitude, longitude, radiusKm } = params.coordinates;
    baseParams.set('coordinates', `${latitude},${longitude}`);
    if (radiusKm) {
      const meters = Math.round(Math.min(Math.max(radiusKm, 0.1), 25) * 1000);
      baseParams.set('radius', String(meters));
    }
  }

  const collected: Record<string | number, OpenAQSiteSummary> = {};
  const candidateSamples: OpenAQSiteSummary[] = [];
  const metadataFilters: Record<string, unknown> = {};
  let totalRaw = 0;
  let lastRateLimit: RateLimitInfo | undefined;
  let lastUrl = '';
  let pagesFetched = 0;
  let apiMeta: Record<string, unknown> | undefined;

  for (let page = 1; page <= maxPages; page++) {
    if (Object.keys(collected).length >= requestLimit) break;

    const searchParams = new URLSearchParams(baseParams);
    searchParams.set('page', String(page));
    const response = await request('locations', searchParams);
    lastRateLimit = response.rateLimit;
    lastUrl = response.url;
    apiMeta = response.json?.meta ?? apiMeta;
    pagesFetched += 1;

    const rows = Array.isArray(response.json?.results) ? response.json.results : [];
    totalRaw += rows.length;

    if (candidateSamples.length < 10) {
      for (const item of rows) {
        candidateSamples.push(mapLocation(item));
        if (candidateSamples.length >= 10) break;
      }
    }

    let filtered = rows.map((item: any) => mapLocation(item));

    if (isoCountry || params.country) {
      const tokens = new Set<string>();
      const addToken = (value?: string) => {
        if (!value) return;
        const trimmed = value.trim();
        if (!trimmed) return;
        tokens.add(trimmed.toUpperCase());
        const iso2Token = mapRegionCode(trimmed, 'ISO2');
        if (iso2Token) tokens.add(iso2Token.toUpperCase());
        const iso3Token = mapRegionCode(trimmed, 'ISO3');
        if (iso3Token) tokens.add(iso3Token.toUpperCase());
        const info =
          getCountry(trimmed) ||
          (iso3Token ? getCountry(iso3Token) : undefined) ||
          (iso2Token ? getCountry(iso2Token) : undefined);
        if (info?.name) {
          tokens.add(info.name.toUpperCase());
          tokens.add(info.iso2.toUpperCase());
          tokens.add(info.iso3.toUpperCase());
        }
      };

      addToken(isoCountry ?? undefined);
      addToken(params.country ?? undefined);
      if (countryInfo) {
        addToken(countryInfo.code);
        addToken(countryInfo.name);
      }

      filtered = filtered.filter((location: OpenAQSiteSummary) => {
        const candidates: string[] = [];
        if (location.countryCode) candidates.push(String(location.countryCode));
        if (location.country) candidates.push(String(location.country));

        for (const candidate of candidates) {
          const upper = candidate.toUpperCase();
          if (tokens.has(upper)) return true;
          const iso2 = mapRegionCode(candidate, 'ISO2');
          if (iso2 && tokens.has(iso2.toUpperCase())) return true;
          const iso3 = mapRegionCode(candidate, 'ISO3');
          if (iso3 && tokens.has(iso3.toUpperCase())) return true;
          const info = getCountry(candidate);
          if (info) {
            if (
              tokens.has(info.iso2.toUpperCase()) ||
              tokens.has(info.iso3.toUpperCase()) ||
              tokens.has(info.name.toUpperCase())
            ) {
              return true;
            }
          }
        }

        return false;
      });

      metadataFilters.countryTokens = Array.from(tokens);
      metadataFilters.countryCandidates = candidateSamples.map((location: OpenAQSiteSummary) => ({
        locationId: location.locationId,
        country: location.country,
        countryCode: location.countryCode
      }));
    }

    if (params.city) {
      const cityNeedle = params.city.trim().toLowerCase();
      const exactMatches = filtered.filter((location: OpenAQSiteSummary) => location.city?.toLowerCase() === cityNeedle);
      if (exactMatches.length > 0) {
        filtered = exactMatches;
      } else {
        filtered = filtered.filter((location: OpenAQSiteSummary) =>
          location.city?.toLowerCase().includes(cityNeedle)
        );
      }
      metadataFilters.cityExactMatch = exactMatches.length > 0;
      metadataFilters.cityQuery = cityNeedle;
    }

    for (const location of filtered) {
      if (collected[location.locationId]) continue;
      collected[location.locationId] = location;
      if (Object.keys(collected).length >= requestLimit) break;
    }

    if (rows.length < requestLimit) {
      break;
    }
  }

  const finalResults = Object.values(collected).slice(0, requestLimit);

  return {
    query: params,
    results: finalResults,
    rateLimit: lastRateLimit,
    url: lastUrl,
    meta: {
      ...apiMeta,
      totalFound: totalRaw,
      filteredCount: finalResults.length,
      pagesFetched,
      filters: {
        ...metadataFilters,
        countryMapping: countryInfo ? { id: countryInfo.id, code: countryInfo.code, name: countryInfo.name } : null
      }
    }
  };
}


export async function suggestLocations(options: {
  city?: string;
  country?: string;
  parameter?: string;
}): Promise<OpenAQSiteSummary[]> {
  const result = await searchLocations({
    city: options.city,
    country: options.country,
    parameter: options.parameter,
    includeSensors: true,
    limit: 50
  });

  if (!options.country) {
    return result.results;
  }

  const isoFilter = options.country.toUpperCase();
  return result.results.filter((location) =>
    location.countryCode?.toUpperCase() === isoFilter || location.country?.toUpperCase() === isoFilter
  );
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

async function fetchLocationSummary(locationId: number | string): Promise<OpenAQSiteSummary | undefined> {
  const response = await request(`locations/${encodeURIComponent(locationId)}`);
  const payload = response.json?.results ?? response.json;
  if (Array.isArray(payload) && payload.length > 0) {
    return mapLocation(payload[0]);
  }
  if (payload && typeof payload === 'object') {
    return mapLocation(payload);
  }
  return undefined;
}

function findSensorsForParameter(
  sensors: Array<{ id: number; parameter: string }>,
  parameter: string,
  limit?: number
): Array<{ id: number; parameter: string }> {
  const target = parameter.toLowerCase();
  const matches = sensors.filter((sensor) => sensor.parameter?.toLowerCase() === target);
  if (matches.length === 0) {
    return [];
  }
  if (limit && limit > 0) {
    return matches.slice(0, limit);
  }
  return matches;
}

function buildHistoricalSearch(
  period: HistoricalMeasurementsParams['period'],
  limit: number
): URLSearchParams {
  const cappedLimit = Math.min(Math.max(limit, 1), 1000);
  const search = new URLSearchParams({ limit: String(cappedLimit) });
  if (period?.from) {
    search.set('date_from', normaliseDate(period.from, 'start'));
  }
  if (period?.to) {
    search.set('date_to', normaliseDate(period.to, 'end'));
  }
  return search;
}

function buildAveragedSearch(
  period: AveragedMeasurementsParams['period'],
  limit: number,
  rollup?: string
): URLSearchParams {
  const cappedLimit = Math.min(Math.max(limit, 1), 1000);
  const search = new URLSearchParams({ limit: String(cappedLimit) });
  if (period?.from) {
    search.set('date_from', normaliseDate(period.from, 'start'));
  }
  if (period?.to) {
    search.set('date_to', normaliseDate(period.to, 'end'));
  }
  if (rollup) {
    search.set('rollup', rollup);
  }
  return search;
}

export async function fetchHistoricalMeasurements(
  params: HistoricalMeasurementsParams
): Promise<OpenAQResponse<OpenAQLocationMeasurement>> {
  const sensors = await fetchLocationSensors(params.locationId);
  const locationSummary = await fetchLocationSummary(params.locationId).catch(() => undefined);
  const matches = findSensorsForParameter(
    sensors,
    params.parameter,
    params.sensorLimit ?? MAX_SENSOR_REQUESTS
  );

  if (matches.length === 0) {
    const suggestions = await suggestNearbyLocations(params.parameter, locationSummary);
    return {
      meta: {
        message: `No sensors measuring ${params.parameter} for location ${params.locationId}`,
        location: locationSummary,
        suggestions
      },
      results: [],
      rateLimit: undefined,
      url: '',
      suggestions
    };
  }

  const perSensorLimit = Math.min(
    Math.max(Math.ceil((params.limit ?? DEFAULT_LIMIT) / matches.length), 1),
    MAX_RESULTS_PER_SENSOR
  );
  const totalLimit = Math.min(params.limit ?? DEFAULT_LIMIT, perSensorLimit * matches.length);
  const searchTemplate = buildHistoricalSearch(params.period, perSensorLimit);

  const results: OpenAQLocationMeasurement[] = [];
  let lastRateLimit: RateLimitInfo | undefined;
  const sensorMeta: Array<{ sensorId: number | string; parameter: string }> = [];
  let lastUrl = '';

  for (const sensor of matches) {
    const response = await request(
      `sensors/${sensor.id}/measurements`,
      new URLSearchParams(searchTemplate)
    );
    lastRateLimit = response.rateLimit;
    lastUrl = response.url;
    sensorMeta.push({ sensorId: sensor.id, parameter: sensor.parameter });
    const rows = Array.isArray(response.json?.results) ? response.json.results : [];

    for (const row of rows) {
      const measurement = normaliseMeasurement(row);
      measurement.sensorId = sensor.id;
      if (!measurement.location && locationSummary?.location) {
        measurement.location = locationSummary.location;
      }
      if (!measurement.city && locationSummary?.city) {
        measurement.city = locationSummary.city;
      }
      if (!measurement.country && locationSummary?.country) {
        measurement.country = locationSummary.country;
      }
      if (!measurement.locationId) {
        measurement.locationId = params.locationId;
      }
      results.push(measurement);
      if (results.length >= totalLimit) break;
    }

    if (results.length >= totalLimit) break;
  }

  results.sort((a, b) => {
    const aDate = a.dateUtc ? Date.parse(a.dateUtc) : 0;
    const bDate = b.dateUtc ? Date.parse(b.dateUtc) : 0;
    return aDate - bDate;
  });

  if (results.length === 0) {
    const suggestions = await suggestNearbyLocations(params.parameter, locationSummary);
    return {
      meta: {
        message: 'No measurements returned for specified period',
        location: locationSummary,
        sensorsQueried: sensorMeta,
        suggestions
      },
      results,
      rateLimit: lastRateLimit,
      url: lastUrl,
      suggestions
    };
  }

  return {
    meta: {
      sensorsQueried: sensorMeta,
      location: locationSummary
    },
    results,
    rateLimit: lastRateLimit,
    url: lastUrl,
    suggestions: []
  };
}

export async function fetchAveragedMeasurements(
  params: AveragedMeasurementsParams
): Promise<OpenAQResponse<OpenAQAveragedMeasurement>> {
  const sensors = await fetchLocationSensors(params.locationId);
  const locationSummary = await fetchLocationSummary(params.locationId).catch(() => undefined);
  const matches = findSensorsForParameter(
    sensors,
    params.parameter,
    params.sensorLimit ?? MAX_SENSOR_REQUESTS
  );

  if (matches.length === 0) {
    const suggestions = await suggestNearbyLocations(params.parameter, locationSummary);
    return {
      meta: {
        message: `No sensors measuring ${params.parameter} for location ${params.locationId}`,
        location: locationSummary,
        suggestions
      },
      results: [],
      rateLimit: undefined,
      url: '',
      suggestions
    };
  }

  const averagingPath: Record<string, string> = {
    hours: 'hours',
    days: 'days',
    months: 'months',
    years: 'years'
  };

  const path = averagingPath[params.averaging];
  if (!path) {
    throw new Error(`Unsupported averaging interval: ${params.averaging}`);
  }

  const perSensorLimit = Math.min(
    Math.max(Math.ceil((params.limit ?? DEFAULT_LIMIT) / matches.length), 1),
    1000
  );
  const totalLimit = Math.min(params.limit ?? DEFAULT_LIMIT, perSensorLimit * matches.length);
  const searchTemplate = buildAveragedSearch(params.period, perSensorLimit, params.rollup);
  const results: OpenAQAveragedMeasurement[] = [];
  let lastRateLimit: RateLimitInfo | undefined;
  let lastUrl = '';
  const sensorMeta: Array<{ sensorId: number | string; parameter: string }> = [];

  for (const sensor of matches) {
    const response = await request(
      `sensors/${sensor.id}/${path}`,
      new URLSearchParams(searchTemplate)
    );
    lastRateLimit = response.rateLimit;
    lastUrl = response.url;
    sensorMeta.push({ sensorId: sensor.id, parameter: sensor.parameter });
    const rows = Array.isArray(response.json?.results) ? response.json.results : [];

    for (const row of rows) {
      const value = Number(
        row.value ?? row.average ?? row.avg ?? row.mean ?? row.measurement ?? row.aggregate
      );
      if (!Number.isFinite(value)) continue;

      const periodStart = row.period?.from ?? row.datetime ?? row.dateFrom ?? row.date ?? row.from;
      const periodEnd = row.period?.to ?? row.dateTo ?? row.to;

      const health = evaluateHealth(params.parameter, value);
      results.push({
        sensorId: sensor.id,
        parameter: params.parameter,
        value,
        unit: row.unit ?? row.parameter?.units,
        periodStartUtc: periodStart ? String(periodStart) : undefined,
        periodEndUtc: periodEnd ? String(periodEnd) : undefined,
        locationId: locationSummary?.locationId ?? params.locationId,
        location: locationSummary?.location,
        city: locationSummary?.city,
        country: locationSummary?.country,
        coverage: row.coverage,
        meta: row.statistics ?? row.stats ?? row.metadata,
        health
      });

      if (results.length >= totalLimit) break;
    }

    if (results.length >= totalLimit) break;
  }

  results.sort((a, b) => {
    const aDate = a.periodStartUtc ? Date.parse(a.periodStartUtc) : 0;
    const bDate = b.periodStartUtc ? Date.parse(b.periodStartUtc) : 0;
    return aDate - bDate;
  });

  if (results.length === 0) {
    const suggestions = await suggestNearbyLocations(params.parameter, locationSummary);
    return {
      meta: {
        message: 'No averaged measurements available for specified period',
        sensorsQueried: sensorMeta,
        location: locationSummary,
        averaging: params.averaging,
        rollup: params.rollup,
        suggestions
      },
      results,
      rateLimit: lastRateLimit,
      url: lastUrl,
      suggestions
    };
  }

  return {
    meta: {
      sensorsQueried: sensorMeta,
      location: locationSummary,
      averaging: params.averaging,
      rollup: params.rollup
    },
    results,
    rateLimit: lastRateLimit,
    url: lastUrl,
    suggestions: []
  };
}

export async function fetchDataAvailability(
  locationId: number | string,
  parameter?: string
): Promise<{
  location?: OpenAQSiteSummary;
  sensors: Array<{
    sensorId: number | string;
    parameter: string;
    firstSeen?: string;
    lastSeen?: string;
    measurementCount?: number;
    coverage?: Record<string, unknown>;
  }>;
  url: string;
  rateLimit?: RateLimitInfo;
}> {
  const summary = await fetchLocationSummary(locationId).catch(() => undefined);
  const response = await request(`locations/${encodeURIComponent(locationId)}/sensors`, new URLSearchParams({ limit: '200' }));
  const rows = Array.isArray(response.json?.results) ? response.json.results : [];
  const targetParam = parameter?.toLowerCase();

  const sensors = rows
    .map((sensor: any) => {
      const paramName = sensor.parameter?.name ?? sensor.parameter?.id ?? sensor.parameter ?? 'unknown';
      return {
        sensorId: sensor.id,
        parameter: paramName,
        firstSeen: sensor.datetimeFirst ?? sensor.firstSeen ?? sensor.startDate,
        lastSeen: sensor.datetimeLast ?? sensor.lastSeen ?? sensor.endDate,
        measurementCount: sensor.count ?? sensor.measurementsCount ?? sensor.total,
        coverage: sensor.coverage
      };
    })
    .filter((sensor: { parameter: string }) => (targetParam ? sensor.parameter.toLowerCase() === targetParam : true));

  return {
    location: summary,
    sensors,
    url: response.url,
    rateLimit: response.rateLimit
  };
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
    const alternatives = await searchLocations({
      parameter,
      country: iso2,
      includeSensors: false,
      limit: 20
    });
    return {
      meta: {
        message: `No measurements returned for ISO2=${isoFilter}`,
        suggestions: alternatives.results
      },
      results: [],
      rateLimit: response.rateLimit,
      url: response.url,
      suggestions: alternatives.results
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
  const mapped = getOpenAQCountryInfo(key);
  if (mapped) {
    countryIdCache.set(key, mapped.id);
    return mapped.id;
  }
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

  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAQ_API_KEY is required to use environment-mcp');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-API-Key': apiKey
  };

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
    sourceNames,
    health: evaluateHealth(parameter, Number(raw.value))
  };
}

function mapLocation(item: any): OpenAQSiteSummary {
  return {
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

function evaluateHealth(parameter: string, value: number): HealthAssessment | undefined {
  if (!Number.isFinite(value)) return undefined;
  const guideline = HEALTH_GUIDELINES[parameter.toLowerCase()];
  if (!guideline) return undefined;
  if (value <= guideline.limit) {
    return {
      status: 'meets_guideline',
      guideline: guideline.label
    };
  }
  return {
    status: 'exceeds_guideline',
    guideline: guideline.label,
    exceedance: Number((value - guideline.limit).toFixed(2))
  };
}

async function suggestNearbyLocations(
  parameter: string,
  reference: OpenAQSiteSummary | undefined,
  radiusKm = DEFAULT_RADIUS_KM
): Promise<OpenAQSiteSummary[]> {
  if (!reference?.latitude || !reference.longitude) {
    if (reference?.country) {
      const countrySearch = await searchLocations({
        parameter,
        country: reference.country,
        includeSensors: false,
        limit: 10
      });
      return countrySearch.results;
    }
    return [];
  }

  const search = await searchLocations({
    parameter,
    coordinates: {
      latitude: reference.latitude,
      longitude: reference.longitude,
      radiusKm
    },
    includeSensors: false,
    limit: 10
  });

  if (!reference.locationId) {
    return search.results;
  }

  return search.results.filter((item) => item.locationId !== reference.locationId);
}
