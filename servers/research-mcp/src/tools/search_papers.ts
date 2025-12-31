import { z } from 'zod';
import { searchWorks, type SearchWorksOptions } from '../providers/openalex.js';

export const searchPapersSchema = z.object({
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

export type SearchPapersParams = z.infer<typeof searchPapersSchema>;

export async function searchPapers(params: SearchPapersParams, contactEmail?: string) {
  const { q, yearFrom, yearTo, minCitations, oaOnly, sort, limit } = params;

  const options: SearchWorksOptions = {
    yearFrom,
    yearTo,
    minCitations,
    oaOnly,
    sort,
    limit
  };

  try {
    const results = await searchWorks(q, contactEmail, options);
    
    // Build filters summary for response
    const filtersApplied: Record<string, any> = {};
    if (yearFrom) filtersApplied.yearFrom = yearFrom;
    if (yearTo) filtersApplied.yearTo = yearTo;
    if (minCitations) filtersApplied.minCitations = minCitations;
    if (oaOnly) filtersApplied.oaOnly = oaOnly;
    if (sort) filtersApplied.sort = sort;
    if (limit) filtersApplied.limit = limit;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            query: q,
            filters: Object.keys(filtersApplied).length > 0 ? filtersApplied : undefined,
            count: results.length,
            results: results.map((work: any) => ({
              id: work.id,
              doi: work.doi,
              title: work.title,
              authors: work.authorships?.slice(0, 3).map((a: any) => a.author?.display_name).join(', '),
              year: work.publication_year,
              venue: work.primary_location?.source?.display_name,
              citedByCount: work.cited_by_count,
              oaStatus: work.open_access?.oa_status,
              url: work.open_access?.oa_url
            }))
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error searching papers: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ]
    };
  }
}