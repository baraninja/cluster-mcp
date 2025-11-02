import { z } from 'zod';
import { loadEquivalenceYaml, DefaultRoutingPolicy } from '@cluster-mcp/core';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const getCoverageSchema = z.object({
  semanticId: z.string().min(1).describe('Semantic identifier for the indicator'),
});

export type GetCoverageParams = z.infer<typeof getCoverageSchema>;

// Common country codes for quick coverage check
const SAMPLE_COUNTRIES = [
  'US', 'GB', 'DE', 'FR', 'IT', 'ES', 'SE', 'NO', 'DK', 'FI',
  'JP', 'CN', 'IN', 'BR', 'AU', 'CA', 'MX', 'KR', 'NL', 'BE'
];

const PROVIDER_INFO = {
  wb: {
    name: 'World Bank',
    typicalCoverage: '200+ countries',
    updateFrequency: 'Annual',
    latestYear: 2023
  },
  eurostat: {
    name: 'Eurostat',
    typicalCoverage: 'EU27 + EEA countries, NUTS regions',
    updateFrequency: 'Quarterly/Annual',
    latestYear: 2024
  },
  oecd: {
    name: 'OECD',
    typicalCoverage: '38 OECD members + partners',
    updateFrequency: 'Quarterly/Annual',
    latestYear: 2024
  },
  ilostat: {
    name: 'ILO',
    typicalCoverage: '190+ countries',
    updateFrequency: 'Annual',
    latestYear: 2023
  }
};

export async function getCoverage(params: GetCoverageParams) {
  const { semanticId } = params;

  try {
    const equivalenceFile = join(__dirname, '..', 'equivalence.yml');
    const equivalenceData = loadEquivalenceYaml(equivalenceFile);
    const router = new DefaultRoutingPolicy(equivalenceData);

    const mapping = equivalenceData[semanticId];
    if (!mapping) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            error: 'SEMANTIC_ID_NOT_FOUND',
            message: `Semantic ID '${semanticId}' not found`,
            suggestion: 'Use search_indicator or list_semantic_ids to find available indicators'
          }, null, 2)
        }]
      };
    }

    const providerIds = router.getProviderIds(semanticId);
    const availableProviders = Object.keys(providerIds);

    // Build provider details
    const providerDetails = availableProviders.map(provider => {
      const info = PROVIDER_INFO[provider as keyof typeof PROVIDER_INFO];
      return {
        provider,
        name: info?.name || provider,
        indicatorCode: providerIds[provider as keyof typeof providerIds],
        coverage: info?.typicalCoverage,
        updateFrequency: info?.updateFrequency,
        latestYear: info?.latestYear
      };
    });

    // Get routing order for sample countries
    const sampleRoutingEU = router.getProviderOrder(semanticId, 'DE');
    const sampleRoutingNonEU = router.getProviderOrder(semanticId, 'US');

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          semanticId,
          label: mapping.label,
          unit: mapping.unit,
          description: mapping.description,
          availableProviders: providerDetails,
          routing: {
            euCountries: sampleRoutingEU,
            nonEuCountries: sampleRoutingNonEU,
            explanation: 'EU countries prioritize Eurostat, others prioritize World Bank'
          },
          coverage: {
            countries: 'Varies by provider - typically 30-200+ countries',
            regions: 'NUTS regions available via Eurostat for EU countries',
            yearRange: 'Typically 1990-2024, varies by indicator and provider'
          },
          tips: [
            'Use get_series with specific country code to check actual availability',
            'For EU countries, Eurostat often has the most recent data',
            'World Bank has the broadest country coverage',
            'OECD data is limited to member countries but often higher quality'
          ]
        }, null, 2)
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'FAILED_TO_GET_COVERAGE',
          message: `Error getting coverage: ${error instanceof Error ? error.message : 'Unknown error'}`,
          semanticId
        }, null, 2)
      }]
    };
  }
}
