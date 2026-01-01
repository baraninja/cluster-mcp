import { z } from 'zod';
import { loadEquivalenceYaml, DefaultRoutingPolicy, resolveSemanticId } from '@cluster-mcp/core';
import { getWbSeries, WB_REGION_CODES } from '../providers/wb.js';
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
const GEO_REGEX = /^[A-Z]{2,3}([0-9A-Z]{1,3})?$/;

export const getLatestSchema = z.object({
  semanticId: z.string().min(1).describe('Semantic identifier for the indicator'),
  geo: z.string()
    .optional()
    .refine(
      (val) => !val || GEO_REGEX.test(val.toUpperCase()),
      {
        message: 'Geographic code must be ISO2/ISO3 (e.g., SE, USA, WLD) or NUTS code (e.g., SE11)'
      }
    )
    .describe('Geographic code (ISO2, ISO3, NUTS, or region aggregate like WLD, EUU)'),
  prefer: z.enum(['eurostat', 'oecd', 'wb', 'ilostat']).optional().describe('Preferred provider')
});

export type GetLatestParams = z.infer<typeof getLatestSchema>;

/**
 * Get the latest available value for an indicator.
 * Optimized for speed - uses MRV (Most Recent Value) API where available.
 */
export async function getLatest(params: GetLatestParams) {
  const { semanticId, geo = 'SE', prefer } = params;

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
            suggestion: 'Use search_indicator to find available indicators'
          }, null, 2)
        }]
      };
    }

    let providerOrder = router.getProviderOrder(resolvedSemanticId, geo);
    const geoUpper = geo.toUpperCase();
    const isRegionAggregate = WB_REGION_CODES[geoUpper] !== undefined;

    // For region aggregates, prioritize World Bank
    if (isRegionAggregate && providerIds['wb']) {
      providerOrder = ['wb', ...providerOrder.filter(p => p !== 'wb')];
    }

    // Detect if this is a sub-national query (NUTS code)
    const isSubNational = !isRegionAggregate && geo.length > 2;

    // Prioritize Eurostat for sub-national queries
    if (isSubNational && providerIds['eurostat'] && !prefer) {
      providerOrder = ['eurostat', ...providerOrder.filter(p => p !== 'eurostat')];
    }

    if (prefer && providerIds[prefer]) {
      providerOrder = [prefer, ...providerOrder.filter(p => p !== prefer)];
    }

    const currentYear = new Date().getFullYear();
    // Fetch only recent years for speed
    const recentYears: [number, number] = [currentYear - 5, currentYear];

    for (const provider of providerOrder) {
      const providerId = providerIds[provider];
      if (!providerId) continue;

      try {
        let series: Series;

        switch (provider) {
          case 'wb':
            // Use MRV for World Bank (fastest)
            series = await getWbSeries(providerId, geo, undefined, { mrv: 1, mrnev: true });
            break;
          case 'eurostat':
            // Pass semantic ID for proper dimension filtering
            series = await getEurostatSeries(providerId, recentYears, geo, resolvedSemanticId);
            break;
          case 'oecd':
            series = await getOecdSeries(providerId, geo, recentYears);
            break;
          case 'ilostat':
            series = await getIloSeries(providerId, geo, recentYears);
            break;
          default:
            continue;
        }

        if (series.values.length > 0) {
          // Get the latest value
          const latestValue = series.values[series.values.length - 1];
          const indicatorMeta = equivalenceData[resolvedSemanticId];

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                semanticId: resolvedSemanticId,
                label: indicatorMeta?.label || resolvedSemanticId,
                geo,
                geoName: isRegionAggregate ? WB_REGION_CODES[geoUpper] : undefined,
                value: latestValue.value,
                year: latestValue.time,
                unit: indicatorMeta?.unit || series.unit,
                provider: provider,
                isAggregate: isRegionAggregate,
                isSubNational,
                retrievedAt: new Date().toISOString()
              }, null, 2)
            }]
          };
        }
      } catch (error) {
        continue;
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'NO_DATA_FOUND',
          message: `No recent data found for ${resolvedSemanticId} in ${geo}`,
          semanticId: resolvedSemanticId,
          geo,
          attemptedProviders: providerOrder.filter(p => providerIds[p]),
          suggestion: 'Try a different geography or use socio_get_series with a wider year range'
        }, null, 2)
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: `Error retrieving latest value: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}
