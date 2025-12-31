#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  searchHsCode,
  searchHsCodeSchema
} from './tools/search_hs_code.js';
import {
  getTradeMatrix,
  getTradeMatrixSchema
} from './tools/get_trade_matrix.js';

// Create server with description (new in 2025-11-25)
const server = new McpServer({
  name: 'trade-mcp',
  version: '0.1.0',
  description: 'International trade statistics via UN Comtrade with HS commodity codes'
});

// Register tools with new API (prefixed names)

server.tool(
  'trade_search_hs_code',
  {
    q: searchHsCodeSchema.shape.q,
    year: searchHsCodeSchema.shape.year
  },
  async (params) => {
    const result = await searchHsCode(searchHsCodeSchema.parse(params));
    return result;
  }
);

server.tool(
  'trade_get_matrix',
  {
    year: getTradeMatrixSchema.shape.year,
    reporter: getTradeMatrixSchema.shape.reporter,
    partner: getTradeMatrixSchema.shape.partner,
    flow: getTradeMatrixSchema.shape.flow,
    hs: getTradeMatrixSchema.shape.hs,
    frequency: getTradeMatrixSchema.shape.frequency
  },
  async (params) => {
    const result = await getTradeMatrix(getTradeMatrixSchema.parse(params));
    return result;
  }
);

// Error handling
server.server.onerror = (error) => console.error('[trade-mcp]', error);
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('trade-mcp server ready on STDIO');
}

main().catch((error) => {
  console.error('[trade-mcp] fatal', error);
  process.exit(1);
});
