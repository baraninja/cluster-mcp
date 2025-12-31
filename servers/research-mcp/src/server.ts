#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { searchPapers } from './tools/search_papers.js';
import { getPaper } from './tools/get_paper.js';
import { bibtexForDoi } from './tools/bibtex_for_doi.js';
import { z } from 'zod';

// Contact email for polite access to OpenAlex/Crossref
const contactEmail = process.env.CONTACT_EMAIL;

// Schemas for tool inputs
const searchPapersSchema = z.object({
  q: z.string().min(1).describe('Search query for academic papers')
});

const getPaperSchema = z.object({
  doi: z.string().min(1).describe('DOI of the paper to retrieve')
});

const bibtexForDoiSchema = z.object({
  doi: z.string().min(1).describe('DOI to get BibTeX citation for')
});

// Create server with description (new in 2025-11-25)
const server = new McpServer({
  name: 'research-mcp',
  version: '0.1.0',
  description: 'Academic literature search via OpenAlex, Crossref, and Europe PMC'
});

// Register tools with new API (prefixed names)

server.tool(
  'research_search_papers',
  {
    q: searchPapersSchema.shape.q
  },
  async (params) => {
    const result = await searchPapers(searchPapersSchema.parse(params), contactEmail);
    return result;
  }
);

server.tool(
  'research_get_paper',
  {
    doi: getPaperSchema.shape.doi
  },
  async (params) => {
    const result = await getPaper(getPaperSchema.parse(params), contactEmail);
    return result;
  }
);

server.tool(
  'research_bibtex_for_doi',
  {
    doi: bibtexForDoiSchema.shape.doi
  },
  async (params) => {
    const result = await bibtexForDoi(bibtexForDoiSchema.parse(params), contactEmail);
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
  console.error('Research MCP server running on stdio');
  console.error(`Contact email: ${contactEmail || 'not set'}`);
}

main().catch(console.error);
