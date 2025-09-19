import { z } from 'zod';
import { searchIndicators } from '../providers/index.js';

export const searchIndicatorSchema = z.object({
  q: z.string().min(1).describe('Search phrase for health indicators')
});

export const searchIndicatorInputSchema = {
  type: 'object',
  properties: {
    q: {
      type: 'string',
      description: 'Search phrase for health indicators',
      minLength: 1
    }
  },
  required: ['q']
} as const;

export type SearchIndicatorParams = z.infer<typeof searchIndicatorSchema>;

export async function searchIndicator(params: SearchIndicatorParams) {
  const results = await searchIndicators(params);
  if (results.length > 0) {
    const formatted = results.slice(0, 25).map((item) => ({
      provider: item.provider,
      id: item.id,
      alias: item.alias,
      label: item.label,
      unit: item.unit
    }));
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(formatted, null, 2)
        }
      ]
    };
  }
  return {
    content: [
      {
        type: 'text' as const,
        text: `No indicators found for query "${params.q}"`
      }
    ]
  };
}
