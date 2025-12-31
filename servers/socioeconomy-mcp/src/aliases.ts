/**
 * Expanded semantic alias mappings for socioeconomy-mcp
 * Maps common search terms to canonical semantic IDs
 */

import { buildSemanticAliasMap, registerCanonicalIds } from '@cluster-mcp/core';

export const socioeconomicAliasGroups: Record<string, string[]> = {
  // ============================================================================
  // GDP & Growth
  // ============================================================================
  gdp_constant_prices: ['gdp', 'gdp_growth', 'economic_growth', 'real_gdp', 'gross_domestic_product'],
  gdp_current_prices: ['gdp_nominal', 'nominal_gdp', 'gdp_usd'],
  gdp_per_capita_constant: ['gdp_per_capita', 'gdppercapita', 'gdp per capita', 'income_per_capita'],
  gdp_per_capita_current: ['gdp_per_capita_nominal', 'gdp_capita_current'],
  gdp_per_capita_ppp: ['gdp_ppp', 'purchasing_power', 'ppp_gdp'],
  gdp_growth_rate: ['economic_growth_rate', 'gdp_change', 'growth_rate'],
  gni_per_capita: ['gni', 'gross_national_income', 'national_income'],
  gni_per_capita_ppp: ['gni_ppp'],

  // ============================================================================
  // Inflation & Prices
  // ============================================================================
  inflation_cpi: ['inflation', 'price_growth', 'cpi', 'consumer_price_index', 'consumer_prices'],
  inflation_gdp_deflator: ['gdp_deflator', 'deflator'],
  consumer_price_index: ['cpi_index', 'price_index'],
  producer_price_index: ['ppi', 'producer_prices'],
  house_price_index: ['housing_prices', 'real_estate_prices', 'property_prices'],

  // ============================================================================
  // Trade & Investment
  // ============================================================================
  exports_goods_services: ['exports', 'export', 'trade_exports'],
  imports_goods_services: ['imports', 'import', 'trade_imports'],
  trade_balance: ['net_exports', 'trade_surplus', 'trade_deficit'],
  current_account_balance: ['current_account', 'bop', 'balance_of_payments'],
  foreign_direct_investment: ['fdi', 'foreign_investment', 'fdi_inflows'],
  fdi_outflows: ['fdi_out', 'outward_fdi'],

  // ============================================================================
  // Public Finance
  // ============================================================================
  government_debt: ['debt', 'public_debt', 'sovereign_debt', 'national_debt'],
  government_revenue: ['revenue', 'public_revenue', 'govt_revenue'],
  government_expenditure: ['spending', 'public_spending', 'govt_spending', 'government_spending'],
  tax_revenue: ['taxes', 'taxation', 'tax_income'],
  military_expenditure: ['military_spending', 'defense_spending', 'defence_spending'],

  // ============================================================================
  // Employment
  // ============================================================================
  employment_rate_15_64: ['employment_rate', 'employment', 'jobs'],
  employment_rate_20_64: ['employment_rate_20_64', 'eu_employment_target'],
  labor_force_participation: ['lfpr', 'labor_participation', 'labour_force', 'workforce_participation'],
  labor_force_participation_female: ['female_lfpr', 'women_workforce'],
  labor_force_participation_male: ['male_lfpr', 'men_workforce'],
  employment_agriculture: ['agricultural_employment', 'farm_employment'],
  employment_industry: ['industrial_employment', 'manufacturing_employment'],
  employment_services: ['service_employment', 'services_jobs'],
  self_employment: ['self_employed', 'entrepreneurs', 'own_account'],
  part_time_employment: ['part_time', 'parttime'],
  temporary_employment: ['temp_work', 'temporary_contracts', 'fixed_term'],

  // ============================================================================
  // Unemployment
  // ============================================================================
  unemployment_rate: ['unemployment', 'jobless', 'joblessness', 'without_work'],
  unemployment_rate_female: ['female_unemployment', 'women_unemployment'],
  unemployment_rate_male: ['male_unemployment', 'men_unemployment'],
  youth_unemployment: ['youth_jobless', 'young_unemployment', 'unemployment_youth'],
  long_term_unemployment: ['ltu', 'chronic_unemployment'],
  youth_neet: ['neet', 'neet_rate', 'youth_inactive'],

  // ============================================================================
  // Wages & Working Conditions
  // ============================================================================
  wage_gap_gender: ['gender_gap', 'pay_gap', 'wage_gap', 'gender_pay_gap'],
  minimum_wage: ['min_wage', 'minimum_salary', 'living_wage'],
  average_wages: ['salaries', 'wages', 'average_salary', 'mean_wages'],
  labor_productivity: ['productivity', 'output_per_worker', 'work_productivity'],
  hours_worked_weekly: ['working_hours', 'work_hours', 'weekly_hours'],
  unit_labor_cost: ['ulc', 'labor_cost'],
  labor_share_gdp: ['wage_share', 'labor_income_share'],

  // ============================================================================
  // Demographics
  // ============================================================================
  population_total: ['population', 'pop', 'inhabitants'],
  population_growth: ['pop_growth', 'population_change'],
  population_density: ['density', 'pop_density', 'people_per_km'],
  urban_population: ['urbanization', 'urban', 'city_population'],
  rural_population: ['rural', 'countryside'],
  median_age: ['average_age', 'age_median'],
  dependency_ratio_old: ['elderly_dependency', 'old_age_ratio', 'pension_ratio'],
  dependency_ratio_young: ['youth_dependency', 'child_ratio'],
  fertility_rate: ['births_per_woman', 'tfr', 'total_fertility'],
  birth_rate: ['births', 'natality'],
  death_rate: ['deaths', 'mortality_rate'],
  net_migration: ['migration', 'immigration', 'emigration'],

  // ============================================================================
  // Health
  // ============================================================================
  life_expectancy: ['longevity', 'lifespan', 'life_span'],
  life_expectancy_female: ['female_lifespan', 'women_life_expectancy'],
  life_expectancy_male: ['male_lifespan', 'men_life_expectancy'],
  infant_mortality: ['infant_deaths', 'baby_mortality'],
  maternal_mortality: ['maternal_deaths', 'childbirth_mortality'],
  health_expenditure: ['healthcare_spending', 'health_spending', 'medical_spending'],
  health_expenditure_per_capita: ['health_cost_per_person'],
  hospital_beds: ['beds', 'hospital_capacity'],
  physicians: ['doctors', 'medical_doctors'],
  obesity_rate: ['obesity', 'overweight'],

  // ============================================================================
  // Education
  // ============================================================================
  education_tertiary: ['university_education', 'higher_education', 'college_degree'],
  education_secondary: ['high_school', 'secondary_school'],
  education_spending: ['education_expenditure', 'school_spending'],
  school_enrollment_primary: ['primary_enrollment', 'elementary_school'],
  school_enrollment_secondary: ['secondary_enrollment'],
  school_enrollment_tertiary: ['university_enrollment', 'higher_ed_enrollment'],
  adult_literacy: ['literacy', 'reading_ability'],
  pisa_math: ['math_scores', 'mathematics_performance'],
  pisa_reading: ['reading_scores', 'literacy_scores'],
  pisa_science: ['science_scores', 'science_performance'],

  // ============================================================================
  // Poverty & Inequality
  // ============================================================================
  poverty_rate: ['poverty', 'extreme_poverty', 'poor'],
  poverty_rate_national: ['national_poverty', 'domestic_poverty'],
  gini_coefficient: ['gini', 'inequality', 'income_inequality'],
  income_share_bottom_20: ['bottom_quintile', 'poorest_20'],
  income_share_top_10: ['top_decile', 'richest_10'],
  at_risk_of_poverty: ['poverty_risk', 'near_poverty'],
  social_protection_spending: ['social_spending', 'welfare_spending', 'benefits_spending'],

  // ============================================================================
  // Environment & Energy
  // ============================================================================
  carbon_emissions: ['co2', 'carbon', 'emissions_per_capita'],
  carbon_emissions_total: ['total_co2', 'total_emissions'],
  greenhouse_gas_emissions: ['ghg', 'greenhouse_gases', 'climate_emissions'],
  energy_renewable: ['renewables', 'green_energy', 'clean_energy', 'sustainable_energy'],
  energy_intensity: ['energy_efficiency', 'energy_per_gdp'],
  electricity_access: ['power_access', 'electrification'],
  forest_area: ['forests', 'woodland', 'tree_cover'],
  pm25_exposure: ['air_pollution', 'air_quality', 'particulate_matter'],
  water_access: ['clean_water', 'drinking_water', 'safe_water'],
  sanitation_access: ['sanitation', 'sewage', 'toilet_access'],

  // ============================================================================
  // Technology & Innovation
  // ============================================================================
  research_development: ['r&d', 'research', 'innovation', 'rd', 'r_and_d'],
  researchers: ['scientists', 'research_personnel'],
  patent_applications: ['patents', 'intellectual_property', 'ip'],
  internet_users: ['internet', 'online', 'web_users'],
  broadband_subscriptions: ['broadband', 'internet_connections', 'fixed_internet'],
  mobile_subscriptions: ['mobile', 'cellular', 'phone_subscriptions'],
  high_tech_exports: ['tech_exports', 'technology_exports'],

  // ============================================================================
  // Governance
  // ============================================================================
  government_effectiveness: ['governance', 'govt_quality'],
  rule_of_law: ['legal_system', 'justice_system'],
  control_of_corruption: ['corruption', 'anti_corruption', 'bribery'],
  regulatory_quality: ['regulations', 'business_environment'],
  political_stability: ['stability', 'security'],
  voice_accountability: ['democracy', 'freedom', 'free_press'],
};

const aliasMap = buildSemanticAliasMap(socioeconomicAliasGroups);

export function prepareSocioeconomicAliases(canonicalIds: Iterable<string>) {
  registerCanonicalIds(aliasMap, canonicalIds);
  return aliasMap;
}

/**
 * Helper to get all available aliases for documentation
 */
export function getAllAliases(): Map<string, string> {
  const result = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(socioeconomicAliasGroups)) {
    for (const alias of aliases) {
      result.set(alias, canonical);
    }
  }
  return result;
}
