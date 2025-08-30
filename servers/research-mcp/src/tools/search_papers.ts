import { z } from 'zod';
import { searchWorks } from '../providers/openalex.js';

export const searchPapersSchema = z.object({
  q: z.string().min(1).describe('Search query for academic papers')
});

export type SearchPapersParams = z.infer<typeof searchPapersSchema>;

export async function searchPapers(params: SearchPapersParams, contactEmail?: string) {
  const { q } = params;
  
  try {
    const results = await searchWorks(q, contactEmail);
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            query: q,
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