import { z } from 'zod';
import { loadEquivalenceYaml, DefaultRoutingPolicy, resolveSemanticId } from '@cluster-mcp/core';
import { getWbSeries, WB_REGION_CODES, WB_INCOME_LEVELS } from '../providers/wb.js';
import { getEurostatSeries } from '../providers/eurostat.js';
import { getOecdSeries } from '../providers/oecd.js';
import { getIloSeries } from '../providers/ilostat.js';
import type { Series, ProviderKey } from '@cluster-mcp/core';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prepareSocioeconomicAliases } from '../aliases.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const compareRegionsSchema = z.object({
  semanticId: z.string().min(1).describe('Semantic identifier for the indicator'),
  regions: z.array(z.string()).min(1).max(10).describe(
    'Array of region codes to compare. Can be ISO2 country codes, or World Bank aggregates like WLD (World), EUU (European Union), OED (OECD), HIC (High Income), etc.'
  ),
  year: z.number().optional().describe('Year to compare (defaults to latest available)'),
  includeGrowth: z.boolean().optional().describe('Include year-over-year growth rate'),
  prefer: z.enum(['eurostat', 'oecd', 'wb', 'ilostat']).optional().describe('Preferred provider')
});

export type CompareRegionsParams = z.infer<typeof compareRegionsSchema>;

interface RegionComparison {
  region: string;
  regionName: string;
  value: number | null;
  year: string;
  growth?: number | null;
  rank: number;
  provider?: string;
}

/**
 * Fetch series data from the best available provider for a region.
 * Uses provider fallback similar to get_latest.
 */
async function fetchRegionData(
  providerIds: Record<string, string>,
  region: string,
  yearRange: [number, number],
  resolvedSemanticId: string,
  prefer?: string
): Promise<{ series: Series; provider: string } | null> {
  const regionUpper = region.toUpperCase();
  const isAggregate = WB_REGION_CODES[regionUpper] !== undefined;

  // Build provider order
  let providerOrder: ProviderKey[] = [];

  // For aggregates (WLD, EUU, OED, HIC, etc.), prefer World Bank
  if (isAggregate && providerIds['wb']) {
    providerOrder = ['wb'];
  } else {
    // For individual countries, use all available providers
    providerOrder = ['wb', 'eurostat', 'oecd', 'ilostat'].filter(
      p => providerIds[p]
    ) as ProviderKey[];

    // Apply preference
    if (prefer && providerIds[prefer]) {
      providerOrder = [prefer as ProviderKey, ...providerOrder.filter(p => p !== prefer)];
    }
  }

  for (const provider of providerOrder) {
    const providerId = providerIds[provider];
    if (!providerId) continue;

    try {
      let series: Series;

      switch (provider) {
        case 'wb':
          series = await getWbSeries(providerId, regionUpper, yearRange);
          break;
        case 'eurostat':
          series = await getEurostatSeries(providerId, yearRange, regionUpper, resolvedSemanticId);
          break;
        case 'oecd':
          series = await getOecdSeries(providerId, regionUpper, yearRange);
          break;
        case 'ilostat':
          series = await getIloSeries(providerId, regionUpper, yearRange);
          break;
        default:
          continue;
      }

      if (series.values.length > 0) {
        return { series, provider };
      }
    } catch (error) {
      // Continue to next provider
      continue;
    }
  }

  return null;
}

/**
 * Compare an indicator across multiple regions or aggregates.
 * Supports World Bank region aggregates (WLD, EUU, OED, etc.) and income levels (HIC, MIC, LIC).
 * Falls back through multiple providers for country-level data.
 */
export async function compareRegions(params: CompareRegionsParams) {
  const { semanticId, regions, year, includeGrowth = false, prefer } = params;

  try {
    const equivalenceFile = join(__dirname, '..', 'equivalence.yml');
    const equivalenceData = loadEquivalenceYaml(equivalenceFile);
    const aliasMap = prepareSocioeconomicAliases(Object.keys(equivalenceData));
    const { semanticId: resolvedSemanticId } = resolveSemanticId(semanticId, aliasMap);
    const router = new DefaultRoutingPolicy(equivalenceData);

    const providerIds = router.getProviderIds(resolvedSemanticId);

    if (Object.keys(providerIds).length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            error: 'NO_PROVIDER_MAPPINGS',
            message: `No provider mappings found for ${resolvedSemanticId}`,
            suggestion: 'Use search_indicator to find available indicators'
          }, null, 2)
        }]
      };
    }

    const currentYear = new Date().getFullYear();
    const targetYear = year || currentYear;

    // Determine the year range based on whether we need growth
    const yearRange: [number, number] = includeGrowth
      ? [targetYear - 2, targetYear]
      : [targetYear - 3, targetYear]; // Buffer for data availability

    const results: RegionComparison[] = [];
    const errors: Record<string, string> = {};

    // Fetch data for each region
    for (const region of regions) {
      const regionUpper = region.toUpperCase();
      const regionName = WB_REGION_CODES[regionUpper] || regionUpper;

      try {
        const result = await fetchRegionData(
          providerIds,
          regionUpper,
          yearRange,
          resolvedSemanticId,
          prefer
        );

        if (!result) {
          errors[region] = 'No data available from any provider';
          results.push({
            region: regionUpper,
            regionName,
            value: null,
            year: String(targetYear),
            growth: includeGrowth ? null : undefined,
            rank: 0
          });
          continue;
        }

        const { series, provider } = result;

        // Find the closest year to target
        const sortedValues = [...series.values].sort((a, b) =>
          Math.abs(parseInt(a.time) - targetYear) - Math.abs(parseInt(b.time) - targetYear)
        );
        const latestValue = sortedValues[0];

        // Calculate growth if requested
        let growth: number | null | undefined;
        if (includeGrowth) {
          const previousYear = parseInt(latestValue.time) - 1;
          const previousValue = series.values.find(v => v.time === String(previousYear));
          if (previousValue && previousValue.value !== 0) {
            growth = ((latestValue.value - previousValue.value) / Math.abs(previousValue.value)) * 100;
          } else {
            growth = null;
          }
        }

        results.push({
          region: regionUpper,
          regionName,
          value: latestValue.value,
          year: latestValue.time,
          growth,
          rank: 0, // Will be calculated below
          provider
        });

      } catch (error) {
        errors[region] = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          region: regionUpper,
          regionName,
          value: null,
          year: String(targetYear),
          growth: includeGrowth ? null : undefined,
          rank: 0
        });
      }
    }

    // Calculate rankings (higher value = rank 1, unless unit suggests lower is better)
    const indicatorMeta = equivalenceData[resolvedSemanticId];
    const lowerIsBetter = indicatorMeta?.lowerIsBetter ||
      ['unemployment', 'poverty', 'inflation', 'debt', 'emissions', 'gini']
        .some(term => resolvedSemanticId.toLowerCase().includes(term));

    const validResults = results.filter(r => r.value !== null);
    validResults.sort((a, b) =>
      lowerIsBetter
        ? (a.value! - b.value!)
        : (b.value! - a.value!)
    );

    validResults.forEach((result, index) => {
      result.rank = index + 1;
    });

    // Calculate statistics
    const values = validResults.map(r => r.value!);
    const stats = values.length > 0 ? {
      min: Math.min(...values),
      max: Math.max(...values),
      average: values.reduce((a, b) => a + b, 0) / values.length,
      range: Math.max(...values) - Math.min(...values)
    } : null;

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          semanticId: resolvedSemanticId,
          label: indicatorMeta?.label || resolvedSemanticId,
          unit: indicatorMeta?.unit,
          targetYear,
          lowerIsBetter,
          results: results.sort((a, b) => {
            if (a.rank === 0) return 1;
            if (b.rank === 0) return -1;
            return a.rank - b.rank;
          }),
          statistics: stats,
          errors: Object.keys(errors).length > 0 ? errors : undefined,
          availableProviders: Object.keys(providerIds),
          availableRegionCodes: Object.keys(WB_REGION_CODES),
          availableIncomeLevels: WB_INCOME_LEVELS
        }, null, 2)
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: `Error comparing regions: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}
