#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import {
  searchHsCode,
  searchHsCodeSchema,
  searchHsCodeInputSchema
} from './tools/search_hs_code.js';
import {
  getTradeMatrix,
  getTradeMatrixSchema,
  getTradeMatrixInputSchema
} from './tools/get_trade_matrix.js';

class TradeMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'trade-mcp',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.registerHandlers();
    this.server.onerror = (error) => console.error('[trade-mcp]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private registerHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        this.describeTool('search_hs_code', searchHsCodeInputSchema, 'Search Harmonised System commodity codes'),
        this.describeTool('get_trade_matrix', getTradeMatrixInputSchema, 'Fetch bilateral trade values for a given flow')
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_hs_code':
            return await searchHsCode(searchHsCodeSchema.parse(args));
          case 'get_trade_matrix':
            return await getTradeMatrix(getTradeMatrixSchema.parse(args));
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
    console.error('trade-mcp server ready on STDIO');
  }
}

const server = new TradeMcpServer();
server.run().catch((error) => {
  console.error('[trade-mcp] fatal', error);
  process.exit(1);
});
