#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { startServer } from '@cluster-mcp/core';

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
server.server.onerror = (error) => console.error('[news-mcp]', error);
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

// Start server with dual transport support (stdio or http)
// Set TRANSPORT=http and PORT=8005 for Docker/remote deployment
startServer(server, { serverName: 'news-mcp' }).catch((error) => {
  console.error('[news-mcp] fatal', error);
  process.exit(1);
});
