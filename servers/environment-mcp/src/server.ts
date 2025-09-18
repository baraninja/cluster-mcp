#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import {
  getAirQuality,
  getAirQualitySchema,
  getAirQualityInputSchema
} from './tools/get_air_quality.js';
import { latestAt, latestAtSchema, latestAtInputSchema } from './tools/latest_at.js';
import {
  searchLocationsTool,
  searchLocationsSchema,
  searchLocationsInputSchema
} from './tools/search_locations.js';
import {
  getHistoricalMeasurements,
  getHistoricalMeasurementsSchema,
  getHistoricalMeasurementsInputSchema
} from './tools/get_historical_measurements.js';
import {
  getAveragedMeasurements,
  getAveragedMeasurementsSchema,
  getAveragedMeasurementsInputSchema
} from './tools/get_averaged_measurements.js';
import {
  getDataAvailability,
  getDataAvailabilitySchema,
  getDataAvailabilityInputSchema
} from './tools/get_data_availability.js';

class EnvironmentMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'environment-mcp',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.registerHandlers();
    this.server.onerror = (error) => console.error('[environment-mcp]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private registerHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        this.describeTool(
          'get_air_quality',
          getAirQualityInputSchema,
          'STEP 2 – Fast status check with WHO health flags. Auto-selects sensors, so you lose station control. Prioritise parameters: pm25 (most health-relevant), no2 (traffic), o3 (secondary pollution).'
        ),
        this.describeTool(
          'latest_at',
          latestAtInputSchema,
          'Direct /locations/{id}/latest call. Supply a known locationId to fetch the provider’s newest values verbatim.'
        ),
        this.describeTool(
          'search_locations',
          searchLocationsInputSchema,
          'STEP 1 – Find candidate stations. For national lists, use ISO country codes; for specific cities, prefer coordinates+radius (≤25 km) or a bbox because many feeds omit city names. Response includes suggestions if few stations (<5) are found.'
        ),
        this.describeTool(
          'get_historical_measurements',
          getHistoricalMeasurementsInputSchema,
          'STEP 3a – Retrieve raw time series via sensors/{id}/measurements with ISO dates (YYYY-MM-DD). Includes WHO health assessment and nearby suggestions when data is missing.'
        ),
        this.describeTool(
          'get_averaged_measurements',
          getAveragedMeasurementsInputSchema,
          'STEP 3b – Aggregated series via sensors/{id}/hours|days|months|years (rollup optional). Includes coverage stats and WHO guideline comparison per point.'
        ),
        this.describeTool(
          'get_data_availability',
          getDataAvailabilityInputSchema,
          'STEP 2b – Inspect sensors before large pulls. Lists parameters, first/last observation timestamps, counts and coverage so you can choose comparable station types (urban background vs traffic).'
        )
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_air_quality':
            return await getAirQuality(getAirQualitySchema.parse(args));
          case 'latest_at':
            return await latestAt(latestAtSchema.parse(args));
          case 'search_locations':
            return await searchLocationsTool(searchLocationsSchema.parse(args));
          case 'get_historical_measurements':
            return await getHistoricalMeasurements(getHistoricalMeasurementsSchema.parse(args));
          case 'get_averaged_measurements':
            return await getAveragedMeasurements(getAveragedMeasurementsSchema.parse(args));
          case 'get_data_availability':
            return await getDataAvailability(getDataAvailabilitySchema.parse(args));
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          isError: true
        };
      }
    });
  }

  private describeTool(name: string, schema: Record<string, unknown>, description: string) {
    return {
      name,
      description,
      inputSchema: schema
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('environment-mcp server ready on STDIO');
  }
}

const server = new EnvironmentMcpServer();
server.run().catch((error) => {
  console.error('[environment-mcp] fatal', error);
  process.exit(1);
});
