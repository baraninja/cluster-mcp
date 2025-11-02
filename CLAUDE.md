# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **TypeScript monorepo** containing six specialized Model Context Protocol (MCP) servers for research and data analysis:
- **research-mcp**: Academic literature (OpenAlex, Crossref, Europe PMC)
- **socioeconomy-mcp**: Economic indicators (World Bank, Eurostat, OECD, ILO)
- **news-mcp**: Global news monitoring (GDELT)
- **health-mcp**: Global health indicators (WHO, OECD, World Bank)
- **environment-mcp**: Air quality data (OpenAQ v3)
- **trade-mcp**: International trade flows (UN Comtrade)

All servers share a common core package (`@cluster-mcp/core`) that provides HTTP utilities, caching, routing, and data parsers.

## Build & Development Commands

```bash
# Install all dependencies
npm install

# Build all packages and servers (build core first, then servers)
npm run build

# Watch mode for development
npm run dev

# Clean all build artifacts
npm run clean

# Package all servers as .mcpb bundles (requires global mcpb CLI)
npm run pack:all

# Build a specific server only
npm -w servers/research-mcp run build

# Build and package a specific server
npm -w servers/research-mcp run pack:mcpb
```

**Important**: Always build `@cluster-mcp/core` before building servers, as they depend on it. The root `npm run build` script handles this ordering automatically.

## Architecture

### Monorepo Structure
```
cluster-mcp/
├── packages/
│   └── core/              # @cluster-mcp/core - shared utilities
│       ├── src/
│       │   ├── http.ts           # HTTP client with retry logic
│       │   ├── cache/memory.ts   # In-memory TTL cache
│       │   ├── router.ts         # Provider routing logic
│       │   ├── equivalence.ts    # YAML-based indicator mapping
│       │   ├── sdmx/             # SDMX-JSON parsers
│       │   └── util/
│       │       ├── jsonstat.ts   # JSON-stat parser
│       │       ├── sdmxjson.ts   # SDMX-JSON helpers
│       │       └── semanticIds.ts # Semantic alias system
│       └── data/                 # Static reference data
├── servers/
│   ├── research-mcp/
│   ├── socioeconomy-mcp/
│   ├── news-mcp/
│   ├── health-mcp/
│   ├── environment-mcp/
│   └── trade-mcp/
└── scripts/
    ├── pack-mcpb.mjs             # Bundler script
    └── fetch-openaq-countries.mjs # OpenAQ country catalog updater
```

### Server Pattern

Each MCP server follows this structure:
```
servers/<name>/
├── src/
│   ├── server.ts          # MCP Server setup, tool registration
│   ├── aliases.ts         # Semantic alias groups (if applicable)
│   ├── equivalence.yml    # Provider mappings (if applicable)
│   ├── providers/         # API client implementations
│   │   ├── <provider>.ts  # e.g., openalex.ts, eurostat.ts
│   └── tools/             # MCP tool implementations
│       └── <tool_name>.ts # e.g., search_papers.ts
├── package.json
├── tsconfig.json
└── mcp.json               # MCP bundler manifest
```

### Core Package Design

**HTTP Client** (`packages/core/src/http.ts`):
- `getJSON()` and `getText()` with automatic rate limit extraction
- `getWithRetry()` for exponential backoff (350ms, 700ms, 1050ms)
- Automatic `User-Agent` header injection
- Timeout management (default 30s)

**Caching** (`packages/core/src/cache/memory.ts`):
- Simple TTL-based in-memory cache
- Per-provider TTL tuning
- `get()`, `set()`, `delete()`, `clear()`, `cleanup()`, `stats()`

**Routing & Equivalence** (`packages/core/src/router.ts`, `equivalence.ts`):
- `DefaultRoutingPolicy` selects provider order based on geography (EU countries prefer Eurostat)
- `equivalence.yml` files map semantic IDs (e.g., `unemployment_rate`) to provider-specific codes
- `loadEquivalenceYaml()` parses YAML mappings

**Semantic Aliases** (`packages/core/src/util/semanticIds.ts`):
- Fuzzy matching for indicator names (e.g., "gdp" → "gdp_constant_prices")
- `buildSemanticAliasMap()` and `registerCanonicalIds()` helper functions
- Used in `aliases.ts` files in socioeconomy-mcp and health-mcp

**Data Parsers**:
- `jsonstat.ts`: Parses JSON-stat format (Eurostat)
- `sdmxjson.ts`: Parses SDMX-JSON format (OECD, ILO)
- `sdmx/parse-json.ts`: Full SDMX-JSON parser with dimension handling

### Tool Implementation Pattern

MCP tools follow this pattern:

```typescript
import { z } from 'zod';

// Define schema for input validation
export const toolNameSchema = z.object({
  param: z.string().min(1).describe('Parameter description'),
  optionalParam: z.number().optional().describe('Optional parameter')
});

export type ToolNameParams = z.infer<typeof toolNameSchema>;

// Implement the tool logic
export async function toolName(params: ToolNameParams) {
  const { param, optionalParam } = params;

  // Business logic here

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(result, null, 2)
    }]
  };
}
```

In `server.ts`, register tools:
```typescript
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'tool_name',
      description: 'Tool description',
      inputSchema: zodToJsonSchema(toolNameSchema)
    }
  ]
}));

this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'tool_name') {
    const validated = toolNameSchema.parse(request.params.arguments);
    return await toolName(validated);
  }
});
```

## Provider Integration Notes

### Research MCP
- **OpenAlex**: Requires `CONTACT_EMAIL` for polite access (100k req/day, 10 req/s)
- **Crossref**: Uses polite pool with email in User-Agent
- **Europe PMC**: Open API, no key required

### Socioeconomy MCP
- All providers are open (no API keys)
- Uses `equivalence.yml` for semantic routing across World Bank, Eurostat, OECD, ILO
- Provider order: EU countries prefer Eurostat first, others prefer World Bank first
- 15 pre-mapped semantic indicators (see README)

### Health MCP
- **WHO GHO**: OData endpoint with complex filtering to stay under 1k row limit
- Uses local geo filtering after fetching data due to WHO API limitations
- Providers: WHO, OECD SDMX, World Bank HNP

### Environment MCP
- **OpenAQ v3**: Requires `OPENAQ_API_KEY` (60/min, 2000/h rate limits)
- Country IDs cached in source files; run `node scripts/fetch-openaq-countries.mjs` to update
- Tip: Use coordinates + radius for city searches (many feeds omit city names)

### Trade MCP
- **UN Comtrade APIM**: Requires `COMTRADE_API_KEY` and `COMTRADE_BASE_URL`
- Offline catalogues in `src/comtrade_data/` (HS 2022, BEC Rev.5, SITC Rev.4)
- Legacy API fallback available

### News MCP
- **GDELT DOC 2.0**: Open API, no key required
- Real-time news search with full-text and timeline modes

## Environment Variables

```bash
# research-mcp: Polite access for OpenAlex/Crossref
CONTACT_EMAIL=your.email@domain.com

# environment-mcp: OpenAQ API key
OPENAQ_API_KEY=your-openaq-key

# trade-mcp: UN Comtrade credentials
COMTRADE_API_KEY=your-comtrade-key
COMTRADE_BASE_URL=https://comtradeapi.un.org/data/v1/

# Optional: Cache path (defaults to in-memory)
CLUSTER_MCP_CACHE_PATH=./cache.db
```

## TypeScript Configuration

- Base config: `tsconfig.base.json` (target: ES2022, module: ESNext)
- Each package/server extends the base config
- Strict mode enabled with decorators support
- ES modules throughout (`"type": "module"` in all package.json files)

## Testing

```bash
# Run all tests
npm test

# Test specific providers (requires network access)
npm test -- --grep "OpenAlex"
npm test -- --grep "WorldBank"
npm test -- --grep "GDELT"

# Test semantic routing
npm test -- --grep "routing"
```

## Adding a New Server

1. Create directory structure: `servers/<name>/src/`
2. Add `package.json` with MCP SDK dependency and build scripts
3. Create `server.ts` with MCP Server setup
4. Implement providers in `providers/`
5. Implement tools in `tools/`
6. Add to workspace in root `package.json`
7. Create `mcp.json` for bundling configuration
8. Run `npm run build` from root

## Adding a New Semantic Indicator

1. Add mapping to `servers/<name>/equivalence.yml`:
```yaml
new_indicator_id:
  label: "Human-readable label"
  wb: "WB.CODE"
  eurostat: "eurostat_code"
  oecd: "OECD_CODE"
  ilostat: "ILO_CODE"
```

2. Add aliases to `servers/<name>/aliases.ts`:
```typescript
export const aliasGroups = {
  new_indicator_id: ['alias1', 'alias2', 'alias_3']
};
```

3. The routing system will automatically pick the best provider based on geography

## Data Format Standards

- **Time Series**: `{ values: [{year: number, value: number}], metadata: {...} }`
- **Geographic Codes**: ISO 3166-1 alpha-2 (e.g., "SE", "DE", "US")
- **Year Ranges**: Tuple format `[startYear, endYear]`
- **Provider Keys**: `'wb' | 'eurostat' | 'oecd' | 'ilostat' | 'who' | 'openaq' | 'comtrade'`

## Rate Limiting Strategy

All servers implement:
- Automatic retry with exponential backoff (base: 350ms)
- Rate limit extraction from response headers (`x-ratelimit-*`, `Retry-After`)
- Per-provider TTL caching tuned to API characteristics
- Respectful delays when rate limits are hit

## Bundling for Distribution

The `npm run pack:all` command creates standalone `.mcpb` bundles for each server. These bundles:
- Include all dependencies (no npm install needed by end users)
- Can be imported directly into Claude Desktop
- Are created by the `@anthropic-ai/mcpb` CLI tool
- Configuration is in each server's `mcp.json` file

To bundle a single server:
```bash
npm -w servers/research-mcp run pack:mcpb
```

Output bundles are written to `bundles/<server-name>.mcpb`.
