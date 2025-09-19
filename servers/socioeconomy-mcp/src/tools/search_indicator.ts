import { z } from 'zod';
import { loadEquivalenceYaml, resolveSemanticId } from '@cluster-mcp/core';
import { searchWbIndicators } from '../providers/wb.js';
import { searchEurostatDatasets } from '../providers/eurostat.js';
import { searchOecdIndicators } from '../providers/oecd.js';
import { searchIloIndicators } from '../providers/ilostat.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prepareSocioeconomicAliases, socioeconomicAliasGroups } from '../aliases.js';

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const searchIndicatorSchema = z.object({
  q: z.string().min(1).describe('Search query for indicators')
});

export type SearchIndicatorParams = z.infer<typeof searchIndicatorSchema>;

export async function searchIndicator(params: SearchIndicatorParams) {
  const { q } = params;
  
  try {
    const equivalenceFile = join(__dirname, '..', 'equivalence.yml');
    const equivalenceData = loadEquivalenceYaml(equivalenceFile);
    const aliasMap = prepareSocioeconomicAliases(Object.keys(equivalenceData));
    
    // Search in equivalence mappings first
    const localMatches = Object.entries(equivalenceData)
      .filter(([semanticId, mapping]) => {
        const searchText = `${semanticId} ${mapping.label || ''} ${mapping.description || ''}`.toLowerCase();
        return searchText.includes(q.toLowerCase());
      })
      .map(([semanticId, mapping]) => ({
        provider: 'semantic' as const,
        id: semanticId,
        label: mapping.label,
        unit: mapping.unit,
        description: mapping.description,
        availableProviders: Object.keys(mapping).filter(k => !['label', 'unit', 'description'].includes(k))
      }));

    const aliasMatches = Object.entries(socioeconomicAliasGroups)
      .filter(([canonicalId, aliases]) => Boolean(equivalenceData[canonicalId]) && toArray(aliases).some(alias => alias.toLowerCase().includes(q.toLowerCase())))
      .map(([canonicalId, aliases]) => {
        const mapping = equivalenceData[canonicalId];
        const matchedAlias = toArray(aliases).find(alias => alias.toLowerCase().includes(q.toLowerCase())) ?? null;
        const resolution = resolveSemanticId(matchedAlias ?? canonicalId, aliasMap);
        return {
          provider: 'alias' as const,
          id: resolution.semanticId,
          alias: matchedAlias,
          label: mapping.label,
          unit: mapping.unit,
          description: mapping.description,
          availableProviders: Object.keys(mapping).filter(k => !['label', 'unit', 'description'].includes(k))
        };
      });
    
    // Search providers in parallel
    const [wbResults, eurostatResults, oecdResults, iloResults] = await Promise.allSettled([
      searchWbIndicators(q),
      searchEurostatDatasets(q),
      searchOecdIndicators(q), 
      searchIloIndicators(q)
    ]);
    
    const allResults = [
      ...aliasMatches,
      ...localMatches,
      ...(wbResults.status === 'fulfilled' ? wbResults.value : []),
      ...(eurostatResults.status === 'fulfilled' ? eurostatResults.value : []),
      ...(oecdResults.status === 'fulfilled' ? oecdResults.value : []),
      ...(iloResults.status === 'fulfilled' ? iloResults.value : [])
    ];
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          query: q,
          totalResults: allResults.length,
          results: allResults.slice(0, 25) // Limit to 25 results
        }, null, 2)
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: `Error searching indicators: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}
