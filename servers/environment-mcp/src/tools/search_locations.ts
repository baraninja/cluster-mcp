import { z } from 'zod';
import { searchLocations } from '../providers/openaq.js';

const bboxSchema = z.object({
  west: z.number().min(-180).max(180),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90)
}).refine((bbox) => bbox.east !== bbox.west && bbox.north !== bbox.south, {
  message: 'Bounding box coordinates must enclose an area'
});

const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().positive().max(25).optional()
});

export const searchLocationsSchema = z.object({
  parameter: z.string().optional().describe('Pollutant or measurement parameter (e.g. pm25, no2)'),
  country: z.string().optional().describe('ISO country code (any format; auto-mapped to ISO2)'),
  city: z.string().optional().describe('City name filter'),
  bbox: bboxSchema.optional().describe('Bounding box [west,south,east,north] to constrain the search'),
  coordinates: coordinatesSchema.optional().describe('Latitude/longitude (+optional radiusKm) for radial search'),
  limit: z.number().int().min(1).max(1000).optional().describe('Maximum number of locations (default 50)'),
  includeSensors: z.boolean().optional().describe('Whether to include sensor metadata in results (default true)')
}).refine((data) => !(data.bbox && data.coordinates), {
  message: 'Provide either bbox or coordinates, not both'
});

export type SearchLocationsParams = z.infer<typeof searchLocationsSchema>;

export const searchLocationsInputSchema = {
  type: 'object',
  properties: {
    parameter: { type: 'string', description: 'Pollutant or measurement parameter (e.g. pm25, no2)' },
    country: { type: 'string', description: 'ISO country code (auto-mapped to ISO2)' },
    city: { type: 'string', description: 'City name filter' },
    bbox: {
      type: 'object',
      properties: {
        west: { type: 'number' },
        south: { type: 'number' },
        east: { type: 'number' },
        north: { type: 'number' }
      },
      required: ['west', 'south', 'east', 'north']
    },
    coordinates: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        radiusKm: { type: 'number' }
      },
      required: ['latitude', 'longitude']
    },
    limit: { type: 'number', description: 'Maximum number of locations (default 50)' },
    includeSensors: { type: 'boolean', description: 'Include sensor metadata (default true)' }
  }
} as const;

export async function searchLocationsTool(params: SearchLocationsParams) {
  const result = await searchLocations(params);
  const payload = {
    query: result.query,
    count: result.results.length,
    url: result.url,
    rateLimit: result.rateLimit,
    meta: result.meta,
    results: result.results.map((item) => ({
      locationId: item.locationId,
      location: item.location,
      city: item.city,
      country: item.country,
      latitude: item.latitude,
      longitude: item.longitude,
      parameters: item.parameters,
      sensors: params.includeSensors === false ? undefined : item.sensors
    }))
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
