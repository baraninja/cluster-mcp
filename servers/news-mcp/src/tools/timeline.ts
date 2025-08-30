import { z } from 'zod';
import { getWithRetry, getJSON } from '@cluster-mcp/core';

export const timelineSchema = z.object({
  q: z.string().min(1).describe('Search query for timeline'),
  mode: z.enum(['timelinevolraw', 'timelinelang']).optional().default('timelinevolraw').describe('Timeline mode')
});

export type TimelineParams = z.infer<typeof timelineSchema>;

export async function timeline(params: TimelineParams) {
  const { q, mode = 'timelinevolraw' } = params;
  
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&format=json&mode=${mode}&maxrecords=100`;
    
    const { json } = await getWithRetry(() => getJSON(url));
    
    if (!json) {
      return {
        content: [{
          type: 'text' as const,
          text: `No timeline data found for query: ${q}`
        }]
      };
    }
    
    let timelineData;
    
    if (mode === 'timelinevolraw') {
      // Volume over time
      timelineData = {
        mode: 'Volume Timeline',
        description: 'Number of articles over time',
        data: (json as any).timeline || []
      };
    } else {
      // Language breakdown over time  
      timelineData = {
        mode: 'Language Timeline',
        description: 'Article count by language over time',
        data: (json as any).timeline || []
      };
    }
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          query: q,
          timeline: timelineData,
          totalDataPoints: timelineData.data.length,
          retrievedAt: new Date().toISOString()
        }, null, 2)
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: `Error generating timeline: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}