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

export const getSeriesSchema = z.object({
  semanticId: z.string().min(1).describe('Semantic identifier for the indicator'),
  geo: z.string().optional().describe('Geographic code (ISO2 or regional)'),
  years: z.tuple([z.number(), z.number()]).optional().describe('Year range [start, end]'),
  prefer: z.enum(['eurostat', 'oecd', 'wb', 'ilostat']).optional().describe('Preferred provider')
});

export type GetSeriesParams = z.infer<typeof getSeriesSchema>;

export async function getSeries(params: GetSeriesParams) {
  const { semanticId, geo = 'SE', years, prefer } = params;
  
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
          text: `No provider mappings found for semantic ID: ${resolvedSemanticId}`
        }]
      };
    }
    
    let providerOrder = router.getProviderOrder(resolvedSemanticId, geo);
    if (prefer && providerIds[prefer]) {
      providerOrder = [prefer, ...providerOrder.filter(p => p !== prefer)];
    }
    
    const errors: string[] = [];
    
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
        
        if (series.values.length > 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                semanticId: resolvedSemanticId,
                requestedId: matchedAlias ? semanticId : undefined,
                provider: provider,
                series: {
                  ...series,
                  values: series.values.slice(-10) // Show last 10 data points
                },
                totalDataPoints: series.values.length
              }, null, 2)
            }]
          };
        }
      } catch (error) {
        errors.push(`${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        continue;
      }
    }
    
    return {
      content: [{
        type: 'text' as const,
        text: `No data found for ${resolvedSemanticId}. Errors: ${errors.join('; ')}`
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
