import { z } from 'zod';
import { loadEquivalenceYaml, DefaultRoutingPolicy, resolveSemanticId } from '@cluster-mcp/core';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prepareSocioeconomicAliases } from '../aliases.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const explainRoutingSchema = z.object({
  semanticId: z.string().min(1).describe('Semantic identifier to explain routing for'),
  geo: z.string().optional().describe('Geographic code to consider for routing')
});

export type ExplainRoutingParams = z.infer<typeof explainRoutingSchema>;

export async function explainRouting(params: ExplainRoutingParams) {
  const { semanticId, geo } = params;
  
  try {
    const equivalenceFile = join(__dirname, '..', 'equivalence.yml');
    const equivalenceData = loadEquivalenceYaml(equivalenceFile);
    const aliasMap = prepareSocioeconomicAliases(Object.keys(equivalenceData));
    const { semanticId: resolvedSemanticId, matchedAlias } = resolveSemanticId(semanticId, aliasMap);
    const router = new DefaultRoutingPolicy(equivalenceData);
    
    const providerOrder = router.getProviderOrder(resolvedSemanticId, geo);
    const providerIds = router.getProviderIds(resolvedSemanticId);
    
    const mapping = equivalenceData[resolvedSemanticId];
    
    const explanation = {
      semanticId: resolvedSemanticId,
      requestedId: matchedAlias ? semanticId : undefined,
      geography: geo || 'not specified',
      routing: {
        order: providerOrder,
        reason: geo && geo.length >= 2 && isEuCountry(geo) 
          ? 'EU country detected: Eurostat prioritized'
          : 'Non-EU or unspecified: World Bank prioritized'
      },
      mappings: providerIds,
      metadata: mapping ? {
        label: mapping.label,
        unit: mapping.unit,
        description: mapping.description
      } : null,
      availableProviders: Object.keys(providerIds),
      unavailableProviders: providerOrder.filter(p => !providerIds[p])
    };
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(explanation, null, 2)
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: `Error explaining routing: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

function isEuCountry(geo: string): boolean {
  const euCountries = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
  ];
  
  const geoCode = geo.toUpperCase().slice(0, 2);
  return euCountries.includes(geoCode);
}
