import { z } from 'zod';
import { fetchHistoricalMeasurements } from '../providers/openaq.js';

const periodSchema = z.object({
  from: z.string().optional().describe('ISO8601 start date (inclusive)'),
  to: z.string().optional().describe('ISO8601 end date (inclusive)')
}).refine((value) => value.from || value.to, {
  message: 'Provide at least one of period.from or period.to'
});

export const getHistoricalMeasurementsSchema = z.object({
  locationId: z.union([z.string(), z.number()]).describe('OpenAQ location identifier'),
  parameter: z.string().min(1).describe('Pollutant parameter (e.g. pm25, no2)'),
  period: periodSchema.optional(),
  limit: z.number().int().min(1).max(1000).optional().describe('Max number of measurements (default 100)'),
  sensorLimit: z.number().int().min(1).max(5).optional().describe('Max sensors to query (default 5)')
});

export const getHistoricalMeasurementsInputSchema = {
  type: 'object',
  properties: {
    locationId: { type: ['string', 'number'], description: 'OpenAQ location identifier' },
    parameter: { type: 'string', description: 'Pollutant parameter (e.g. pm25, no2)' },
    period: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' }
      }
    },
    limit: { type: 'number', description: 'Max number of measurements (default 100)' },
    sensorLimit: { type: 'number', description: 'Max sensors to query (default 5)' }
  },
  required: ['locationId', 'parameter']
} as const;

export async function getHistoricalMeasurements(params: z.infer<typeof getHistoricalMeasurementsSchema>) {
  const response = await fetchHistoricalMeasurements({
    locationId: params.locationId,
    parameter: params.parameter,
    period: params.period,
    limit: params.limit,
    sensorLimit: params.sensorLimit
  });

  const payload = {
    query: params,
    count: response.results.length,
    url: response.url,
    rateLimit: response.rateLimit,
    meta: response.meta,
    measurements: response.results
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
