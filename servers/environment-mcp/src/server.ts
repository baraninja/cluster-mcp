#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  getAirQuality,
  getAirQualitySchema
} from './tools/get_air_quality.js';
import { latestAt, latestAtSchema } from './tools/latest_at.js';
import {
  searchLocationsTool,
  searchLocationsSchema,
  searchLocationsBaseSchema
} from './tools/search_locations.js';
import {
  getHistoricalMeasurements,
  getHistoricalMeasurementsSchema
} from './tools/get_historical_measurements.js';
import {
  getAveragedMeasurements,
  getAveragedMeasurementsSchema
} from './tools/get_averaged_measurements.js';
import {
  getDataAvailability,
  getDataAvailabilitySchema
} from './tools/get_data_availability.js';

// Create server with description (new in 2025-11-25)
const server = new McpServer({
  name: 'environment-mcp',
  version: '0.1.0',
  description: 'Air quality monitoring via OpenAQ v3 with WHO health guidelines'
});

// Register tools with new API (prefixed names)

server.tool(
  'env_get_air_quality',
  {
    parameter: getAirQualitySchema.shape.parameter,
    country: getAirQualitySchema.shape.country,
    city: getAirQualitySchema.shape.city,
    period: getAirQualitySchema.shape.period
  },
  async (params) => {
    const result = await getAirQuality(getAirQualitySchema.parse(params));
    return result;
  }
);

server.tool(
  'env_latest_at',
  {
    locationId: latestAtSchema.shape.locationId
  },
  async (params) => {
    const result = await latestAt(latestAtSchema.parse(params));
    return result;
  }
);

server.tool(
  'env_search_locations',
  {
    parameter: searchLocationsBaseSchema.shape.parameter,
    country: searchLocationsBaseSchema.shape.country,
    city: searchLocationsBaseSchema.shape.city,
    bbox: searchLocationsBaseSchema.shape.bbox,
    coordinates: searchLocationsBaseSchema.shape.coordinates,
    limit: searchLocationsBaseSchema.shape.limit,
    includeSensors: searchLocationsBaseSchema.shape.includeSensors
  },
  async (params) => {
    const result = await searchLocationsTool(searchLocationsSchema.parse(params));
    return result;
  }
);

server.tool(
  'env_get_historical_measurements',
  {
    locationId: getHistoricalMeasurementsSchema.shape.locationId,
    parameter: getHistoricalMeasurementsSchema.shape.parameter,
    period: getHistoricalMeasurementsSchema.shape.period,
    limit: getHistoricalMeasurementsSchema.shape.limit,
    sensorLimit: getHistoricalMeasurementsSchema.shape.sensorLimit
  },
  async (params) => {
    const result = await getHistoricalMeasurements(getHistoricalMeasurementsSchema.parse(params));
    return result;
  }
);

server.tool(
  'env_get_averaged_measurements',
  {
    locationId: getAveragedMeasurementsSchema.shape.locationId,
    parameter: getAveragedMeasurementsSchema.shape.parameter,
    averaging: getAveragedMeasurementsSchema.shape.averaging,
    rollup: getAveragedMeasurementsSchema.shape.rollup,
    period: getAveragedMeasurementsSchema.shape.period,
    limit: getAveragedMeasurementsSchema.shape.limit,
    sensorLimit: getAveragedMeasurementsSchema.shape.sensorLimit
  },
  async (params) => {
    const result = await getAveragedMeasurements(getAveragedMeasurementsSchema.parse(params));
    return result;
  }
);

server.tool(
  'env_get_data_availability',
  {
    locationId: getDataAvailabilitySchema.shape.locationId,
    parameter: getDataAvailabilitySchema.shape.parameter
  },
  async (params) => {
    const result = await getDataAvailability(getDataAvailabilitySchema.parse(params));
    return result;
  }
);

// Error handling
server.server.onerror = (error) => console.error('[environment-mcp]', error);
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('environment-mcp server ready on STDIO');
}

main().catch((error) => {
  console.error('[environment-mcp] fatal', error);
  process.exit(1);
});
