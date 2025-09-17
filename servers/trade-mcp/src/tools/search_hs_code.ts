import { z } from 'zod';
import { searchHsCodes } from '../providers/comtrade.js';

export const searchHsCodeSchema = z.object({
  q: z.string().min(1).describe('Search phrase for HS commodity codes'),
  year: z.number().optional().describe('Optional reference year')
});

export const searchHsCodeInputSchema = {
  type: 'object',
  properties: {
    q: {
      type: 'string',
      description: 'Search phrase for HS commodity codes',
      minLength: 1
    },
    year: {
      type: 'number',
      description: 'Optional reference year'
    }
  },
  required: ['q']
} as const;

export type SearchHsCodeParams = z.infer<typeof searchHsCodeSchema>;

export async function searchHsCode(params: SearchHsCodeParams) {
  const results = await searchHsCodes(params);
  if (results.length > 0) {
    const payload = results.slice(0, 25).map((entry) => ({
      code: entry.code,
      description: entry.description,
      note: entry.additionalInformation
    }));
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(payload, null, 2)
        }
      ]
    };
  }
  return {
    content: [
      {
        type: 'text' as const,
        text: `No HS codes found for query "${params.q}"`
      }
    ]
  };
}
