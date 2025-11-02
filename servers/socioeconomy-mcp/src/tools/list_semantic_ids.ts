import { z } from 'zod';
import { loadEquivalenceYaml } from '@cluster-mcp/core';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { socioeconomicAliasGroups } from '../aliases.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const listSemanticIdsSchema = z.object({
  category: z.enum(['all', 'economic', 'social', 'environmental']).optional().describe('Filter by category'),
});

export type ListSemanticIdsParams = z.infer<typeof listSemanticIdsSchema>;

function categorizeIndicator(id: string, label: string): string {
  const economicKeywords = ['gdp', 'inflation', 'trade', 'export', 'import', 'debt', 'employment', 'unemployment'];
  const socialKeywords = ['education', 'poverty', 'life_expectancy', 'population'];
  const environmentalKeywords = ['carbon', 'emissions', 'renewable', 'energy'];

  const text = `${id} ${label}`.toLowerCase();

  if (environmentalKeywords.some(kw => text.includes(kw))) return 'environmental';
  if (socialKeywords.some(kw => text.includes(kw))) return 'social';
  if (economicKeywords.some(kw => text.includes(kw))) return 'economic';

  return 'economic'; // default
}

export async function listSemanticIds(params: ListSemanticIdsParams) {
  const { category = 'all' } = params;

  try {
    const equivalenceFile = join(__dirname, '..', 'equivalence.yml');
    const equivalenceData = loadEquivalenceYaml(equivalenceFile);

    const indicators = Object.entries(equivalenceData).map(([semanticId, mapping]) => {
      const availableProviders = Object.keys(mapping).filter(
        k => !['label', 'unit', 'description'].includes(k)
      );

      const aliases = socioeconomicAliasGroups[semanticId as keyof typeof socioeconomicAliasGroups] || [];
      const cat = categorizeIndicator(semanticId, mapping.label || '');

      return {
        semanticId,
        label: mapping.label,
        unit: mapping.unit,
        description: mapping.description,
        category: cat,
        aliases: Array.isArray(aliases) ? aliases : [aliases],
        availableProviders,
        providerCount: availableProviders.length
      };
    });

    // Filter by category if specified
    const filteredIndicators = category === 'all'
      ? indicators
      : indicators.filter(ind => ind.category === category);

    // Sort by semantic ID
    filteredIndicators.sort((a, b) => a.semanticId.localeCompare(b.semanticId));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          totalIndicators: filteredIndicators.length,
          category,
          indicators: filteredIndicators
        }, null, 2)
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'FAILED_TO_LIST_INDICATORS',
          message: `Error listing semantic IDs: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, null, 2)
      }]
    };
  }
}
