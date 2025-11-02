import { z } from 'zod';
import { loadEquivalenceYaml, DefaultRoutingPolicy, resolveSemanticId } from '@cluster-mcp/core';
import { getWbSeries } from '../providers/wb.js';
import { getEurostatSeries } from '../providers/eurostat.js';
import { getOecdSeries } from '../providers/oecd.js';
import { getIloSeries } from '../providers/ilostat.js';
import type { Series, ProviderKey } from '@cluster-mcp/core';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prepareSocioeconomicAliases } from '../aliases.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Geo validation regex
// ISO2: 2 uppercase letters (SE, DE, US, etc.)
// NUTS: 2 letters + 1-3 alphanumeric (SE11, DE21, FRK2, etc.)
const GEO_REGEX = /^[A-Z]{2}([0-9A-Z]{1,3})?$/;

export const getSeriesSchema = z.object({
  semanticId: z.string().min(1).describe('Semantic identifier for the indicator'),
  geo: z.string()
    .optional()
    .refine(
      (val) => !val || GEO_REGEX.test(val.toUpperCase()),
      {
        message: 'Geographic code must be ISO2 (e.g., SE, DE) or NUTS code (e.g., SE11, DE21)'
      }
    )
    .describe('Geographic code (ISO2 or NUTS)'),
  years: z.tuple([z.number(), z.number()]).optional().describe('Year range [start, end]'),
  prefer: z.enum(['eurostat', 'oecd', 'wb', 'ilostat']).optional().describe('Preferred provider'),
  strictPreference: z.boolean().optional().describe('If true, only use the preferred provider (no fallback)')
});

export type GetSeriesParams = z.infer<typeof getSeriesSchema>;

export async function getSeries(params: GetSeriesParams) {
  const { semanticId, geo = 'SE', years, prefer, strictPreference = false } = params;

  try {
    const equivalenceFile = join(__dirname, '..', 'equivalence.yml');
    const equivalenceData = loadEquivalenceYaml(equivalenceFile);
    const aliasMap = prepareSocioeconomicAliases(Object.keys(equivalenceData));
    const { semanticId: resolvedSemanticId, matchedAlias } = resolveSemanticId(semanticId, aliasMap);
    const router = new DefaultRoutingPolicy(equivalenceData);

    const providerIds = router.getProviderIds(resolvedSemanticId);
    if (Object.keys(providerIds).length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            error: 'NO_PROVIDER_MAPPINGS',
            message: `No provider mappings found for semantic ID: ${resolvedSemanticId}`,
            semanticId: resolvedSemanticId,
            requestedId: semanticId,
            availableSemanticIds: Object.keys(equivalenceData).slice(0, 10),
            suggestion: 'Use search_indicator to find available indicators'
          }, null, 2)
        }]
      };
    }

    let providerOrder = router.getProviderOrder(resolvedSemanticId, geo);
    const requestedProvider = prefer;

    // Detect if this is a sub-national query (NUTS code)
    const isSubNational = geo.length > 2;

    // Prioritize Eurostat for sub-national queries (NUTS codes)
    if (isSubNational && providerIds['eurostat'] && !prefer) {
      providerOrder = ['eurostat', ...providerOrder.filter(p => p !== 'eurostat')];
    }

    if (prefer && providerIds[prefer]) {
      providerOrder = [prefer, ...providerOrder.filter(p => p !== prefer)];
    }

    // If strict preference, only try the preferred provider
    if (strictPreference && prefer) {
      if (!providerIds[prefer]) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'PROVIDER_NOT_AVAILABLE',
              message: `Preferred provider '${prefer}' does not have mapping for ${resolvedSemanticId}`,
              requestedProvider: prefer,
              availableProviders: Object.keys(providerIds),
              semanticId: resolvedSemanticId
            }, null, 2)
          }]
        };
      }
      providerOrder = [prefer];
    }

    const errors: Record<string, string> = {};
    const attemptedProviders: string[] = [];

    for (const provider of providerOrder) {
      const providerId = providerIds[provider];
      if (!providerId) continue;

      try {
        let series: Series;

        switch (provider) {
          case 'wb':
            series = await getWbSeries(providerId, geo, years);
            break;
          case 'eurostat':
            series = await getEurostatSeries(providerId, years, geo);
            break;
          case 'oecd':
            series = await getOecdSeries(providerId, geo, years);
            break;
          case 'ilostat':
            series = await getIloSeries(providerId, geo, years);
            break;
          default:
            continue;
        }

        // Track that we attempted this provider
        attemptedProviders.push(provider);

        if (series.values.length > 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                semanticId: resolvedSemanticId,
                requestedId: matchedAlias ? semanticId : undefined,
                provider: {
                  used: provider,
                  requested: requestedProvider,
                  fallback: requestedProvider && requestedProvider !== provider
                },
                geo,
                series: {
                  ...series,
                  values: series.values.slice(-10) // Show last 10 data points
                },
                totalDataPoints: series.values.length,
                metadata: {
                  providerOrder,
                  attemptedProviders: attemptedProviders.filter(p => p !== provider),
                  isSubNational,
                  geoLevel: series.geoLevel,
                  geoNote: series.geoNote
                }
              }, null, 2)
            }]
          };
        } else {
          // Log when provider returned empty data
          errors[provider] = 'No data available for this geography';
        }
      } catch (error) {
        attemptedProviders.push(provider);
        errors[provider] = error instanceof Error ? error.message : 'Unknown error';
        continue;
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'NO_DATA_FOUND',
          message: `No data found for ${resolvedSemanticId} in ${geo}`,
          semanticId: resolvedSemanticId,
          geo,
          requestedProvider,
          strictPreference,
          attemptedProviders,
          errors,
          suggestion: 'Try a different geography or check data availability with explain_routing'
        }, null, 2)
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: `Error retrieving series: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}
