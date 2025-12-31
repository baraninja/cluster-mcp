# Cluster MCP - Ultimate Research Data Suite

A comprehensive monorepo containing six specialized MCP servers for researchers and analysts.

**MCP Protocol**: 2025-11-25 | **Transport**: stdio + Streamable HTTP | **SDK**: @modelcontextprotocol/sdk v1.25+

## 🔬 Servers

### research-mcp
**Academic literature & citations**
- **OpenAlex**: Search papers, get detailed metadata 
- **Crossref**: BibTeX citations, DOI resolution
- **Europe PMC**: Open access full-text links

### socioeconomy-mcp  
**Economic & social indicators**
- **World Bank**: GDP, employment, development indicators
- **Eurostat**: EU harmonized statistics (JSON-stat)
- **OECD**: Economic data via SDMX
- **ILO**: Labor statistics

### news-mcp
**Global news monitoring**  
- **GDELT DOC 2.0**: Real-time news search & timelines
- Full-text search across global news sources
- Sentiment analysis and trending topics

### health-mcp
**Global health indicators**
- **WHO GHO OData**: Primary source for health stats
  - Uses OData filters on sex/years with local geo filtering to stay under WHO's 1k row cap
- **OECD SDMX**: Supplemental health flows
- **World Bank**: Health, nutrition, population fallback

### environment-mcp
**Air quality monitoring**
- **OpenAQ v3**: Latest and historical measurements
- Handles rate limits via X-API-Key headers
- Location search by parameter, bounding box, or radius with sensor metadata
- Historical and averaged (hour/day/month/year) time-series retrieval
- Data availability & sensor coverage inspection per location
- Country IDs sourced from OpenAQ catalogue (run `node scripts/fetch-openaq-countries.mjs` when syncing)
- Tip: use coordinates + radius when targeting a specific city/district (e.g. Oslo) because many OpenAQ feeds omit the city name; reserve the country code option for national lists.

### trade-mcp
**International trade flows**
- **UN Comtrade APIM**: Modern API with subscription key
- **Legacy Comtrade API**: Fallback when APIM unavailable
- **Offline catalogues**: HS 2022, BEC Rev.5, SITC Rev.4, partners & reporters cached in `src/comtrade_data/`

## 🚀 Quick Start

### Installation & Build
```bash
npm install
npm run build
```

### Transport Modes

All servers support **dual transport**:
- **stdio** (default): For local CLI usage with Claude Desktop
- **http**: Streamable HTTP for remote/Docker deployment

### Claude Desktop Configuration (stdio)
Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "research-mcp": {
      "command": "node",
      "args": ["/path/to/cluster-mcp/servers/research-mcp/dist/server.js"],
      "env": { "CONTACT_EMAIL": "your.email@domain.com" }
    },
    "socioeconomy-mcp": {
      "command": "node", 
      "args": ["/path/to/cluster-mcp/servers/socioeconomy-mcp/dist/server.js"]
    },
    "news-mcp": {
      "command": "node",
      "args": ["/path/to/cluster-mcp/servers/news-mcp/dist/server.js"] 
    },
    "health-mcp": {
      "command": "node",
      "args": ["/path/to/cluster-mcp/servers/health-mcp/dist/server.js"],
      "env": { "CONTACT_EMAIL": "your.email@domain.com" }
    },
    "environment-mcp": {
      "command": "node",
      "args": ["/path/to/cluster-mcp/servers/environment-mcp/dist/server.js"],
      "env": { "OPENAQ_API_KEY": "your-openaq-key" }
    },
    "trade-mcp": {
      "command": "node",
      "args": ["/path/to/cluster-mcp/servers/trade-mcp/dist/server.js"],
      "env": {
        "COMTRADE_API_KEY": "your-comtrade-key",
        "COMTRADE_BASE_URL": "https://comtradeapi.un.org/data/v1/" 
      }
    }
  }
}
```

### Docker Deployment (HTTP)

Run all servers with Docker Compose:

```bash
docker compose up -d
```

This starts all 6 servers on ports 8001-8006:

| Server | Port | Health Check |
|--------|------|--------------|
| socioeconomy-mcp | 8001 | http://localhost:8001/health |
| research-mcp | 8002 | http://localhost:8002/health |
| news-mcp | 8003 | http://localhost:8003/health |
| health-mcp | 8004 | http://localhost:8004/health |
| environment-mcp | 8005 | http://localhost:8005/health |
| trade-mcp | 8006 | http://localhost:8006/health |

Each server exposes:
- `/health` - Health check endpoint
- `/mcp` - MCP Streamable HTTP endpoint
- `/` - Server info

#### Run a Single Server

```bash
# Build and run with Docker
docker build -f servers/research-mcp/Dockerfile -t research-mcp .
docker run -p 8002:8005 -e CONTACT_EMAIL=you@example.com research-mcp

# Or run directly with Node
TRANSPORT=http PORT=8005 node servers/research-mcp/dist/server.js
```

#### Connect HTTP Clients

For MCP clients that support HTTP transport:

```json
{
  "mcpServers": {
    "research-mcp": {
      "url": "http://localhost:8002/mcp"
    }
  }
}
```

## 📊 Example Usage

### Research Papers
```javascript
// Search academic papers
search_papers({ q: "machine learning fairness" })

// Get paper details by DOI  
get_paper({ doi: "10.1038/s41586-022-04566-9" })

// Get BibTeX citation
bibtex_for_doi({ doi: "10.1038/s41586-022-04566-9" })
```

### Economic Data
```javascript
// Get GDP time series for Sweden
get_series({ 
  semanticId: "gdp_constant_prices", 
  geo: "SE", 
  years: [2010, 2024] 
})

// Search indicators
search_indicator({ q: "employment rate" })

// Explain routing logic
explain_routing({ semanticId: "unemployment_rate", geo: "DE" })
```

### News Analysis  
```javascript
// Search recent news
search_news({ 
  q: "municipal AI policy Sweden", 
  max: 100 
})

// Get timeline data
timeline({ 
  q: "climate change adaptation", 
  mode: "timelinevolraw" 
})
```

## 🛠 Development

### Monorepo Structure
```
cluster-mcp/
├── packages/core/          # Shared utilities (@cluster-mcp/core)
├── servers/
│   ├── research-mcp/       # Academic literature server
│   ├── socioeconomy-mcp/   # Economic data server  
│   ├── news-mcp/           # News monitoring server
│   ├── health-mcp/         # Global health indicators server
│   ├── environment-mcp/    # Air quality server
│   └── trade-mcp/          # International trade server
└── docs/                   # Documentation
```

### Available Scripts
- `npm run build` - Build all packages & servers
- `npm run dev` - Watch mode for development  
- `npm run pack:all` - Package all servers into `.mcpb` bundles (requires global `mcpb` CLI)
- `npm test` - Run tests (if available)

## 🔑 API Keys & Rate Limits

### Research MCP
- **OpenAlex**: 100k requests/day, 10 req/s (no key required)
- **Crossref**: Polite pool access with email in User-Agent
- **Europe PMC**: Open API (no key required)

### Socioeconomy MCP  
- **World Bank**: Open API (no key required)
- **Eurostat**: Open API (no key required)
- **OECD**: Open SDMX API (no key required)  
- **ILO**: Open SDMX API (no key required)

### News MCP
- **GDELT**: Free API (no key required)

### Health MCP
- **WHO GHO**: Open OData endpoint (no key required)
- **OECD SDMX**: Public endpoint (no key required)
- **World Bank HNP**: Open API (no key required)

### Environment MCP
- **OpenAQ v3**: Requires API key via `X-API-Key` header (60/min, 2000/h)

### Trade MCP
- **UN Comtrade APIM**: Requires subscription key (`Ocp-Apim-Subscription-Key`)
- **Legacy Comtrade API**: Optional fallback (no key required)

### Recommended Environment Variables
```bash
# Transport configuration (all servers)
TRANSPORT=stdio          # 'stdio' (default) or 'http'
PORT=8005                # HTTP port (default: 8005)
HOST=0.0.0.0             # HTTP host (default: 0.0.0.0)

# research-mcp: Used for Crossref/OpenAlex polite access
CONTACT_EMAIL=your.email@domain.com

# environment-mcp: OpenAQ API key
OPENAQ_API_KEY=your-openaq-key

# trade-mcp: UN Comtrade credentials
COMTRADE_API_KEY=your-comtrade-key
COMTRADE_BASE_URL=https://comtradeapi.un.org/data/v1/

# Optional: Cache database path (defaults to in-memory)
CLUSTER_MCP_CACHE_PATH=./cache.db
```

## 📈 Rate Limiting & Caching

All servers implement:
- **Automatic retry** with exponential backoff (350ms, 700ms, 1050ms)
- **In-memory caching** with configurable TTL tuned per provider family (research, health, socioeconomy, environment, trade)
- **Respectful rate limiting** based on response headers (`Retry-After`, `x-ratelimit-*`)

## 📚 Semantic Indicators

The socioeconomy server includes 15 pre-mapped indicators with routing across providers:

- `employment_rate_15_64` - Employment rate for ages 15-64
- `unemployment_rate` - Unemployment as % of labor force  
- `gdp_constant_prices` - GDP at constant 2015 USD
- `inflation_cpi` - Consumer price inflation
- `population_total` - Total population
- `research_development` - R&D expenditure as % of GDP
- `carbon_emissions` - CO2 emissions per capita  
- `life_expectancy` - Life expectancy at birth
- ...and more

## 🏗 Architecture

### Core Package (`@cluster-mcp/core`)
Shared utilities including:
- **Transport**: Dual transport support (stdio + Streamable HTTP)
- HTTP client with retry logic
- JSON-stat & SDMX-JSON parsers
- Provider routing & equivalence mapping
- In-memory caching system
- Type definitions

### Data Sources
- **Academic**: OpenAlex (25M+ papers), Crossref (130M+ DOIs), Europe PMC (life sciences)
- **Economic**: World Bank (1400+ indicators), Eurostat (EU-27), OECD (38 countries), ILO (labor stats)
- **News**: GDELT (global news monitoring, 100+ languages)
- **Health**: WHO Global Health Observatory, OECD Health Statistics, World Bank HNP
- **Environment**: OpenAQ v3 network (4000+ cities)
- **Trade**: UN Comtrade (APIM + legacy)

## 🧪 Testing

Run integration tests (requires network access):
```bash
# Test specific providers
npm test -- --grep "OpenAlex"  
npm test -- --grep "WorldBank"
npm test -- --grep "GDELT"

# Test semantic mapping
npm test -- --grep "routing"
```

## 📦 MCP Bundles

You can ship any of the STDIO servers as Model Context Protocol bundles for use in clients such as Claude Desktop.

1. Install the bundler once: `npm install -g @anthropic-ai/mcpb`
2. Run `npm run pack:all`

This rebuilds every server and writes ready-to-import bundles to `bundles/<server>.mcpb`. Each server script can also be packed individually with `npm -w <server> run pack:mcpb` if you only need one bundle.

## 📄 License

MIT License - see individual server README files for detailed API documentation.

## 🔮 Roadmap

### v1.1 (Current)
- Dual transport support (stdio + Streamable HTTP)
- Docker deployment with health checks
- All 6 servers fully implemented

### v2.0 (Future)
- NUTS/SCB regional coding
- Advanced caching with SQLite
- Kubernetes deployment manifests
- OAuth 2.1 authentication support
