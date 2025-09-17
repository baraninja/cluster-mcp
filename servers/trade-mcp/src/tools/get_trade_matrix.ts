import { z } from 'zod';
import { fetchTradeMatrix } from '../providers/comtrade.js';

export const getTradeMatrixSchema = z.object({
  year: z.number().describe('Reference year for the query'),
  reporter: z.string().min(2).describe('Reporter ISO3 code'),
  partner: z.string().min(2).optional().describe('Partner ISO3 code'),
  flow: z.enum(['imports', 'exports', 'reexports', 'reimports']).describe('Trade flow direction'),
  hs: z.array(z.string().min(2)).optional().describe('List of HS commodity codes to filter'),
  frequency: z.enum(['A', 'M']).default('A').describe('Frequency code (annual or monthly)')
});

export const getTradeMatrixInputSchema = {
  type: 'object',
  properties: {
    year: {
      type: 'number',
      description: 'Reference year for the query'
    },
    reporter: {
      type: 'string',
      description: 'Reporter ISO3 code',
      minLength: 2
    },
    partner: {
      type: 'string',
      description: 'Partner ISO3 code',
      minLength: 2
    },
    flow: {
      type: 'string',
      enum: ['imports', 'exports', 'reexports', 'reimports'],
      description: 'Trade flow direction'
    },
    hs: {
      type: 'array',
      description: 'List of HS commodity codes to filter',
      items: { type: 'string', minLength: 2 }
    },
    frequency: {
      type: 'string',
      enum: ['A', 'M'],
      description: 'Frequency code (annual or monthly)'
    }
  },
  required: ['year', 'reporter', 'flow']
} as const;

export type GetTradeMatrixParams = z.infer<typeof getTradeMatrixSchema>;

export async function getTradeMatrix(params: GetTradeMatrixParams) {
  const result = await fetchTradeMatrix(params);
  if (result) {
    const summary = {
      provider: result.source,
      rowCount: Array.isArray(result.rows) ? result.rows.length : 0,
      sourceUrl: result.url,
      rateLimit: result.rateLimit,
      sample: Array.isArray(result.rows) ? result.rows.slice(0, 10) : result.rows
    };
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(summary, null, 2)
        }
      ]
    };
  }
  return {
    content: [
      {
        type: 'text' as const,
        text: 'No trade data returned for the requested parameters'
      }
    ]
  };
}
