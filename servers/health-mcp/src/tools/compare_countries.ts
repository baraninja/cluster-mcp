import { z } from 'zod';
import { compareSeriesByCountry } from '../providers/index.js';

export const compareCountriesSchema = z.object({
  semanticId: z.string().min(1).describe('Semantic indicator identifier'),
  geos: z.array(z.string().min(2)).min(2).describe('Geographic codes to compare'),
  years: z.tuple([z.number(), z.number()]).optional().describe('Year range as [start, end]')
});

export const compareCountriesInputSchema = {
  type: 'object',
  properties: {
    semanticId: {
      type: 'string',
      description: 'Semantic indicator identifier',
      minLength: 1
    },
    geos: {
      type: 'array',
      description: 'Geographic codes to compare',
      minItems: 2,
      items: { type: 'string', minLength: 2 }
    },
    years: {
      type: 'array',
      description: 'Year range as [start, end]',
      minItems: 2,
      maxItems: 2,
      items: { type: 'number' }
    }
  },
  required: ['semanticId', 'geos']
} as const;

export type CompareCountriesParams = z.infer<typeof compareCountriesSchema>;

export async function compareCountries(params: CompareCountriesParams) {
  try {
    const outcome = await compareSeriesByCountry(params);
    const entries = Object.entries(outcome.series);
    if (entries.length > 0) {
      const formatted = entries.map(([geo, series]) => {
        const latest = series.values.length ? series.values[series.values.length - 1] : undefined;
        return {
          geo,
          provider: series.source.name,
          providerId: series.source.id,
          unit: series.unit,
          observations: series.values.length,
          latest,
          notes: series.methodNotes
        };
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              comparisons: formatted,
              diagnostics: outcome.diagnostics
            }, null, 2)
          }
        ]
      };
    }
    const diagnostics = Object.entries(outcome.diagnostics).map(([geo, info]) => ({
      geo,
      providerOrder: info.providerOrder,
      errors: info.errors
    }));
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            message: 'No comparable data returned for requested geographies',
            diagnostics
          }, null, 2)
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
