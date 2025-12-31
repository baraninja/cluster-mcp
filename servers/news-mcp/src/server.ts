#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { searchNews, searchNewsSchema } from './tools/search_news.js';
import { timeline, timelineSchema } from './tools/timeline.js';
import {
  fetchArticle,
  fetchArticleSchema,
  fetchMultiple,
  fetchMultipleSchema,
} from './tools/fetch_article.js';

// Create server with description (new in 2025-11-25)
const server = new McpServer({
  name: 'news-mcp',
  version: '0.1.0',
  description: 'Global news monitoring and search via GDELT DOC 2.0'
});

// Register tools with new API (prefixed names)

server.tool(
  'news_search',
  {
    q: searchNewsSchema.shape.q,
    max: searchNewsSchema.shape.max
  },
  async (params) => {
    const result = await searchNews(searchNewsSchema.parse(params));
    return result;
  }
);

server.tool(
  'news_timeline',
  {
    q: timelineSchema.shape.q,
    mode: timelineSchema.shape.mode
  },
  async (params) => {
    const result = await timeline(timelineSchema.parse(params));
    return result;
  }
);

server.tool(
  'news_fetch_article',
  {
    url: fetchArticleSchema.shape.url,
    maxChars: fetchArticleSchema.shape.maxChars
  },
  async (params) => {
    const result = await fetchArticle(fetchArticleSchema.parse(params));
    return result;
  }
);

server.tool(
  'news_fetch_multiple',
  {
    urls: fetchMultipleSchema.shape.urls,
    maxCharsPerArticle: fetchMultipleSchema.shape.maxCharsPerArticle
  },
  async (params) => {
    const result = await fetchMultiple(fetchMultipleSchema.parse(params));
    return result;
  }
);

// Error handling
server.server.onerror = (error) => console.error('[MCP Error]', error);
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('News MCP server running on stdio');
}

main().catch(console.error);
