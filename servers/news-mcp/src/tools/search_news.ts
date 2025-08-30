import { z } from 'zod';
import { getWithRetry, getJSON } from '@cluster-mcp/core';
import type { NewsArticle } from '@cluster-mcp/core';

export const searchNewsSchema = z.object({
  q: z.string().min(1).describe('Search query for news articles'),
  max: z.number().int().min(10).max(250).optional().default(100).describe('Maximum number of results')
});

export type SearchNewsParams = z.infer<typeof searchNewsSchema>;

export async function searchNews(params: SearchNewsParams) {
  const { q, max = 100 } = params;
  
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&format=json&maxrecords=${max}&sort=DateDesc`;
    
    const { json } = await getWithRetry(() => getJSON(url));
    
    if (!(json as any)?.articles) {
      return {
        content: [{
          type: 'text' as const,
          text: `No articles found for query: ${q}`
        }]
      };
    }
    
    const articles: NewsArticle[] = (json as any).articles.map((article: any) => ({
      id: article.url || article.urlmobile || `gdelt-${Date.now()}-${Math.random()}`,
      title: article.title,
      url: article.url || article.urlmobile,
      date: article.seendate,
      source: article.domain,
      language: article.language,
      tone: article.tone,
      content: article.socialimage ? `[Social image: ${article.socialimage}]` : undefined
    }));
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          query: q,
          count: articles.length,
          maxRequested: max,
          articles: articles.slice(0, 20).map(article => ({
            title: article.title,
            url: article.url,
            date: article.date,
            source: article.source,
            language: article.language,
            tone: article.tone ? Number(article.tone).toFixed(2) : undefined
          })),
          retrievedAt: new Date().toISOString()
        }, null, 2)
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: `Error searching news: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}