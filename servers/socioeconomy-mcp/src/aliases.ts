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
  population_density: ['density', 'pop_density'],
  urban_population: ['urbanization', 'urban'],
  rural_population: ['rural'],
  wage_gap_gender: ['gender_gap', 'pay_gap', 'wage_gap'],
  minimum_wage: ['min_wage', 'minimum_salary'],
  foreign_direct_investment: ['fdi', 'foreign_investment'],
  trade_balance: ['net_exports', 'trade_surplus'],
};

const aliasMap = buildSemanticAliasMap(socioeconomicAliasGroups);

export function prepareSocioeconomicAliases(canonicalIds: Iterable<string>) {
  registerCanonicalIds(aliasMap, canonicalIds);
  return aliasMap;
}
