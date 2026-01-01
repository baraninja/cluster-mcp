import { getWithRetry, getJSON, jsonstatToSeries, MemoryCache } from '@cluster-mcp/core';
import type { Series } from '@cluster-mcp/core';

const BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0';

// Cache for Eurostat data (30 minutes TTL)
const eurostatCache = new MemoryCache();
const CACHE_TTL = 1800000; // 30 minutes

function detectGeoLevel(geo?: string): 'national' | 'regional' | 'local' | undefined {
  if (!geo || geo.length <= 2) return 'national';
  if (geo.length === 3) return 'regional'; // NUTS1
  if (geo.length === 4) return 'regional'; // NUTS2
  if (geo.length === 5) return 'local';    // NUTS3
  return undefined;
}

// Required dimensions for regional datasets
const DATASET_DIMENSIONS: Record<string, Record<string, string>> = {
  'LFST_R_LFE2EMPRT': { sex: 'T', age: 'Y15-64', unit: 'PC' },
  'LFST_R_LFU3RT': { sex: 'T', age: 'Y15-74', unit: 'PC', isced11: 'TOTAL' },
  'DEMO_R_PJANGRP3': { sex: 'T', age: 'TOTAL' }
};

// Semantic ID to Eurostat dimension filters mapping
// This maps semantic indicators to their required dimension values when the same dataset
// is used for multiple indicators (e.g., DEMO_GIND has 28 different demographic indicators)
const SEMANTIC_EUROSTAT_DIMENSIONS: Record<string, Record<string, string>> = {
  // Demographics - DEMO_GIND (28 indicators)
  'population_total': { indic_de: 'JAN' },           // Population on 1 January
  'population_growth': { indic_de: 'GROWRT' },      // Population growth rate
  'birth_rate': { indic_de: 'GBIRTHRT' },           // Crude birth rate
  'death_rate': { indic_de: 'GDEATHRT' },           // Crude death rate
  'net_migration': { indic_de: 'CNMIGRATRT' },      // Crude net migration rate

  // Demographics - DEMO_PJANIND (55 indicators)
  'median_age': { indic_de: 'MEDAGEPOP' },          // Median age of population
  'dependency_ratio_old': { indic_de: 'DEPRATIO2' }, // Old-age dependency ratio (65+/15-64)
  'dependency_ratio_young': { indic_de: 'DEPRATIO1' }, // Young-age dependency ratio (0-14/15-64)

  // Fertility - DEMO_FRATE
  'fertility_rate': { age: 'TOTAL' },               // Total fertility rate

  // Life expectancy - DEMO_MLEXPEC (by age and sex)
  'life_expectancy': { age: 'Y_LT1', sex: 'T' },    // Life expectancy at birth, total
  'life_expectancy_female': { age: 'Y_LT1', sex: 'F' }, // Life expectancy at birth, female
  'life_expectancy_male': { age: 'Y_LT1', sex: 'M' },   // Life expectancy at birth, male

  // Infant mortality - DEMO_MINFIND
  'infant_mortality': { indic_de: 'INFMORTRT' },    // Infant mortality rate

  // Government finance - GOV_10DD_EDPT1
  'government_debt': { unit: 'PC_GDP', sector: 'S13', na_item: 'GD' },

  // Government finance - GOV_10A_MAIN
  'government_revenue': { unit: 'PC_GDP', sector: 'S13', na_item: 'TR' },
  'government_expenditure': { unit: 'PC_GDP', sector: 'S13', na_item: 'TE' },

  // Government finance - GOV_10A_TAXAG
  'tax_revenue': { unit: 'PC_GDP', sector: 'S13', na_item: 'D2_D5_D91_D61_M' },

  // R&D - RD_E_GERDTOT
  'research_development': { sectperf: 'TOTAL', unit: 'PC_GDP' },

  // Labor - employment datasets
  'employment_rate_15_64': { sex: 'T', age: 'Y15-64', unit: 'PC' },
  'unemployment_rate': { sex: 'T', age: 'Y15-74', unit: 'PC', isced11: 'TOTAL' },
  'youth_unemployment': { sex: 'T', age: 'Y15-24' },
  'long_term_unemployment': { sex: 'T' },

  // Labor - various
  'labor_force_participation': { sex: 'T', age: 'Y15-64' },
  'self_employment': { sex: 'T' },
  'part_time_employment': { sex: 'T' },
  'hours_worked': { sex: 'T' },
  'temporary_employment': { sex: 'T' },
  'gender_pay_gap': { age: 'Y18-64' },

  // Trade - NAMA_10_TRC
  'exports_goods_services': { na_item: 'P6', unit: 'PC_GDP' },
  'imports_goods_services': { na_item: 'P7', unit: 'PC_GDP' },

  // Trade - BOP_C6_A
  'current_account_balance': { bop_item: 'CA', stk_flow: 'BAL', partner: 'WRL_REST', sectpart: 'S1', currency: 'MIO_NAC' },

  // Inflation/Prices
  'inflation_cpi': { coicop: 'CP00', unit: 'RCH_A_AVG' },  // Annual rate of change
  'consumer_price_index': { coicop: 'CP00', unit: 'INX_A_AVG' },

  // Health
  'health_expenditure': { icha11_hf: 'TOT_HF', unit: 'PC_GDP' },
  'hospital_beds': { facility: 'HBEDT', unit: 'P_HTHAB' },
  'physicians': { isco08: 'OC221', unit: 'P_HTHAB' },
  'obesity_rate': { bmi: 'BMI_GE30', sex: 'T', age: 'Y18-64' },

  // Education - EDAT_LFS_9903
  'education_tertiary': { sex: 'T', age: 'Y25-64', isced11: 'ED5-8' },
  'education_secondary': { sex: 'T', age: 'Y25-64', isced11: 'ED3_4' },

  // Education - EDUC_UOE_FINE09
  'education_spending': { sector: 'S13', isced11: 'ED0-8', unit: 'PC_GDP' },

  // Inequality - ILC_DI12
  'gini_coefficient': { indic_il: 'GINI_HND' },

  // Poverty - ILC_LI02
  'poverty_rate': { indic_il: 'LI_R_MD60', age: 'TOTAL', sex: 'T' },

  // Social protection - SPR_EXP_SUM
  'social_protection_expenditure': { spdeps: 'SPBENEFNOREROam', spfunc: 'SPFUNC00', unit: 'PC_GDP' },

  // Environment - ENV_AIR_GGE
  'ghg_emissions': { src_crf: 'TOTX4_MEMONIA', airpol: 'GHG', unit: 'T_HAB' },
  'co2_emissions': { src_crf: 'CRF1', airpol: 'CO2', unit: 'T_HAB' },
  'co2_emissions_total': { src_crf: 'TOTX4_MEMONIA', airpol: 'CO2', unit: 'MIO_T' },

  // Energy - NRG_IND_REN
  'renewable_energy': { nrg_bal: 'REN', unit: 'PC' },

  // Energy - NRG_IND_EI
  'energy_intensity': { nrg_bal: 'FC_IND_E', unit: 'KGOE_TEUR' },

  // Internet - ISOC_CI_IFP_IU
  'internet_users': { indic_is: 'I_IUSE', unit: 'PC_IND', ind_type: 'IND_TOTAL' },

  // Digital - ISOC_CI_IT_H
  'broadband_access': { hhtyp: 'TOTAL', unit: 'PC_HH' },
  'mobile_subscriptions': { unit: 'P_HTHAB' },
};

/**
 * Get exported semantic dimensions for use in other modules
 */
export function getSemanticDimensions(semanticId: string): Record<string, string> | undefined {
  return SEMANTIC_EUROSTAT_DIMENSIONS[semanticId];
}

export async function getEurostatSeries(
  datasetCode: string,
  years?: [number, number],
  geo?: string,
  semanticId?: string
): Promise<Series> {
  const params = new URLSearchParams({
    lang: 'EN'
  });

  if (years) {
    for (let year = years[0]; year <= years[1]; year++) {
      params.append('time', String(year));
    }
  }

  if (geo) {
    params.append('geo', geo.toUpperCase());
  }

  // Add required dimensions for regional datasets (generic dataset filters)
  const datasetDimensions = DATASET_DIMENSIONS[datasetCode];
  if (datasetDimensions) {
    Object.entries(datasetDimensions).forEach(([key, value]) => {
      params.append(key, value);
    });
  }

  // Add semantic-specific dimension filters (more specific, override dataset defaults)
  if (semanticId) {
    const semanticDimensions = SEMANTIC_EUROSTAT_DIMENSIONS[semanticId];
    if (semanticDimensions) {
      Object.entries(semanticDimensions).forEach(([key, value]) => {
        // Remove any existing value for this dimension before adding the specific one
        params.delete(key);
        params.append(key, value);
      });
    }
  }

  const url = `${BASE}/data/${encodeURIComponent(datasetCode)}?${params}`;

  // Check cache first - include semanticId in key to avoid mixing different indicators
  const cacheKey = `eurostat:${datasetCode}:${semanticId || 'raw'}:${geo || 'all'}:${years ? years.join('-') : 'all'}`;
  const cached = eurostatCache.get<Series>(cacheKey);
  if (cached) {
    return cached;
  }

  const { json } = await getWithRetry(() => getJSON(url));

  if (!json) {
    throw new Error(`Invalid Eurostat response for ${datasetCode}`);
  }

  const values = jsonstatToSeries(json as any, 'time', 'geo');

  // No need to filter since we already specified geo in the API request
  const filteredValues = values;

  const geoLevel = detectGeoLevel(geo);

  const series: Series = {
    semanticId: datasetCode,
    unit: (json as any).dataset?.dimension?.unit?.category?.label?.['PC'] || '',
    freq: 'A',
    values: filteredValues.sort((a, b) => a.time.localeCompare(b.time)),
    source: {
      name: 'eurostat',
      id: datasetCode,
      url
    },
    definition: (json as any).dataset?.label,
    retrievedAt: new Date().toISOString(),
    geoLevel,
    geoNote: geoLevel !== 'national' ? `Regional data from Eurostat at ${geoLevel} level` : undefined
  };

  // Cache the result
  eurostatCache.set(cacheKey, series, CACHE_TTL);

  return series;
}

export async function searchEurostatDatasets(query: string) {
  try {
    const catalogUrl = `${BASE}/datasets?lang=EN&search=${encodeURIComponent(query)}`;
    const { json } = await getWithRetry(() => getJSON(catalogUrl));
    
    return ((json as any)?.datasets || []).slice(0, 20).map((dataset: any) => ({
      provider: 'eurostat' as const,
      id: dataset.code,
      label: dataset.title,
      description: dataset.description?.slice(0, 200)
    }));
  } catch (error) {
    console.error('Eurostat search error:', error);
    return [];
  }
}