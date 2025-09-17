#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import {
  searchIndicator,
  searchIndicatorSchema,
  searchIndicatorInputSchema
} from './tools/search_indicator.js';
import {
  getSeries,
  getSeriesSchema,
  getSeriesInputSchema
} from './tools/get_series.js';
import {
  compareCountries,
  compareCountriesSchema,
  compareCountriesInputSchema
} from './tools/compare_countries.js';
import {
  getMetadata,
  getMetadataSchema,
  getMetadataInputSchema
} from './tools/get_metadata.js';

class HealthMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'health-mcp',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.registerHandlers();
    this.server.onerror = (error) => console.error('[health-mcp]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private registerHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        this.describeTool('search_indicator', searchIndicatorInputSchema, 'Search for health indicators by keyword'),
        this.describeTool('get_series', getSeriesInputSchema, 'Fetch a time series for a given health indicator'),
        this.describeTool('compare_countries', compareCountriesInputSchema, 'Compare an indicator across multiple countries'),
        this.describeTool('get_metadata', getMetadataInputSchema, 'Retrieve metadata for a specific indicator')
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_indicator':
            return await searchIndicator(searchIndicatorSchema.parse(args));
          case 'get_series':
            return await getSeries(getSeriesSchema.parse(args));
          case 'compare_countries':
            return await compareCountries(compareCountriesSchema.parse(args));
          case 'get_metadata':
            return await getMetadata(getMetadataSchema.parse(args));
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          isError: true
        };
      }
    });
  }

  private describeTool(name: string, schema: Record<string, unknown>, description: string) {
    return {
      name,
      description,
      inputSchema: schema
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('health-mcp server ready on STDIO');
  }
}

const server = new HealthMcpServer();
server.run().catch((error) => {
  console.error('[health-mcp] fatal', error);
  process.exit(1);
});
