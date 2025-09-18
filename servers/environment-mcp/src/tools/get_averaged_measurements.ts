import { z } from 'zod';
import { fetchAveragedMeasurements } from '../providers/openaq.js';

const periodSchema = z.object({
  from: z.string().optional().describe('ISO8601 start date (inclusive)'),
  to: z.string().optional().describe('ISO8601 end date (inclusive)')
});

export const getAveragedMeasurementsSchema = z.object({
  locationId: z.union([z.string(), z.number()]).describe('OpenAQ location identifier'),
  parameter: z.string().min(1).describe('Pollutant parameter (e.g. pm25, o3)'),
  averaging: z.enum(['hours', 'days', 'months', 'years']).describe('Averaging interval'),
  rollup: z.string().optional().describe('Optional rollup interval supported by OpenAQ (e.g. yearly)'),
  period: periodSchema.optional(),
  limit: z.number().int().min(1).max(1000).optional().describe('Max number of records (default 100)'),
  sensorLimit: z.number().int().min(1).max(5).optional().describe('Max sensors to query (default 5)')
});

export const getAveragedMeasurementsInputSchema = {
  type: 'object',
  properties: {
    locationId: { type: ['string', 'number'], description: 'OpenAQ location identifier' },
    parameter: { type: 'string', description: 'Pollutant parameter (e.g. pm25, o3)' },
    averaging: {
      type: 'string',
      enum: ['hours', 'days', 'months', 'years'],
      description: 'Averaging interval'
    },
    rollup: { type: 'string', description: 'Optional rollup interval (e.g. yearly)' },
    period: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' }
      }
    },
    limit: { type: 'number', description: 'Max number of records (default 100)' },
    sensorLimit: { type: 'number', description: 'Max sensors to query (default 5)' }
  },
  required: ['locationId', 'parameter', 'averaging']
} as const;

export async function getAveragedMeasurements(params: z.infer<typeof getAveragedMeasurementsSchema>) {
  const response = await fetchAveragedMeasurements({
    locationId: params.locationId,
    parameter: params.parameter,
    averaging: params.averaging,
    rollup: params.rollup,
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
