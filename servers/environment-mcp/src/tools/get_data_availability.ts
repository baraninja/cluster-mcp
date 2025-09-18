import { z } from 'zod';
import { fetchDataAvailability } from '../providers/openaq.js';

export const getDataAvailabilitySchema = z.object({
  locationId: z.union([z.string(), z.number()]).describe('OpenAQ location identifier'),
  parameter: z.string().optional().describe('Optional parameter filter (e.g. pm25)')
});

export const getDataAvailabilityInputSchema = {
  type: 'object',
  properties: {
    locationId: { type: ['string', 'number'], description: 'OpenAQ location identifier' },
    parameter: { type: 'string', description: 'Optional parameter filter (e.g. pm25)' }
  },
  required: ['locationId']
} as const;

export async function getDataAvailability(params: z.infer<typeof getDataAvailabilitySchema>) {
  const availability = await fetchDataAvailability(params.locationId, params.parameter);

  const payload = {
    query: params,
    location: availability.location,
    sensorCount: availability.sensors.length,
    sensors: availability.sensors
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
