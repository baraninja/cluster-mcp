import { z } from 'zod';
import { fetchSeries } from '../providers/index.js';

export const getSeriesSchema = z.object({
  semanticId: z.string().min(1).describe('Semantic indicator identifier'),
  geo: z.string().optional().describe('Geographic code (ISO, NUTS, etc.)'),
  years: z.tuple([z.number(), z.number()]).optional().describe('Year range as [start, end]'),
  dim1: z.string().optional().describe('Optional disaggregation dimension such as sex or age group'),
  prefer: z.string().optional().describe('Preferred provider key when multiple are available')
});

export const getSeriesInputSchema = {
  type: 'object',
  properties: {
    semanticId: {
      type: 'string',
      description: 'Semantic indicator identifier',
      minLength: 1
    },
    geo: {
      type: 'string',
      description: 'Geographic code (ISO, NUTS, etc.)'
    },
    years: {
      type: 'array',
      description: 'Year range as [start, end]',
      minItems: 2,
      maxItems: 2,
      items: { type: 'number' }
    },
    dim1: {
      type: 'string',
      description: 'Optional disaggregation dimension such as sex or age group'
    },
    prefer: {
      type: 'string',
      description: 'Preferred provider key when multiple are available'
    }
  },
  required: ['semanticId']
} as const;

export type GetSeriesParams = z.infer<typeof getSeriesSchema>;

export async function getSeries(params: GetSeriesParams) {
  try {
    const outcome = await fetchSeries(params);
    if (outcome.series) {
      const previewCount = Math.min(10, outcome.series.values.length);
      const preview = outcome.series.values.slice(-previewCount);
      const payload = {
        semanticId: outcome.series.semanticId,
        provider: outcome.series.source.name,
        providerId: outcome.series.source.id,
        unit: outcome.series.unit,
        frequency: outcome.series.freq,
        definition: outcome.series.definition,
        retrievedAt: outcome.series.retrievedAt,
        pointsPreview: preview,
        totalPoints: outcome.series.values.length,
        sourceUrl: outcome.series.source.url,
        notes: outcome.series.methodNotes,
        providerOrder: outcome.providerOrder,
        errors: outcome.errors
      };
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(payload, null, 2)
          }
        ]
      };
    }
    const response = {
      message: `No data returned for ${params.semanticId}`,
      providerOrder: outcome.providerOrder,
      errors: outcome.errors
    };
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true
    };
  }
}
