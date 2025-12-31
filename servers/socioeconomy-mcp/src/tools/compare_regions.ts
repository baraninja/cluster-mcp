import { z } from 'zod';
import { loadEquivalenceYaml, DefaultRoutingPolicy, resolveSemanticId } from '@cluster-mcp/core';
import { getWbSeries, WB_REGION_CODES, WB_INCOME_LEVELS, getCountriesByIncomeLevel } from '../providers/wb.js';
import type { Series } from '@cluster-mcp/core';
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
  includeGrowth: z.boolean().optional().describe('Include year-over-year growth rate')
});

export type CompareRegionsParams = z.infer<typeof compareRegionsSchema>;

interface RegionComparison {
  region: string;
  regionName: string;
  value: number | null;
  year: string;
  growth?: number | null;
  rank: number;
}

/**
 * Compare an indicator across multiple regions or aggregates.
 * Supports World Bank region aggregates (WLD, EUU, OED, etc.) and income levels (HIC, MIC, LIC).
 */
export async function compareRegions(params: CompareRegionsParams) {
  const { semanticId, regions, year, includeGrowth = false } = params;

  try {
    const equivalenceFile = join(__dirname, '..', 'equivalence.yml');
    const equivalenceData = loadEquivalenceYaml(equivalenceFile);
    const aliasMap = prepareSocioeconomicAliases(Object.keys(equivalenceData));
    const { semanticId: resolvedSemanticId } = resolveSemanticId(semanticId, aliasMap);
    const router = new DefaultRoutingPolicy(equivalenceData);

    const providerIds = router.getProviderIds(resolvedSemanticId);

    // For region comparison, we use World Bank as it has the best aggregate coverage
    const wbId = providerIds['wb'];
    if (!wbId) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            error: 'WORLD_BANK_NOT_AVAILABLE',
            message: `Region comparison requires World Bank mapping, which is not available for ${resolvedSemanticId}`,
            availableProviders: Object.keys(providerIds),
            suggestion: 'Try socio_get_series_batch for country-level comparison'
          }, null, 2)
        }]
      };
    }

    const currentYear = new Date().getFullYear();
    const targetYear = year || currentYear;

    // Determine the year range based on whether we need growth
    const yearRange: [number, number] = includeGrowth
      ? [targetYear - 1, targetYear]
      : [targetYear - 2, targetYear]; // Small buffer for data availability

    const results: RegionComparison[] = [];
    const errors: Record<string, string> = {};

    // Fetch data for each region
    for (const region of regions) {
      const regionUpper = region.toUpperCase();
      const regionName = WB_REGION_CODES[regionUpper] || regionUpper;

      try {
        const series = await getWbSeries(wbId, regionUpper, yearRange);

        if (series.values.length === 0) {
          errors[region] = 'No data available';
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
          rank: 0 // Will be calculated below
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
    const lowerIsBetter = ['unemployment', 'poverty', 'inflation', 'debt', 'emissions']
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
