# Cluster MCP - Ultimate Research Data Suite

A comprehensive monorepo containing three specialized MCP servers for researchers and analysts:

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

## 🚀 Quick Start

### Installation & Build
```bash
npm install
npm run build
```

### Claude Desktop Configuration 
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
│   └── news-mcp/           # News monitoring server
└── docs/                   # Documentation
```

### Available Scripts
- `npm run build` - Build all packages & servers
- `npm run dev` - Watch mode for development  
- `npm run pack:all` - Package all servers (STDIO only)
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

### Recommended Environment Variables
```bash
# research-mcp: Used for Crossref/OpenAlex polite access  
CONTACT_EMAIL=your.email@domain.com

# Optional: Cache database path (defaults to in-memory)
CLUSTER_MCP_CACHE_PATH=./cache.db
```

## 📈 Rate Limiting & Caching

All servers implement:
- **Automatic retry** with exponential backoff (350ms, 700ms, 1050ms)
- **In-memory caching** with configurable TTL:
  - Research APIs: 24 hours
  - Economic APIs: 6 hours  
  - News APIs: 6 hours
- **Respectful rate limiting** per provider guidelines

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
- HTTP client with retry logic  
- JSON-stat & SDMX-JSON parsers
- Provider routing & equivalence mapping
- In-memory caching system
- Type definitions

### Data Sources
- **Academic**: OpenAlex (25M+ papers), Crossref (130M+ DOIs), Europe PMC (life sciences)
- **Economic**: World Bank (1400+ indicators), Eurostat (EU-27), OECD (38 countries), ILO (labor stats)
- **News**: GDELT (global news monitoring, 100+ languages)

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

## 📄 License

MIT License - see individual server README files for detailed API documentation.

## 🔮 Roadmap

### v1.1 (Planned)
- OECD SDMX full implementation  
- ILO SDMX updated endpoints
- Environment MCP (OpenAQ air quality)
- Health MCP (WHO GHO indicators)
- Trade MCP (UN Comtrade with API keys)

### v2.0 (Future)
- NUTS/SCB regional coding
- MCPB packaging support  
- Advanced caching with SQLite
- WebSocket streaming for real-time data