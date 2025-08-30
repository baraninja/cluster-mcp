# @cluster-mcp/core

Shared core utilities for the cluster-mcp servers providing common functionality for HTTP requests, data parsing, caching, and provider routing.

## Installation

```bash
npm install @cluster-mcp/core
```

## Core Features

### HTTP Client with Retry Logic
Robust HTTP client with automatic retries and rate limiting.

```typescript
import { getJSON, getText, getWithRetry } from '@cluster-mcp/core';

// JSON requests with retry
const { json, headers } = await getJSON('https://api.example.com/data');

// Text requests  
const { text } = await getText('https://api.example.com/citation', {
  'Accept': 'application/x-bibtex'
});

// Custom retry wrapper
const result = await getWithRetry(
  () => riskyApiCall(),
  3, // tries
  500 // base delay ms
);
```

### Data Format Parsers

#### JSON-stat Parser
Convert JSON-stat v2.0 format to normalized time series.

```typescript
import { jsonstatToSeries } from '@cluster-mcp/core';

const eurostatResponse = {
  dataset: {
    dimension: { time: {...}, geo: {...} },
    value: [100, 102, 104]
  }
};

const series = jsonstatToSeries(eurostatResponse, 'time', 'geo');
// Returns: [{ time: '2020', value: 100, geo: 'SE' }, ...]
```

#### SDMX-JSON Parser  
Convert SDMX-JSON format to observations and time series.

```typescript
import { sdmxJsonToObs, sdmxJsonToSeries } from '@cluster-mcp/core';

// Parse SDMX observations
const { dimensionIds, rows } = sdmxJsonToObs(sdmxResponse);

// Convert to time series
const series = sdmxJsonToSeries(sdmxResponse, 'TIME_PERIOD', 'REF_AREA');
```

### Caching System
In-memory caching with TTL support.

```typescript
import { MemoryCache } from '@cluster-mcp/core';

const cache = new MemoryCache();

// Set with TTL
cache.set('key1', { data: 'value' }, 60000); // 1 minute

// Get (returns null if expired)  
const value = cache.get<any>('key1');

// Cleanup expired entries
cache.cleanup();

// Get statistics
const { total, expired } = cache.stats();
```

### Provider Routing
Intelligent routing across data providers based on geography and availability.

```typescript
import { DefaultRoutingPolicy, loadEquivalenceYaml } from '@cluster-mcp/core';

// Load semantic mappings
const equivalenceData = loadEquivalenceYaml('./indicators.yml');

// Initialize router
const router = new DefaultRoutingPolicy(equivalenceData);

// Get provider order (EU countries prefer Eurostat)
const order = router.getProviderOrder('gdp_constant', 'DE');
// Returns: ['eurostat', 'oecd', 'wb', 'ilostat']

// Get provider-specific IDs
const ids = router.getProviderIds('gdp_constant');
// Returns: { eurostat: 'GDP_EUR', wb: 'NY.GDP.MKTP.KD', ... }
```

## Type Definitions

### Core Types
```typescript
// Time series data structure
interface Series {
  semanticId: string;
  unit: string;
  freq: 'A' | 'Q' | 'M';  // Annual, Quarterly, Monthly
  values: { time: string; value: number; geo?: string }[];
  source: { name: ProviderKey; id: string; url: string };
  definition?: string;
  methodNotes?: string;
  retrievedAt: string;
}

// Academic work metadata  
interface Work {
  id: string;
  doi?: string;
  title: string;
  authors?: { id?: string; name: string }[];
  publicationYear?: number;
  venue?: string;
  oaStatus?: string;
  external?: { openalex?: string; crossref?: string; pdf?: string };
  citedByCount?: number;
  referencedWorks?: string[];
  abstract?: string;
}

// News article structure
interface NewsArticle {
  id: string;
  title?: string;
  url?: string;
  date?: string;
  source?: string;
  language?: string;
  tone?: number;
  content?: string;
}
```

### Provider Keys
```typescript
type ProviderKey = 
  | 'eurostat'   // EU statistics
  | 'oecd'       // OECD data  
  | 'ilostat'    // ILO labor statistics
  | 'wb'         // World Bank
  | 'openalex'   // Academic papers
  | 'crossref'   // Citations
  | 'europepmc'  // Life sciences  
  | 'gdelt';     // News data
```

## Equivalence File Format

YAML format for mapping semantic IDs across providers:

```yaml
# indicators.yml
employment_rate_15_64:
  label: "Employment rate, age 15-64"
  unit: "%"
  eurostat: "LFSI_EMP_A"
  wb: "SL.EMP.TOTL.SP.ZS"
  description: "Employment as percentage of population aged 15-64"

gdp_constant_prices:
  label: "GDP at constant prices"  
  unit: "USD_2015"
  wb: "NY.GDP.MKTP.KD"
  oecd: "SNA_TABLE1.B1_GE.GDP.C"
  description: "Gross domestic product at constant 2015 US dollars"
```

## Utility Functions

### User Agent Builder
```typescript
import { buildUserAgent } from '@cluster-mcp/core';

const userAgent = buildUserAgent('your.email@domain.com');
// Returns: "cluster-mcp/0.1 (mailto:your.email@domain.com)"
```

### Equivalence Validation  
```typescript
import { validateEquivalenceEntry } from '@cluster-mcp/core';

const isValid = validateEquivalenceEntry({
  label: "GDP Growth",
  wb: "NY.GDP.MKTP.KD.ZG"  
});
```

## Error Handling

All functions use consistent error handling patterns:

```typescript
try {
  const data = await getJSON(url);
} catch (error) {
  console.error('Request failed:', error.message);
  // Automatic retry already attempted
}
```

## Best Practices

### HTTP Requests
- Always use `getWithRetry()` wrapper for external APIs
- Include appropriate User-Agent with contact email
- Respect rate limits with built-in delays
- Cache responses when appropriate

### Data Processing
- Validate data format before parsing
- Handle missing/null values gracefully
- Use semantic IDs for cross-provider compatibility
- Include source metadata in all results

### Caching Strategy
- Use TTL appropriate to data freshness needs
- Clean up expired entries periodically  
- Monitor cache hit rates for optimization
- Consider memory usage for large datasets

## Extension Points

### Custom Providers
Extend routing policy for new data providers:

```typescript
class CustomRoutingPolicy extends DefaultRoutingPolicy {
  getProviderOrder(semanticId: string, geo?: string): ProviderKey[] {
    // Custom routing logic
    return super.getProviderOrder(semanticId, geo);
  }
}
```

### Custom Parsers
Add parsers for new data formats:

```typescript
export function customFormatToSeries(data: any): Series {
  // Transform custom format to standard Series interface
  return {
    semanticId: data.id,
    unit: data.unit,
    freq: 'A',
    values: data.observations,
    source: { name: 'custom', id: data.id, url: data.source },
    retrievedAt: new Date().toISOString()
  };
}
```

## Development

### Building
```bash
npm run build     # Compile TypeScript
npm run dev       # Watch mode
npm run clean     # Clean dist/
```

### Testing
```bash
npm test          # Run unit tests  
npm run test:int  # Integration tests (requires network)
```

## Dependencies

- **undici**: High-performance HTTP client
- **yaml**: YAML parsing for equivalence files  
- **zod**: Runtime type validation

## License

MIT