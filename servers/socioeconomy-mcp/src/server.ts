#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { startServer } from '@cluster-mcp/core';

import { getSeries, getSeriesSchema } from './tools/get_series.js';
import { getSeriesBatch, getSeriesBatchSchema } from './tools/get_series_batch.js';
import { searchIndicator, searchIndicatorSchema } from './tools/search_indicator.js';
import { explainRouting } from './tools/explain_routing.js';
import { mapRegionCode } from './tools/map_region_code.js';
import { listSemanticIds } from './tools/list_semantic_ids.js';
import { getCoverage } from './tools/get_coverage.js';
import { z } from 'zod';

// Additional schemas for tools that don't export them
const explainRoutingSchema = z.object({
  semanticId: z.string().min(1).describe('Semantic identifier to explain routing for'),
  geo: z.string().optional().describe('Geographic code to consider for routing')
});

const mapRegionCodeSchema = z.object({
  code: z.string().min(1).describe('Region code to convert'),
  to: z.enum(['ISO', 'NUTS']).describe('Target coding system')
});

const listSemanticIdsSchema = z.object({
  category: z.enum(['all', 'economic', 'social', 'environmental']).optional()
    .describe('Filter by category (default: all)')
});

const getCoverageSchema = z.object({
  semanticId: z.string().min(1).describe('Semantic identifier for the indicator')
});

// Create server with description (new in 2025-11-25)
const server = new McpServer({
  name: 'socioeconomy-mcp',
  version: '0.1.0',
  description: 'Socioeconomic data from World Bank, Eurostat, OECD, and ILO with semantic routing'
});

// Tool annotations for read-only data fetching tools
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
};

// Register tools with new API (prefixed names, title, annotations)

server.tool(
  'socio_get_series',
  {
    semanticId: getSeriesSchema.shape.semanticId,
    geo: getSeriesSchema.shape.geo,
    years: getSeriesSchema.shape.years,
    prefer: getSeriesSchema.shape.prefer,
    strictPreference: getSeriesSchema.shape.strictPreference
  },
  async (params) => {
    const result = await getSeries(getSeriesSchema.parse(params));
    return result;
  }
);

server.tool(
  'socio_get_series_batch',
  {
    semanticId: getSeriesBatchSchema.shape.semanticId,
    geos: getSeriesBatchSchema.shape.geos,
    years: getSeriesBatchSchema.shape.years,
    prefer: getSeriesBatchSchema.shape.prefer,
    strictPreference: getSeriesBatchSchema.shape.strictPreference
  },
  async (params) => {
    const result = await getSeriesBatch(getSeriesBatchSchema.parse(params));
    return result;
  }
);

server.tool(
  'socio_search_indicator',
  {
    q: searchIndicatorSchema.shape.q
  },
  async (params) => {
    const result = await searchIndicator(searchIndicatorSchema.parse(params));
    return result;
  }
);

server.tool(
  'socio_explain_routing',
  {
    semanticId: explainRoutingSchema.shape.semanticId,
    geo: explainRoutingSchema.shape.geo
  },
  async (params) => {
    const result = await explainRouting(explainRoutingSchema.parse(params));
    return result;
  }
);

server.tool(
  'socio_map_region_code',
  {
    code: mapRegionCodeSchema.shape.code,
    to: mapRegionCodeSchema.shape.to
  },
  async (params) => {
    const result = await mapRegionCode(mapRegionCodeSchema.parse(params));
    return result;
  }
);

server.tool(
  'socio_list_semantic_ids',
  {
    category: listSemanticIdsSchema.shape.category
  },
  async (params) => {
    const result = await listSemanticIds(listSemanticIdsSchema.parse(params));
    return result;
  }
);

server.tool(
  'socio_get_coverage',
  {
    semanticId: getCoverageSchema.shape.semanticId
  },
  async (params) => {
    const result = await getCoverage(getCoverageSchema.parse(params));
    return result;
  }
);

// Error handling
server.server.onerror = (error) => console.error('[socioeconomy-mcp]', error);
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

// Start server with dual transport support (stdio or http)
// Set TRANSPORT=http and PORT=8005 for Docker/remote deployment
startServer(server, { serverName: 'socioeconomy-mcp' }).catch((error) => {
  console.error('[socioeconomy-mcp] fatal', error);
  process.exit(1);
});
