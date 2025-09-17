#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import {
  getAirQuality,
  getAirQualitySchema,
  getAirQualityInputSchema
} from './tools/get_air_quality.js';
import { latestAt, latestAtSchema, latestAtInputSchema } from './tools/latest_at.js';

class EnvironmentMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'environment-mcp',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.registerHandlers();
    this.server.onerror = (error) => console.error('[environment-mcp]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private registerHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        this.describeTool('get_air_quality', getAirQualityInputSchema, 'Retrieve air quality measurements for a region'),
        this.describeTool('latest_at', latestAtInputSchema, 'Get the latest measurements for a specific location')
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_air_quality':
            return await getAirQuality(getAirQualitySchema.parse(args));
          case 'latest_at':
            return await latestAt(latestAtSchema.parse(args));
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
    console.error('environment-mcp server ready on STDIO');
  }
}

const server = new EnvironmentMcpServer();
server.run().catch((error) => {
  console.error('[environment-mcp] fatal', error);
  process.exit(1);
});
