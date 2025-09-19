# Socioeconomy MCP Server

MCP server providing harmonized access to socioeconomic data from World Bank, Eurostat, OECD, and ILO.

## Tools

### get_series
Get time series data for a semantic indicator with intelligent provider routing.

**Input:**
```json
{
  "semanticId": "gdp_constant_prices",
  "geo": "SE", 
  "years": [2010, 2024],
  "prefer": "wb"
}
```

**Output:**
```json
{
  "semanticId": "gdp_constant_prices",
  "provider": "wb",
  "series": {
    "semanticId": "gdp_constant_prices",
    "unit": "USD_2015",
    "freq": "A", 
    "values": [
      {"time": "2020", "value": 541220074076.98},
      {"time": "2021", "value": 548912458193.64},
      {"time": "2022", "value": 555455234823.45}
    ],
    "source": {
      "name": "wb",
      "id": "NY.GDP.MKTP.KD",
      "url": "https://api.worldbank.org/v2/country/SE/indicator/NY.GDP.MKTP.KD?format=json&per_page=20000"
    },
    "definition": "GDP at purchaser's prices is the sum of gross value added by all resident producers...",
    "retrievedAt": "2024-01-15T10:30:00.000Z"
  },
  "totalDataPoints": 54
}
```

### search_indicator
Search for available indicators across all providers and semantic mappings.

**Input:**
```json
{
  "q": "employment rate"
}
```

**Output:**
```json
{
  "query": "employment rate",
  "totalResults": 12,
  "results": [
    {
      "provider": "semantic",
      "id": "employment_rate_15_64", 
      "label": "Employment rate, age 15-64",
      "unit": "%",
      "description": "Employment as percentage of population aged 15-64",
      "availableProviders": ["eurostat", "wb"]
    },
    {
      "provider": "wb",
      "id": "SL.EMP.TOTL.SP.ZS",
      "label": "Employment to population ratio, 15+, total (%) (national estimate)",
      "unit": "%"
    }
  ]
}
```

### explain_routing
Explain the provider routing logic for a semantic ID and geography.

**Input:**  
```json
{
  "semanticId": "employment_rate_15_64",
  "geo": "DE"
}
```

**Output:**
```json
{
  "semanticId": "employment_rate_15_64",
  "geography": "DE", 
  "routing": {
    "order": ["eurostat", "oecd", "wb", "ilostat"],
    "reason": "EU country detected: Eurostat prioritized"
  },
  "mappings": {
    "eurostat": "LFSI_EMP_A",
    "wb": "SL.EMP.TOTL.SP.ZS"  
  },
  "metadata": {
    "label": "Employment rate, age 15-64",
    "unit": "%",
    "description": "Employment as percentage of population aged 15-64"
  },
  "availableProviders": ["eurostat", "wb"],
  "unavailableProviders": ["oecd", "ilostat"]
}
```

### map_region_code
Convert between ISO and NUTS regional coding systems.

**Input:**
```json
{
  "code": "GR",
  "to": "NUTS"
}
```

**Output:**
```json
{
  "input": {
    "code": "GR",
    "system": "ISO"
  },
  "output": {
    "code": "EL", 
    "system": "NUTS"
  },
  "mapping": "GR (ISO) → EL (NUTS)"
}
```

## Semantic Indicators (15 pre-mapped)

| Semantic ID | Label | Unit | Providers |
|-------------|--------|------|-----------|
| `employment_rate_15_64` | Employment rate, age 15-64 | % | eurostat, wb |
| `unemployment_rate` | Unemployment rate | % | eurostat, wb, oecd |
| `gdp_constant_prices` | GDP at constant prices | USD_2015 | wb, oecd |
| `gdp_per_capita_constant` | GDP per capita, constant | USD_2015 | wb, oecd |
| `inflation_cpi` | Consumer price inflation | % | wb, oecd, eurostat |
| `population_total` | Total population | persons | wb, oecd, eurostat |
| `exports_goods_services` | Exports of goods/services | % of GDP | wb, oecd |
| `government_debt` | Government gross debt | % of GDP | wb, oecd, eurostat |
| `research_development` | R&D expenditure | % of GDP | wb, oecd, eurostat |
| `internet_users` | Internet users | % of population | wb |
| `education_tertiary` | Tertiary education completion | % of population | wb, oecd, eurostat |
| `carbon_emissions` | CO2 emissions | metric tons per capita | wb, oecd |
| `life_expectancy` | Life expectancy at birth | years | wb, oecd |
| `poverty_rate` | Poverty headcount ratio | % of population | wb, oecd |
| `energy_renewable` | Renewable energy consumption | % of total | wb, oecd |

### Semantic Aliases

Common query terms resolve automatically to canonical IDs:

- GDP & growth: `gdp`, `gdp_growth`, `economic_growth` → `gdp_constant_prices`
- GDP per capita: `gdp_per_capita`, `gdp per capita`, `gdppercapita` → `gdp_per_capita_constant`
- Labour market: `unemployment`, `jobless`, `joblessness` → `unemployment_rate`; `employment_rate`, `employment` → `employment_rate_15_64`
- Prices & inflation: `inflation`, `price_growth`, `cpi`, `consumer_price_index` → `inflation_cpi`
- Trade: `exports`, `trade`, `export` → `exports_goods_services`; `imports`, `import` → `imports_goods_services`
- Public sector: `debt`, `public_debt`, `sovereign_debt` → `government_debt`
- Innovation: `r&d`, `research`, `innovation`, `rd` → `research_development`
- Demography: `longevity` → `life_expectancy`

## Provider Routing Logic

### EU Countries (27 members)
1. **Eurostat** - Harmonized EU statistics (JSON-stat format)  
2. **OECD** - SDMX REST API for developed countries
3. **World Bank** - Global coverage with consistent methodology
4. **ILO** - Labor-specific indicators via SDMX

### Non-EU Countries  
1. **World Bank** - Broadest global coverage
2. **OECD** - High-quality data for member countries
3. **Eurostat** - Limited coverage outside EU
4. **ILO** - Labor statistics worldwide

## Data Sources

### World Bank Open Data
- **Coverage**: 217 economies, 1400+ indicators, 1960-present
- **API**: v2 REST JSON format
- **Rate Limits**: None specified (be respectful)
- **Update Frequency**: Annual for most indicators

### Eurostat
- **Coverage**: EU-27, EFTA, candidate countries  
- **API**: Statistics API 1.0 (JSON-stat v2.0 format)
- **Rate Limits**: Fair use policy
- **Update Frequency**: Varies by indicator (monthly to annual)

### OECD
- **Coverage**: 38 member countries + key partners
- **API**: SDMX 2.1 REST (JSON-data format)  
- **Rate Limits**: Reasonable use expected
- **Update Frequency**: Varies by dataset

### ILO (International Labour Organization)
- **Coverage**: 180+ countries, labor statistics
- **API**: SDMX 2.1 REST (sdmx-json format)
- **Rate Limits**: Fair use policy
- **Update Frequency**: Annual/quarterly

## Caching & Performance

- **Cache TTL**: 6 hours for time series data
- **Automatic retry**: 3 attempts with exponential backoff  
- **Provider fallback**: Automatic fallback to next provider on failure
- **Data validation**: Series filtering and quality checks

## Example Usage Scenarios

### Cross-Country GDP Comparison
```javascript
const swedenGDP = await getSeries({
  semanticId: "gdp_constant_prices",
  geo: "SE", 
  years: [2010, 2023]
});

const germanyGDP = await getSeries({
  semanticId: "gdp_constant_prices", 
  geo: "DE",
  years: [2010, 2023]
});
```

### EU Employment Analysis  
```javascript
// Gets Eurostat data for EU country
const employment = await getSeries({
  semanticId: "employment_rate_15_64",
  geo: "FR",
  prefer: "eurostat"
});

// Explain why Eurostat was chosen
const routing = await explainRouting({
  semanticId: "employment_rate_15_64",
  geo: "FR" 
});
```

### Indicator Discovery
```javascript
// Find all available employment indicators
const indicators = await searchIndicator({
  q: "employment unemployment labor"
});
```

## Error Handling

Errors are returned with descriptive messages:

```json
{
  "content": [
    {
      "type": "text", 
      "text": "No data found for employment_rate_15_64. Errors: eurostat: Invalid dataset code; wb: Indicator not found"
    }
  ]
}
```

## Future Extensions (v1.1+)

- Full OECD SDMX implementation with dataflow discovery
- ILO SDMX with updated REST endpoints  
- Regional coding: NUTS level 2/3, SCB codes
- Advanced time series analysis: seasonality, trends
- Data quality indicators and methodology notes
