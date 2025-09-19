import type { Profile, Series, ProviderKey } from '@cluster-mcp/core';
import { loadEquivalenceYaml, resolveSemanticId } from '@cluster-mcp/core';
import type { SearchIndicatorParams } from '../tools/search_indicator.js';
import type { GetSeriesParams } from '../tools/get_series.js';
import type { CompareCountriesParams } from '../tools/compare_countries.js';
import type { GetMetadataParams } from '../tools/get_metadata.js';

import {
  searchWhoIndicators,
  getWhoSeries,
  getWhoMetadata
} from './who.js';
import { getOecdHealthSeries, type OecdMapping } from './oecd.js';
import { getWorldBankSeries } from './wb.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prepareHealthAliases, healthAliasGroups } from '../aliases.js';

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

export interface IndicatorSummary {
  provider: string;
  id: string;
  label: string;
  unit?: string;
  alias?: string;
}

export interface SeriesFetchOutcome {
  series?: Series;
  providerUsed?: ProviderKey;
  providerOrder: ProviderKey[];
  errors: string[];
}

interface HealthEquivalenceEntry {
  label: string;
  unit?: string;
  who?: string;
  oecd?: OecdMapping;
  wb?: string;
  dim1?: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const equivalencePath = join(__dirname, '..', 'equivalence.yml');

let equivalenceCache: Record<string, HealthEquivalenceEntry> | null = null;
let aliasMap: Map<string, string> | null = null;

function loadEquivalence(): Record<string, HealthEquivalenceEntry> {
  if (!equivalenceCache) {
    equivalenceCache = loadEquivalenceYaml(equivalencePath) as Record<string, HealthEquivalenceEntry>;
  }
  aliasMap = prepareHealthAliases(Object.keys(equivalenceCache));
  return equivalenceCache;
}

function resolveIndicatorId(rawId: string) {
  if (!aliasMap) {
    loadEquivalence();
  }
  const map = aliasMap ?? prepareHealthAliases(Object.keys(loadEquivalence()));
  return resolveSemanticId(rawId, map);
}

function findMapping(semanticId: string): HealthEquivalenceEntry | undefined {
  const map = loadEquivalence();
  return map[semanticId];
}

function findMappingByWhoId(id: string): HealthEquivalenceEntry | undefined {
  const entries = Object.values(loadEquivalence());
  return entries.find((entry) => entry.who === id);
}

function buildProviderOrder(
  mapping: HealthEquivalenceEntry | undefined,
  prefer?: ProviderKey
): ProviderKey[] {
  const order: ProviderKey[] = [];
  if (mapping?.who) order.push('who');
  if (mapping?.oecd) order.push('oecd');
  if (mapping?.wb) order.push('wb');

  if (prefer && order.includes(prefer)) {
    return [prefer, ...order.filter((provider) => provider !== prefer)];
  }

  if (prefer && !order.includes(prefer)) {
    order.unshift(prefer);
  }

  if (order.length === 0) {
    order.push('who', 'oecd', 'wb');
  }

  return order;
}

function normalizeProviderKey(value?: string): ProviderKey | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (['who', 'oecd', 'wb'].includes(normalized)) {
    return normalized as ProviderKey;
  }
  return undefined;
}

export async function searchIndicators(params: SearchIndicatorParams): Promise<IndicatorSummary[]> {
  const whoResults = await searchWhoIndicators(params);
  const query = params.q.trim().toLowerCase();
  const equivalence = loadEquivalence();
  const equivalenceMatches: IndicatorSummary[] = [];
  const aliasMatches: IndicatorSummary[] = [];

  if (query) {
    for (const [semanticId, entry] of Object.entries(equivalence)) {
      if (entry.label?.toLowerCase().includes(query)) {
        equivalenceMatches.push({
          provider: 'semantic',
          id: semanticId,
          label: entry.label,
          unit: entry.unit
        });
      }
    }

    for (const [semanticId, aliases] of Object.entries(healthAliasGroups)) {
      const entry = equivalence[semanticId];
      if (!entry) continue;
      const matchedAlias = toArray(aliases).find((alias) => alias.toLowerCase().includes(query));
      if (matchedAlias) {
        aliasMatches.push({
          provider: 'alias',
          id: semanticId,
          label: entry.label,
          unit: entry.unit,
          alias: matchedAlias
        });
      }
    }
  }

  return [...aliasMatches, ...equivalenceMatches, ...whoResults];
}

export async function fetchSeries(params: GetSeriesParams): Promise<SeriesFetchOutcome> {
  const { semanticId: resolvedId, matchedAlias } = resolveIndicatorId(params.semanticId);
  const mapping = findMapping(resolvedId) ?? findMappingByWhoId(resolvedId) ?? findMappingByWhoId(params.semanticId);
  const prefer = normalizeProviderKey(params.prefer);
  const providerOrder = buildProviderOrder(mapping, prefer);

  const defaultDim1 = inferDefaultDim1(resolvedId);
  const resolvedParams: GetSeriesParams = {
    ...params,
    semanticId: resolvedId,
    dim1: params.dim1 ?? mapping?.dim1 ?? defaultDim1
  };

  const errors: string[] = [];

  for (const provider of providerOrder) {
    try {
      if (provider === 'who') {
        const whoId = mapping?.who ?? resolvedId;
        const series = await getWhoSeries(whoId, resolvedParams);
        if (series) {
          series.semanticId = resolvedId;
          return {
            series: enrichSeries(series, mapping, provider, providerOrder, matchedAlias ? params.semanticId : undefined),
            providerUsed: provider,
            providerOrder,
            errors
          };
        }
      }

      if (provider === 'oecd' && mapping?.oecd) {
        const series = await getOecdHealthSeries(mapping.oecd, resolvedParams, mapping.unit);
        if (series) {
          series.semanticId = resolvedId;
          return {
            series: enrichSeries(series, mapping, provider, providerOrder, matchedAlias ? params.semanticId : undefined),
            providerUsed: provider,
            providerOrder,
            errors
          };
        }
      }

      if (provider === 'wb') {
        const wbId = mapping?.wb ?? resolvedId;
        const series = await getWorldBankSeries(wbId, resolvedParams);
        if (series) {
          series.semanticId = resolvedId;
          return {
            series: enrichSeries(series, mapping, provider, providerOrder, matchedAlias ? params.semanticId : undefined),
            providerUsed: provider,
            providerOrder,
            errors
          };
        }
      }
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errors.length) {
    console.error('Health series lookup errors:', errors.join('; '));
  }

  return {
    providerOrder,
    errors
  };
}

export interface CompareOutcome {
  series: Record<string, Series>;
  diagnostics: Record<string, { providerOrder: ProviderKey[]; errors: string[] }>;
}

export async function compareSeriesByCountry(
  params: CompareCountriesParams
): Promise<CompareOutcome> {
  const seriesMap: Record<string, Series> = {};
  const diagnostics: Record<string, { providerOrder: ProviderKey[]; errors: string[] }> = {};
  for (const geo of params.geos) {
    try {
      const { geos, ...rest } = params;
      const baseParams = rest as unknown as GetSeriesParams;
      const outcome = await fetchSeries({ ...baseParams, geo });
      if (outcome.series) {
        seriesMap[geo] = outcome.series;
      }
      diagnostics[geo] = {
        providerOrder: outcome.providerOrder,
        errors: outcome.errors
      };
    } catch (error) {
      console.error(`Health comparison failed for ${geo}:`, error);
    }
  }
  return { series: seriesMap, diagnostics };
}

export async function fetchMetadata(params: GetMetadataParams): Promise<Profile | null> {
  const provider = normalizeProviderKey(params.provider) ?? 'who';
  const { semanticId: resolvedId } = resolveIndicatorId(params.id);
  const mapping = provider === 'who'
    ? findMapping(resolvedId) ?? findMappingByWhoId(resolvedId) ?? findMappingByWhoId(params.id)
    : findMapping(resolvedId);

  switch (provider) {
    case 'who':
      return getWhoMetadata({ ...params, id: mapping?.who ?? resolvedId });
    default:
      return null;
  }
}

function enrichSeries(
  series: Series,
  mapping: HealthEquivalenceEntry | undefined,
  provider?: ProviderKey,
  providerOrder?: ProviderKey[],
  requestedId?: string
): Series {
  if (mapping?.unit) {
    series.unit = mapping.unit;
  }
  if (mapping?.label) {
    series.definition = mapping.label;
  }
  if (provider) {
    series.source.name = provider;
  }
  if (requestedId && requestedId !== series.semanticId) {
    const aliasNote = `Requested alias "${requestedId}" resolved to canonical id "${series.semanticId}"`;
    series.methodNotes = series.methodNotes ? `${series.methodNotes}; ${aliasNote}` : aliasNote;
  }
  if (providerOrder && providerOrder.length > 0) {
    const providerMessage = `Selected provider: ${provider ?? series.source.name}; evaluated order: ${providerOrder.join(' -> ')}`;
    series.methodNotes = series.methodNotes
      ? `${series.methodNotes}; ${providerMessage}`
      : providerMessage;
  }
  return series;
}

function inferDefaultDim1(indicator: string): string | undefined {
  switch (indicator) {
    case 'WHOSIS_000001':
    case 'life_expectancy_birth_total':
      return 'SEX_BTSX';
    case 'WHOSIS_000002':
    case 'healthy_life_expectancy_total':
      return 'SEX_BTSX';
    default:
      return undefined;
  }
}
