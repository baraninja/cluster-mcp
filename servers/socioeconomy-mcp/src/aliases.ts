import { buildSemanticAliasMap, registerCanonicalIds } from '@cluster-mcp/core';

export const socioeconomicAliasGroups = {
  gdp_constant_prices: ['gdp', 'gdp_growth', 'economic_growth'],
  gdp_per_capita_constant: ['gdp_per_capita', 'gdppercapita', 'gdp per capita'],
  unemployment_rate: ['unemployment', 'jobless', 'joblessness'],
  employment_rate_15_64: ['employment_rate', 'employment'],
  inflation_cpi: ['inflation', 'price_growth', 'cpi', 'consumer_price_index'],
  exports_goods_services: ['exports', 'trade', 'export'],
  imports_goods_services: ['imports', 'import', 'trade_balance_imports'],
  government_debt: ['debt', 'public_debt', 'sovereign_debt'],
  research_development: ['r&d', 'research', 'innovation', 'rd'],
  life_expectancy: ['longevity'],
};

const aliasMap = buildSemanticAliasMap(socioeconomicAliasGroups);

export function prepareSocioeconomicAliases(canonicalIds: Iterable<string>) {
  registerCanonicalIds(aliasMap, canonicalIds);
  return aliasMap;
}
