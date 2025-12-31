#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { startServer } from '@cluster-mcp/core';

import { searchPapers } from './tools/search_papers.js';
import { getPaper } from './tools/get_paper.js';
import { bibtexForDoi } from './tools/bibtex_for_doi.js';
import { z } from 'zod';

// Contact email for polite access to OpenAlex/Crossref
const contactEmail = process.env.CONTACT_EMAIL;

// Schemas for tool inputs
const searchPapersSchema = z.object({
  q: z.string().min(1).describe('Search query for academic papers'),
  yearFrom: z.number().int().min(1900).max(2100).optional()
    .describe('Filter: minimum publication year (e.g., 2020)'),
  yearTo: z.number().int().min(1900).max(2100).optional()
    .describe('Filter: maximum publication year (e.g., 2024)'),
  minCitations: z.number().int().min(0).optional()
    .describe('Filter: minimum citation count (e.g., 10 for well-cited papers)'),
  oaOnly: z.boolean().optional()
    .describe('Filter: only return open access papers'),
  sort: z.enum(['relevance', 'date', 'cited_by_count']).optional()
    .describe('Sort results by: relevance (default), date (newest first), or cited_by_count (most cited first)'),
  limit: z.number().int().min(1).max(100).optional()
    .describe('Maximum number of results (default 25, max 100)')
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
    q: searchPapersSchema.shape.q,
    yearFrom: searchPapersSchema.shape.yearFrom,
    yearTo: searchPapersSchema.shape.yearTo,
    minCitations: searchPapersSchema.shape.minCitations,
    oaOnly: searchPapersSchema.shape.oaOnly,
    sort: searchPapersSchema.shape.sort,
    limit: searchPapersSchema.shape.limit
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
server.server.onerror = (error) => console.error('[research-mcp]', error);
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

// Start server with dual transport support (stdio or http)
// Set TRANSPORT=http and PORT=8005 for Docker/remote deployment
console.error(`Contact email: ${contactEmail || 'not set (set CONTACT_EMAIL for polite access)'}`);
startServer(server, { serverName: 'research-mcp' }).catch((error) => {
  console.error('[research-mcp] fatal', error);
  process.exit(1);
});
