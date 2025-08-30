#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { searchNews } from './tools/search_news.js';
import { timeline } from './tools/timeline.js';
import { z } from 'zod';

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
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;
      
      // Define schemas for validation
      const searchNewsSchema = z.object({
        q: z.string().min(1),
        max: z.number().int().min(10).max(250).optional().default(100)
      });
      
      const timelineSchema = z.object({
        q: z.string().min(1),
        mode: z.enum(['timelinevolraw', 'timelinelang']).optional().default('timelinevolraw')
      });

      try {
        switch (name) {
          case 'search_news':
            return await searchNews(searchNewsSchema.parse(args));
          
          case 'timeline':
            return await timeline(timelineSchema.parse(args));
          
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