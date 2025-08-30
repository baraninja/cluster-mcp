#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { searchPapers } from './tools/search_papers.js';
import { getPaper } from './tools/get_paper.js';
import { bibtexForDoi } from './tools/bibtex_for_doi.js';
import { z } from 'zod';

class ResearchMcpServer {
  private server: Server;
  private contactEmail: string | undefined;

  constructor() {
    this.server = new Server(
      {
        name: 'research-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.contactEmail = process.env.CONTACT_EMAIL;
    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // Define schemas inline for proper JSON Schema generation
    const searchPapersSchema = z.object({
      q: z.string().min(1).describe('Search query for academic papers')
    });
    
    const getPaperSchema = z.object({
      doi: z.string().min(1).describe('DOI of the paper to retrieve')
    });
    
    const bibtexForDoiSchema = z.object({
      doi: z.string().min(1).describe('DOI to get BibTeX citation for')
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_papers',
          description: 'Search academic papers using OpenAlex',
          inputSchema: {
            type: 'object',
            properties: {
              q: {
                type: 'string',
                description: 'Search query for academic papers',
                minLength: 1
              }
            },
            required: ['q']
          },
        },
        {
          name: 'get_paper',
          description: 'Get detailed information about a paper by DOI',
          inputSchema: {
            type: 'object',
            properties: {
              doi: {
                type: 'string',
                description: 'DOI of the paper to retrieve',
                minLength: 1
              }
            },
            required: ['doi']
          },
        },
        {
          name: 'bibtex_for_doi',
          description: 'Get BibTeX citation for a DOI',
          inputSchema: {
            type: 'object',
            properties: {
              doi: {
                type: 'string',
                description: 'DOI to get BibTeX citation for',
                minLength: 1
              }
            },
            required: ['doi']
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_papers':
            return await searchPapers(searchPapersSchema.parse(args), this.contactEmail);
          
          case 'get_paper':
            return await getPaper(getPaperSchema.parse(args), this.contactEmail);
          
          case 'bibtex_for_doi':
            return await bibtexForDoi(bibtexForDoiSchema.parse(args), this.contactEmail);
          
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
    
    console.error(`Research MCP server running on stdio`);
    console.error(`Contact email: ${this.contactEmail || 'not set'}`);
  }
}

const server = new ResearchMcpServer();
server.run().catch(console.error);