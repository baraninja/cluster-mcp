# Health MCP Server

MCP server exposing WHO, OECD, and World Bank health indicators with smart provider fallback.

## Core Tools

- `search_indicator` — discover semantic and provider-specific indicator IDs.
- `get_series` — retrieve harmonized time series with automatic provider routing.
- `compare_countries` — compare the same indicator across multiple geographies.
- `get_metadata` — fetch definitions and units for a given indicator.

## Pre-Mapped Semantic IDs

| Semantic ID | Label | Unit | Providers |
|-------------|-------|------|-----------|
| `life_expectancy_birth_total` | Life expectancy at birth, total | years | who, oecd, wb |
| `life_expectancy_birth_male` | Life expectancy at birth, male | years | who |
| `life_expectancy_birth_female` | Life expectancy at birth, female | years | who |
| `healthy_life_expectancy_total` | Healthy life expectancy at birth, total | years | who |
| `healthy_life_expectancy_male` | Healthy life expectancy at birth, male | years | who |
| `healthy_life_expectancy_female` | Healthy life expectancy at birth, female | years | who |
| `life_expectancy_at_birth` | Life expectancy at birth (legacy id) | years | who |
| `imr` | Infant mortality rate | deaths per 1000 live births | who, wb |
| `maternal_mortality_ratio` | Maternal mortality ratio | deaths per 100000 live births | who, wb |

## Semantic Aliases

Common query terms automatically resolve to canonical IDs:

- Life expectancy: `life_expectancy`, `life_expectancy_total`, `longevity` → `life_expectancy_birth_total`
- Infant mortality: `infant_mortality`, `child_mortality` → `imr`
- Maternal mortality: `maternal_mortality`, `birth_deaths`, `mmr` → `maternal_mortality_ratio`

Alias lookups are surfaced in `search_indicator` results and annotated in `get_series` responses.

## Provider Fallback Order

1. **WHO GHO** — default source when a semantic mapping exists.
2. **OECD Health** — SDMX fallback for OECD members when WHO is unavailable.
3. **World Bank** — final fallback for global coverage.

Set `CONTACT_EMAIL` to help upstream providers identify your traffic and configure `CLUSTER_MCP_CACHE_PATH` for persistent caching across sessions.
