#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { getSeries, getSeriesSchema } from './tools/get_series.js';
import { getSeriesBatch, getSeriesBatchSchema } from './tools/get_series_batch.js';
import { searchIndicator, searchIndicatorSchema } from './tools/search_indicator.js';
import { explainRouting } from './tools/explain_routing.js';
import { mapRegionCode } from './tools/map_region_code.js';
import { listSemanticIds } from './tools/list_semantic_ids.js';
import { getCoverage } from './tools/get_coverage.js';
import { z } from 'zod';

class SocioeconomyMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'socioeconomy-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_series',
          description: 'Get time series data for a semantic indicator from World Bank, Eurostat, OECD, or ILO',
          inputSchema: {
            type: 'object',
            properties: {
              semanticId: {
                type: 'string',
                description: 'Semantic identifier for the indicator',
                minLength: 1
              },
              geo: {
                type: 'string',
                description: 'Geographic code (ISO2 or regional)',
                optional: true
              },
              years: {
                type: 'array',
                description: 'Year range [start, end]',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                optional: true
              },
              prefer: {
                type: 'string',
                enum: ['eurostat', 'oecd', 'wb', 'ilostat'],
                description: 'Preferred provider',
                optional: true
              },
              strictPreference: {
                type: 'boolean',
                description: 'If true, only use the preferred provider (no fallback to other providers)',
                optional: true
              }
            },
            required: ['semanticId']
          },
        },
        {
          name: 'search_indicator',
          description: 'Search available indicators across socioeconomic data providers',
          inputSchema: {
            type: 'object',
            properties: {
              q: {
                type: 'string',
                description: 'Search query for indicators',
                minLength: 1
              }
            },
            required: ['q']
          },
        },
        {
          name: 'explain_routing',
          description: 'Explain routing logic for a semantic ID and geography',
          inputSchema: {
            type: 'object',
            properties: {
              semanticId: {
                type: 'string',
                description: 'Semantic identifier to explain routing for',
                minLength: 1
              },
              geo: {
                type: 'string',
                description: 'Geographic code to consider for routing',
                optional: true
              }
            },
            required: ['semanticId']
          },
        },
        {
          name: 'get_series_batch',
          description: 'Get time series data for multiple countries at once. Useful for comparisons.',
          inputSchema: {
            type: 'object',
            properties: {
              semanticId: {
                type: 'string',
                description: 'Semantic identifier for the indicator',
                minLength: 1
              },
              geos: {
                type: 'array',
                description: 'Array of geographic codes (ISO2 or NUTS). Maximum 20 countries.',
                items: { type: 'string' },
                minItems: 1,
                maxItems: 20
              },
              years: {
                type: 'array',
                description: 'Year range [start, end]',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                optional: true
              },
              prefer: {
                type: 'string',
                enum: ['eurostat', 'oecd', 'wb', 'ilostat'],
                description: 'Preferred provider',
                optional: true
              },
              strictPreference: {
                type: 'boolean',
                description: 'If true, only use the preferred provider (no fallback)',
                optional: true
              }
            },
            required: ['semanticId', 'geos']
          },
        },
        {
          name: 'map_region_code',
          description: 'Convert between different region coding systems (ISO/NUTS)',
          inputSchema: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'Region code to convert',
                minLength: 1
              },
              to: {
                type: 'string',
                enum: ['ISO', 'NUTS'],
                description: 'Target coding system'
              }
            },
            required: ['code', 'to']
          },
        },
        {
          name: 'list_semantic_ids',
          description: 'List all available semantic indicator IDs with their metadata',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['all', 'economic', 'social', 'environmental'],
                description: 'Filter by category (default: all)',
                optional: true
              }
            }
          },
        },
        {
          name: 'get_coverage',
          description: 'Get data coverage information for a specific semantic indicator',
          inputSchema: {
            type: 'object',
            properties: {
              semanticId: {
                type: 'string',
                description: 'Semantic identifier for the indicator',
                minLength: 1
              }
            },
            required: ['semanticId']
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      // Schemas are imported from tool files to avoid duplication
      // Define remaining schemas that aren't exported
      const explainRoutingSchema = z.object({
        semanticId: z.string().min(1),
        geo: z.string().optional()
      });

      const mapRegionCodeSchema = z.object({
        code: z.string().min(1),
        to: z.enum(['ISO', 'NUTS'])
      });

      const listSemanticIdsSchema = z.object({
        category: z.enum(['all', 'economic', 'social', 'environmental']).optional()
      });

      const getCoverageSchema = z.object({
        semanticId: z.string().min(1)
      });

      try {
        switch (name) {
          case 'get_series':
            return await getSeries(getSeriesSchema.parse(args));

          case 'get_series_batch':
            return await getSeriesBatch(getSeriesBatchSchema.parse(args));

          case 'search_indicator':
            return await searchIndicator(searchIndicatorSchema.parse(args));

          case 'explain_routing':
            return await explainRouting(explainRoutingSchema.parse(args));

          case 'map_region_code':
            return await mapRegionCode(mapRegionCodeSchema.parse(args));

          case 'list_semantic_ids':
            return await listSemanticIds(listSemanticIdsSchema.parse(args));

          case 'get_coverage':
            return await getCoverage(getCoverageSchema.parse(args));
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error(`Socioeconomy MCP server running on stdio`);
  }
}

const server = new SocioeconomyMcpServer();
server.run().catch(console.error);