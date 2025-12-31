#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  searchIndicator,
  searchIndicatorSchema
} from './tools/search_indicator.js';
import {
  getSeries,
  getSeriesSchema
} from './tools/get_series.js';
import {
  compareCountries,
  compareCountriesSchema
} from './tools/compare_countries.js';
import {
  getMetadata,
  getMetadataSchema
} from './tools/get_metadata.js';

// Create server with description (new in 2025-11-25)
const server = new McpServer({
  name: 'health-mcp',
  version: '0.1.0',
  description: 'Global health indicators from WHO, OECD, and World Bank with semantic routing'
});

// Register tools with new API (prefixed names)

server.tool(
  'health_search_indicator',
  {
    q: searchIndicatorSchema.shape.q
  },
  async (params) => {
    const result = await searchIndicator(searchIndicatorSchema.parse(params));
    return result;
  }
);

server.tool(
  'health_get_series',
  {
    semanticId: getSeriesSchema.shape.semanticId,
    geo: getSeriesSchema.shape.geo,
    years: getSeriesSchema.shape.years,
    dim1: getSeriesSchema.shape.dim1,
    prefer: getSeriesSchema.shape.prefer
  },
  async (params) => {
    const result = await getSeries(getSeriesSchema.parse(params));
    return result;
  }
);

server.tool(
  'health_compare_countries',
  {
    semanticId: compareCountriesSchema.shape.semanticId,
    geos: compareCountriesSchema.shape.geos,
    years: compareCountriesSchema.shape.years
  },
  async (params) => {
    const result = await compareCountries(compareCountriesSchema.parse(params));
    return result;
  }
);

server.tool(
  'health_get_metadata',
  {
    provider: getMetadataSchema.shape.provider,
    id: getMetadataSchema.shape.id
  },
  async (params) => {
    const result = await getMetadata(getMetadataSchema.parse(params));
    return result;
  }
);

// Error handling
server.server.onerror = (error) => console.error('[health-mcp]', error);
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('health-mcp server ready on STDIO');
}

main().catch((error) => {
  console.error('[health-mcp] fatal', error);
  process.exit(1);
});
