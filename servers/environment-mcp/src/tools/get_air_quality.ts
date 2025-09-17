import { z } from 'zod';
import { fetchMeasurements } from '../providers/openaq.js';

export const getAirQualitySchema = z.object({
  parameter: z.string().min(1).describe('Pollutant parameter (e.g. pm25, no2)'),
  country: z.string().optional().describe('ISO2 country code'),
  city: z.string().optional().describe('City name'),
  period: z.object({
    from: z.string().optional().describe('ISO date for start time'),
    to: z.string().optional().describe('ISO date for end time')
  }).optional()
});

export const getAirQualityInputSchema = {
  type: 'object',
  properties: {
    parameter: {
      type: 'string',
      description: 'Pollutant parameter (e.g. pm25, no2)',
      minLength: 1
    },
    country: {
      type: 'string',
      description: 'ISO2 country code'
    },
    city: {
      type: 'string',
      description: 'City name'
    },
    period: {
      type: 'object',
      description: 'Time interval for the request',
      properties: {
        from: { type: 'string', description: 'ISO date for start time' },
        to: { type: 'string', description: 'ISO date for end time' }
      }
    }
  },
  required: ['parameter']
} as const;

export type GetAirQualityParams = z.infer<typeof getAirQualitySchema>;

export async function getAirQuality(params: GetAirQualityParams) {
  const response = await fetchMeasurements(params);
  const count = response.results.length;
  if (count > 0) {
    const preview = response.results.slice(0, 10);
    const payload = {
      query: params,
      count,
      preview,
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
  const message = {
    message: `No measurements returned for parameter ${params.parameter}`,
    suggestions: response.suggestions ?? [],
    parameterLatest: response.parameterLatest?.slice(0, 10),
    hint: (response.suggestions?.length ?? 0) > 0
      ? 'Try using latest_at with one of the suggested locationId values.'
      : 'Consider broadening the date range or removing the city filter.'
  };
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(message, null, 2)
      }
    ]
  };
}
