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

interface SearchResult {
  provider: string;
  id: string;
  label?: string;
  unit?: string;
  description?: string;
  alias?: string | null;
  availableProviders?: string[];
  relevanceScore?: number;
}

function calculateRelevanceScore(query: string, result: SearchResult): number {
  const q = query.toLowerCase().trim();
  const id = (result.id || '').toLowerCase();
  const label = (result.label || '').toLowerCase();
  const description = (result.description || '').toLowerCase();
  const alias = (result.alias || '').toLowerCase();

  let score = 0;

  // Exact matches (highest priority)
  if (id === q || label === q || alias === q) score += 100;

  // Semantic/alias matches (very high priority)
  if (result.provider === 'semantic' || result.provider === 'alias') score += 80;

  // Starts with query (high priority)
  if (id.startsWith(q) || label.startsWith(q)) score += 50;
  if (alias.startsWith(q)) score += 60;

  // Contains all query words
  const queryWords = q.split(/\s+/);
  const allWords = `${id} ${label} ${description} ${alias}`;
  const matchedWords = queryWords.filter(word => allWords.includes(word));
  score += (matchedWords.length / queryWords.length) * 30;

  // Contains query as substring
  if (label.includes(q)) score += 20;
  if (id.includes(q)) score += 15;
  if (description.includes(q)) score += 10;

  // Penalize very long descriptions (less specific)
  if (description.length > 500) score -= 5;

  // PENALIZE irrelevant keywords when not in query
  const irrelevantKeywords = ['poverty', 'headcount', 'gap', 'poor', 'vulnerable'];
  const hasIrrelevantKeyword = irrelevantKeywords.some(kw =>
    (description.includes(kw) || label.includes(kw)) && !q.includes(kw)
  );
  if (hasIrrelevantKeyword) {
    score -= 30; // Heavy penalty for irrelevant results
  }

  // Boost economic/demographic core indicators
  const coreIndicators = ['gdp', 'unemployment', 'inflation', 'population', 'employment', 'trade', 'debt'];
  const isCoreIndicator = coreIndicators.some(core => id.includes(core) || label.includes(core));
  if (isCoreIndicator) {
    score += 10;
  }

  return score;
}

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

    // Combine all results
    const allResults: SearchResult[] = [
      ...aliasMatches,
      ...localMatches,
      ...(wbResults.status === 'fulfilled' ? wbResults.value : []),
      ...(eurostatResults.status === 'fulfilled' ? eurostatResults.value : []),
      ...(oecdResults.status === 'fulfilled' ? oecdResults.value : []),
      ...(iloResults.status === 'fulfilled' ? iloResults.value : [])
    ];

    // Calculate relevance scores
    const scoredResults = allResults.map(result => ({
      ...result,
      relevanceScore: calculateRelevanceScore(q, result)
    }));

    // Filter by relevance threshold and sort by score
    const relevanceThreshold = 25; // Minimum score to be included (raised from 5 to filter out noise)
    const filteredResults = scoredResults
      .filter(r => r.relevanceScore && r.relevanceScore >= relevanceThreshold)
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, 20); // Limit to top 20 results

    // Deduplicate by semantic ID (prefer semantic/alias matches over provider-specific)
    const seen = new Set<string>();
    const uniqueResults = filteredResults.filter(result => {
      const key = result.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          query: q,
          totalResults: uniqueResults.length,
          relevanceThreshold,
          results: uniqueResults
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
