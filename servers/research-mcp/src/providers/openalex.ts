import { getWithRetry, getJSON, buildUserAgent } from '@cluster-mcp/core';
import type { Work } from '@cluster-mcp/core';

const BASE = 'https://api.openalex.org';

export interface SearchWorksOptions {
  yearFrom?: number;
  yearTo?: number;
  minCitations?: number;
  oaOnly?: boolean;
  sort?: 'relevance' | 'date' | 'cited_by_count';
  limit?: number;
}

export async function searchWorks(query: string, contactEmail?: string, options?: SearchWorksOptions) {
  const filters: string[] = [];

  if (options?.yearFrom && options?.yearTo) {
    filters.push(`publication_year:${options.yearFrom}-${options.yearTo}`);
  } else if (options?.yearFrom) {
    filters.push(`publication_year:>=${options.yearFrom}`);
  } else if (options?.yearTo) {
    filters.push(`publication_year:<=${options.yearTo}`);
  }

  if (options?.minCitations) {
    filters.push(`cited_by_count:>=${options.minCitations}`);
  }

  if (options?.oaOnly) {
    filters.push('is_oa:true');
  }

  const params = new URLSearchParams({
    search: query,
    'per-page': String(options?.limit ?? 25)
  });

  if (filters.length > 0) {
    params.set('filter', filters.join(','));
  }

  if (options?.sort) {
    const sortMap: Record<string, string> = {
      relevance: 'relevance_score:desc',
      date: 'publication_date:desc',
      cited_by_count: 'cited_by_count:desc'
    };
    params.set('sort', sortMap[options.sort] ?? 'relevance_score:desc');
  }

  if (contactEmail) {
    params.set('mailto', contactEmail);
  }

  const url = `${BASE}/works?${params}`;
  const headers = { 'User-Agent': buildUserAgent(contactEmail) };

  const { json } = await getWithRetry(() => getJSON(url, headers));
  return (json as any)?.results ?? (json as any)?.data ?? [];
}

export async function getWorkByDOI(doi: string, contactEmail?: string): Promise<Work | null> {
  const params = new URLSearchParams();
  if (contactEmail) {
    params.set('mailto', contactEmail);
  }
  
  const url = `${BASE}/works/https://doi.org/${encodeURIComponent(doi)}${params.toString() ? '?' + params : ''}`;
  const headers = { 'User-Agent': buildUserAgent(contactEmail) };
  
  try {
    const { json: work } = await getWithRetry(() => getJSON(url, headers));
    if (!(work as any)?.id) return null;
    
    const w = work as any;
    return {
      id: w.id,
      doi: w.doi?.replace(/^https?:\/\/doi\.org\//, ''),
      title: w.title,
      authors: w.authorships?.map((authorship: any) => ({
        id: authorship.author?.id,
        name: authorship.author?.display_name
      })),
      publicationYear: w.publication_year,
      venue: w.primary_location?.source?.display_name,
      oaStatus: w.open_access?.oa_status,
      citedByCount: w.cited_by_count,
      referencedWorks: w.referenced_works,
      abstract: w.abstract_inverted_index 
        ? Object.entries(w.abstract_inverted_index)
            .sort((a: any, b: any) => a[1][0] - b[1][0])
            .map(([word]: any) => word)
            .join(' ')
        : undefined,
      external: { 
        openalex: w.id, 
        pdf: w.open_access?.oa_url 
      }
    };
  } catch (error) {
    console.error(`OpenAlex error for DOI ${doi}:`, error);
    return null;
  }
}