#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { searchNews, searchNewsSchema } from './tools/search_news.js';
import { timeline, timelineSchema } from './tools/timeline.js';
import {
  fetchArticle,
  fetchArticleSchema,
  fetchMultiple,
  fetchMultipleSchema,
} from './tools/fetch_article.js';

class NewsMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'news-mcp',
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
          name: 'search_news',
          description: 'Search global news articles using GDELT DOC 2.0',
          inputSchema: {
            type: 'object',
            properties: {
              q: {
                type: 'string',
                description: 'Search query for news articles',
                minLength: 1
              },
              max: {
                type: 'number',
                description: 'Maximum number of results',
                minimum: 10,
                maximum: 250,
                default: 100
              }
            },
            required: ['q']
          },
        },
        {
          name: 'timeline',
          description: 'Get news timeline for a topic using GDELT DOC 2.0',
          inputSchema: {
            type: 'object',
            properties: {
              q: {
                type: 'string',
                description: 'Search query for timeline',
                minLength: 1
              },
              mode: {
                type: 'string',
                enum: ['timelinevolraw', 'timelinelang'],
                description: 'Timeline mode',
                default: 'timelinevolraw'
              }
            },
            required: ['q']
          },
        },
        {
          name: 'fetch_article',
          description: 'Fetch the content of a specific news article by URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'Direct URL to the article to fetch',
                format: 'uri',
              },
              maxChars: {
                type: 'number',
                description: 'Maximum number of characters to return (default: 10000, max: 50000)',
                minimum: 1,
                maximum: 50000,
                default: 10000,
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'fetch_multiple',
          description: 'Fetch multiple news articles in a single request',
          inputSchema: {
            type: 'object',
            properties: {
              urls: {
                type: 'array',
                description: 'List of article URLs to fetch (max 5)',
                items: {
                  type: 'string',
                  format: 'uri',
                },
                minItems: 1,
                maxItems: 5,
              },
              maxCharsPerArticle: {
                type: 'number',
                description: 'Character limit for each article (default: 5000, max: 50000)',
                minimum: 1,
                maximum: 50000,
                default: 5000,
              },
            },
            required: ['urls'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_news':
            return await searchNews(searchNewsSchema.parse(args));
          
          case 'timeline':
            return await timeline(timelineSchema.parse(args));

          case 'fetch_article':
            return await fetchArticle(fetchArticleSchema.parse(args));

          case 'fetch_multiple':
            return await fetchMultiple(fetchMultipleSchema.parse(args));
          
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
    
    console.error(`News MCP server running on stdio`);
  }
}

const server = new NewsMcpServer();
server.run().catch(console.error);
