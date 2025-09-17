import { z } from 'zod';
import { fetchLatest, suggestLocations } from '../providers/openaq.js';

export const latestAtSchema = z.object({
  locationId: z.string().min(1).describe('OpenAQ location identifier')
});

export const latestAtInputSchema = {
  type: 'object',
  properties: {
    locationId: {
      type: 'string',
      description: 'OpenAQ location identifier',
      minLength: 1
    }
  },
  required: ['locationId']
} as const;

export type LatestAtParams = z.infer<typeof latestAtSchema>;

export async function latestAt(params: LatestAtParams) {
  const response = await fetchLatest(params);
  const count = response.results.length;
  if (count > 0) {
    const payload = {
      locationId: params.locationId,
      measurements: response.results,
      meta: response.meta,
      rateLimit: response.rateLimit,
      sourceUrl: response.url
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
  const suggestions = await suggestLocations({ city: undefined, country: undefined, parameter: undefined });
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          message: `No recent measurements found for location ${params.locationId}`,
          suggestions: suggestions.slice(0, 5)
        }, null, 2)
      }
    ]
  };
}
