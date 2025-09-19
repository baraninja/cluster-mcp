import { buildSemanticAliasMap, registerCanonicalIds } from '@cluster-mcp/core';

export const healthAliasGroups = {
  life_expectancy_birth_total: ['life_expectancy', 'longevity', 'life_expectancy_total'],
  life_expectancy_at_birth: ['life_expectancy_average', 'life_expectancy_mean'],
  imr: ['infant_mortality', 'child_mortality'],
  maternal_mortality_ratio: ['maternal_mortality', 'birth_deaths', 'mmr']
};

const aliasMap = buildSemanticAliasMap(healthAliasGroups);

export function prepareHealthAliases(canonicalIds: Iterable<string>) {
  registerCanonicalIds(aliasMap, canonicalIds);
  return aliasMap;
}
