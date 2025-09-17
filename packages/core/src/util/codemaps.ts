import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export type RegionSystem = 'ISO2' | 'ISO3' | 'M49' | 'NUTS' | 'SCB';

export interface CountryCode {
  iso2: string;
  iso3: string;
  m49: string;
  name: string;
}

export interface NutsRegion {
  code: string;
  level: number;
  name: string;
  iso3: string;
  parent?: string;
  countyCode?: string;
}

export interface ScbMunicipality {
  code: string;
  name: string;
  countyCode: string;
  countyName: string;
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(MODULE_DIR, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

let countriesCache: CountryCode[] | null = null;
let nutsCache: NutsRegion[] | null = null;
let scbCache: ScbMunicipality[] | null = null;

function loadCountries(): CountryCode[] {
  if (!countriesCache) {
    const raw = readFileSync(path.join(DATA_DIR, 'm49_countries.json'), 'utf-8');
    const parsedJson: Array<Record<string, string>> = JSON.parse(raw);
    const parsed: CountryCode[] = parsedJson.map(entry => ({
      iso2: entry.iso2,
      iso3: entry.iso3,
      m49: entry.m49.padStart(3, '0'),
      name: entry.name
    }));
    countriesCache = parsed;
  }
  return countriesCache;
}

function parseCsv(file: string): Record<string, string>[] {
  const text = readFileSync(file, 'utf-8').trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split(',').map(h => h.trim());
  return lines
    .filter(line => line.trim().length > 0)
    .map(line => {
      const values = line.split(',');
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = (values[index] ?? '').trim();
      });
      return record;
    });
}

function loadNuts(): NutsRegion[] {
  if (!nutsCache) {
    const records = parseCsv(path.join(DATA_DIR, 'nuts_2024.csv'));
    nutsCache = records.map(record => ({
      code: record.code,
      level: Number(record.level),
      name: record.name,
      iso3: record.iso3,
      parent: record.parent || undefined,
      countyCode: record.county_code || undefined
    }));
  }
  return nutsCache;
}

function loadScb(): ScbMunicipality[] {
  if (!scbCache) {
    const records = parseCsv(path.join(DATA_DIR, 'scb_kommuner_2025.csv'));
    scbCache = records.map(record => ({
      code: record.municipality_code,
      name: record.municipality_name,
      countyCode: record.county_code,
      countyName: record.county_name
    }));
  }
  return scbCache;
}

export function guessRegionSystem(value: string): RegionSystem {
  const trimmed = value.trim();
  if (/^\d{4}$/.test(trimmed)) return 'SCB';
  if (/^\d{1,3}$/.test(trimmed)) return 'M49';
  if (/^[A-Z]{2}$/i.test(trimmed)) return 'ISO2';
  if (/^[A-Z]{3}$/i.test(trimmed)) return 'ISO3';
  return 'NUTS';
}

export function getCountry(code: string): CountryCode | undefined {
  const normalized = code.trim().toUpperCase();
  const countries = loadCountries();
  return countries.find(country =>
    country.iso2.toUpperCase() === normalized ||
    country.iso3.toUpperCase() === normalized ||
    country.m49 === normalized
  );
}

export function iso2ToIso3(code: string): string | undefined {
  return getCountry(code)?.iso3;
}

export function iso3ToIso2(code: string): string | undefined {
  return getCountry(code)?.iso2;
}

export function toM49(code: string): string | undefined {
  return getCountry(code)?.m49;
}

export function lookupNuts(code: string): NutsRegion | undefined {
  const normalized = code.trim().toUpperCase();
  return loadNuts().find(region => region.code.toUpperCase() === normalized);
}

export function listNutsChildren(parentCode: string): NutsRegion[] {
  const normalized = parentCode.trim().toUpperCase();
  return loadNuts().filter(region => (region.parent || '').toUpperCase() === normalized);
}

export function lookupScbMunicipality(code: string): ScbMunicipality | undefined {
  const normalized = code.trim();
  return loadScb().find(muni => muni.code === normalized);
}

export function mapRegionCode(
  value: string,
  target: RegionSystem,
  source: RegionSystem = guessRegionSystem(value)
): string | undefined {
  const normalizedTarget = target.toUpperCase() as RegionSystem;
  const normalizedSource = source.toUpperCase() as RegionSystem;
  const trimmed = value.trim();

  if (normalizedSource === normalizedTarget) {
    return normalizedTarget === 'ISO2' || normalizedTarget === 'ISO3' || normalizedTarget === 'NUTS'
      ? trimmed.toUpperCase()
      : trimmed;
  }

  let iso3: string | undefined;

  if (normalizedSource === 'ISO2' || normalizedSource === 'ISO3' || normalizedSource === 'M49') {
    iso3 = getCountry(trimmed)?.iso3;
  } else if (normalizedSource === 'NUTS') {
    iso3 = lookupNuts(trimmed)?.iso3;
  } else if (normalizedSource === 'SCB') {
    iso3 = 'SWE';
  }

  if (!iso3) return undefined;

  switch (normalizedTarget) {
    case 'ISO3':
      return iso3;
    case 'ISO2':
      return iso3ToIso2(iso3);
    case 'M49':
      return toM49(iso3);
    case 'NUTS':
      if (normalizedSource === 'SCB') {
        const municipality = lookupScbMunicipality(trimmed);
        if (!municipality) return undefined;
        return findNutsForCounty(municipality.countyCode)?.code;
      }
      return undefined;
    case 'SCB':
      if (normalizedSource === 'SCB') {
        return lookupScbMunicipality(trimmed)?.name;
      }
      if (normalizedSource === 'NUTS') {
        const nuts = lookupNuts(trimmed);
        if (!nuts) return undefined;
        if (nuts.level === 3 && nuts.countyCode) {
          return loadScb().find(muni => muni.countyCode === nuts.countyCode)?.name;
        }
        return nuts.name;
      }
      if (normalizedSource === 'ISO2' || normalizedSource === 'ISO3' || normalizedSource === 'M49') {
        if (iso3 === 'SWE') {
          return 'Sweden';
        }
        return undefined;
      }
      return undefined;
    default:
      return undefined;
  }
}

function findNutsForCounty(countyCode: string): NutsRegion | undefined {
  const normalizedCounty = countyCode.padStart(2, '0');
  const counties = loadNuts().filter(region => region.level === 3 && region.iso3 === 'SWE');
  return counties.find(region => region.countyCode === normalizedCounty);
}

export function listScbMunicipalities(): ScbMunicipality[] {
  return loadScb().slice();
}

export function getMunicipalityName(code: string): string | undefined {
  return lookupScbMunicipality(code)?.name;
}

export function getCountyName(code: string): string | undefined {
  const normalized = code.trim().padStart(2, '0');
  const municipality = loadScb().find(muni => muni.countyCode === normalized);
  return municipality?.countyName;
}

export function listCountries(): CountryCode[] {
  return loadCountries().slice();
}

export function listNutsRegions(level?: number): NutsRegion[] {
  const regions = loadNuts();
  if (level === undefined) return regions.slice();
  return regions.filter(region => region.level === level);
}
