import { z } from 'zod';
import { getSeries, getSeriesSchema } from './get_series.js';

export const getSeriesBatchSchema = z.object({
  semanticId: z.string().min(1).describe('Semantic identifier for the indicator'),
  geos: z.array(z.string()).min(1).max(20).describe('Array of geographic codes (ISO2 or NUTS). Max 20 countries.'),
  years: z.tuple([z.number(), z.number()]).optional().describe('Year range [start, end]'),
  prefer: z.enum(['eurostat', 'oecd', 'wb', 'ilostat']).optional().describe('Preferred provider'),
  strictPreference: z.boolean().optional().describe('If true, only use the preferred provider (no fallback)')
});

export type GetSeriesBatchParams = z.infer<typeof getSeriesBatchSchema>;

interface BatchResult {
  geo: string;
  success: boolean;
  data?: any;
  error?: string;
}

export async function getSeriesBatch(params: GetSeriesBatchParams) {
  const { semanticId, geos, years, prefer, strictPreference } = params;

  try {
    // Fetch all series in parallel
    const results = await Promise.allSettled(
      geos.map(geo =>
        getSeries({ semanticId, geo, years, prefer, strictPreference })
      )
    );

    const batchResults: BatchResult[] = results.map((result, index) => {
      const geo = geos[index];

      if (result.status === 'fulfilled') {
        try {
          const content = result.value.content[0];
          if (content.type === 'text') {
            const data = JSON.parse(content.text);

            // Check if this is an error response
            if (data.error) {
              return {
                geo,
                success: false,
                error: data.message || data.error
              };
            }

            return {
              geo,
              success: true,
              data: {
                provider: data.provider,
                series: data.series,
                totalDataPoints: data.totalDataPoints,
                metadata: data.metadata
              }
            };
          }
        } catch (parseError) {
          return {
            geo,
            success: false,
            error: 'Failed to parse response'
          };
        }
      }

      return {
        geo,
        success: false,
        error: result.status === 'rejected' ? result.reason?.message : 'Unknown error'
      };
    });

    // Calculate aggregates for successful results
    const successfulResults = batchResults.filter(r => r.success && r.data);
    const latestValues = successfulResults.map(r => {
      const values = r.data?.series?.values;
      return values && values.length > 0 ? values[values.length - 1].value : null;
    }).filter(v => v !== null) as number[];

    const aggregates = latestValues.length > 0 ? {
      average: latestValues.reduce((a, b) => a + b, 0) / latestValues.length,
      min: Math.min(...latestValues),
      max: Math.max(...latestValues),
      median: [...latestValues].sort((a, b) => a - b)[Math.floor(latestValues.length / 2)]
    } : null;

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          semanticId,
          totalCountries: geos.length,
          successCount: successfulResults.length,
          failureCount: geos.length - successfulResults.length,
          results: batchResults,
          aggregates,
          query: {
            years,
            prefer,
            strictPreference
          }
        }, null, 2)
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'BATCH_QUERY_FAILED',
          message: `Failed to execute batch query: ${error instanceof Error ? error.message : 'Unknown error'}`,
          semanticId,
          geos
        }, null, 2)
      }]
    };
  }
}
