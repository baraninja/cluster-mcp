# News MCP Server

MCP server providing access to global news data via GDELT DOC 2.0 for real-time news monitoring and analysis.

## Tools

### search_news
Search global news articles across 100+ languages and thousands of sources.

**Input:**
```json
{
  "q": "municipal AI policy Sweden",
  "max": 100
}
```

**Output:**
```json
{
  "query": "municipal AI policy Sweden",
  "count": 87,
  "maxRequested": 100,
  "articles": [
    {
      "title": "Swedish Municipalities Lead AI Adoption in Public Services",
      "url": "https://example.com/news/swedish-ai-municipalities",
      "date": "20240115120000",
      "source": "thelocal.se",
      "language": "English", 
      "tone": "4.25"
    },
    {
      "title": "Stockholm Tests AI-Powered Citizen Services",
      "url": "https://example.com/stockholm-ai-services", 
      "date": "20240114180000",
      "source": "sverigesradio.se",
      "language": "Swedish",
      "tone": "2.85"
    }
  ],
  "retrievedAt": "2024-01-15T10:30:00.000Z"
}
```

### timeline
Generate temporal analysis of news coverage for a topic.

**Input:**
```json
{
  "q": "climate change adaptation",
  "mode": "timelinevolraw"
}
```

**Output:**
```json
{
  "query": "climate change adaptation",
  "timeline": {
    "mode": "Volume Timeline",
    "description": "Number of articles over time", 
    "data": [
      {
        "date": "2024-01-01T00:00:00Z",
        "value": 145
      },
      {
        "date": "2024-01-02T00:00:00Z", 
        "value": 203
      },
      {
        "date": "2024-01-03T00:00:00Z",
        "value": 89
      }
    ]
  },
  "totalDataPoints": 365,
  "retrievedAt": "2024-01-15T10:30:00.000Z"
}
```

**Timeline Modes:**
- `timelinevolraw`: Article volume over time
- `timelinelang`: Article count by language over time

### fetch_article
Retrieve the full content of a specific article discovered in search results.

**Input:**
```json
{
  "url": "https://example.com/news/election-2024-analysis",
  "maxChars": 12000
}
```

**Output:**
```json
{
  "url": "https://example.com/news/election-2024-analysis",
  "title": "Election 2024: Key Trends",
  "content": "Election coverage kicked into high gear today as...",
  "contentType": "text/html; charset=utf-8",
  "originalLength": 18754,
  "truncated": true,
  "maxChars": 12000,
  "retrievedAt": "2024-01-15T10:45:00.000Z"
}
```

### fetch_multiple
Batch fetch up to five articles in a single call with per-article truncation.

**Input:**
```json
{
  "urls": [
    "https://example.com/news/electric-vehicles-europe",
    "https://example.com/news/electric-vehicles-us"
  ],
  "maxCharsPerArticle": 6000
}
```

**Output:**
```json
{
  "count": 2,
  "maxCharsPerArticle": 6000,
  "results": [
    {
      "url": "https://example.com/news/electric-vehicles-europe",
      "title": "Europe Accelerates EV Adoption",
      "content": "European registrations of electric vehicles climbed...",
      "contentType": "text/html; charset=utf-8",
      "originalLength": 9210,
      "truncated": true,
      "maxChars": 6000,
      "retrievedAt": "2024-01-15T10:45:00.000Z"
    },
    {
      "url": "https://example.com/news/electric-vehicles-us",
      "error": "404 Not Found"
    }
  ],
  "retrievedAt": "2024-01-15T10:45:00.000Z"
}
```

## GDELT DOC 2.0 Data Source

### Coverage
- **Sources**: Global news monitoring of print, broadcast, and web
- **Languages**: 100+ languages with real-time translation
- **Geography**: Worldwide coverage with location extraction  
- **Update Frequency**: Real-time (15-minute intervals)
- **Historical Data**: Back to 2015 for web articles

### Capabilities
- **Full-Text Search**: Query article content, not just headlines
- **Sentiment Analysis**: Tone scoring from -10 (negative) to +10 (positive)
- **Geographic Tagging**: Articles tagged with mentioned locations
- **Source Diversity**: Major outlets, regional papers, blogs, broadcasts
- **Multi-Language**: Native search across languages

### API Features
- **Format Options**: JSON, JSONP supported
- **Sorting**: Date, relevance, tone, source
- **Filtering**: Time ranges, languages, sources, locations
- **Rate Limits**: Generous free tier (no key required)

## Use Cases

### 1. Topic Monitoring
Track mentions of specific topics, organizations, or events across global media.

```javascript
// Monitor EU AI regulation coverage
const aiNews = await searchNews({
  q: "EU AI Act artificial intelligence regulation",
  max: 200
});

// Get timeline of coverage
const aiTimeline = await timeline({
  q: "EU AI Act", 
  mode: "timelinevolraw"
});
```

### 2. Crisis Response
Monitor breaking news and emerging situations.

```javascript
// Track natural disaster coverage  
const disasterNews = await searchNews({
  q: "earthquake tsunami emergency response",
  max: 100
});
```

### 3. Market Intelligence
Monitor industry news and competitive landscape.

```javascript
// Track tech industry developments
const techNews = await searchNews({
  q: "startup funding venture capital AI",
  max: 150  
});
```

### 4. Academic Research
Study media coverage patterns and narrative evolution.

```javascript
// Research climate change communication
const climateTimeline = await timeline({
  q: "climate change global warming",
  mode: "timelinelang" 
});
```

### 5. Public Policy Analysis
Track policy discussions and public debate.

```javascript
// Monitor healthcare policy debates
const healthPolicy = await searchNews({
  q: "healthcare reform universal coverage",
  max: 100
});
```

## Data Fields Explained

### Article Fields
- **title**: Article headline
- **url**: Direct link to full article
- **date**: Publication timestamp (YYYYMMDDHHMMSS format)
- **source**: Domain/source identifier  
- **language**: Detected language
- **tone**: Sentiment score (-10 to +10, average ~0)

### Timeline Data
- **date**: Time point (varies by aggregation)
- **value**: Article count or other metric
- **language**: Language breakdown (for `timelinelang` mode)

## Query Tips

### Effective Search Strategies
- **Use specific terms**: "artificial intelligence" vs "AI"
- **Combine keywords**: "climate AND adaptation AND cities"
- **Location targeting**: Add geographic terms for regional focus
- **Time sensitivity**: Recent events have better coverage

### Query Examples
- `"net zero emissions" corporate sustainability` - Corporate climate commitments
- `municipal digital transformation smart city` - Smart city initiatives  
- `supply chain disruption logistics` - Supply chain issues
- `renewable energy transition policy` - Energy transition coverage

## Rate Limiting & Caching

### Performance Characteristics
- **Response Time**: Typically 2-5 seconds for search queries
- **Cache TTL**: 6 hours for news data (balances freshness vs performance)  
- **Retry Logic**: 3 attempts with exponential backoff
- **Timeout**: 30 seconds per request

### Best Practices
- Cache results for repeated queries
- Use appropriate `max` values (10-250 articles)
- Consider time zones when analyzing temporal patterns
- Monitor tone trends rather than absolute values

## Limitations

### Content Availability  
- Not all articles provide full text access
- Some sources may be behind paywalls
- Archive depth varies by source

### Language & Geography
- English-language sources have best coverage
- Developed countries have more comprehensive monitoring
- Local news may be underrepresented

### Data Quality
- Automated processing may miss context
- Tone analysis is algorithmic, not human-verified
- Duplicate detection across sources is imperfect

## Error Handling

Common error scenarios and responses:

```json
{
  "content": [
    {
      "type": "text",
      "text": "No articles found for query: very-specific-nonexistent-term"
    }
  ]
}
```

### Troubleshooting
- **No results**: Try broader search terms
- **Timeout errors**: Reduce `max` parameter or retry
- **Empty timeline**: Check query spelling and date ranges  

## Integration Examples

### With Research MCP
Combine news monitoring with academic literature:

```javascript
// Find news about a research topic
const news = await searchNews({ q: "CRISPR gene editing ethics" });

// Search related academic papers  
const papers = await searchPapers({ q: "CRISPR ethics bioethics" });
```

### With Socioeconomy MCP  
Connect news trends with economic indicators:

```javascript
// Monitor employment news
const jobsNews = await searchNews({ q: "unemployment job losses layoffs" });

// Get actual unemployment data
const unemployment = await getSeries({ 
  semanticId: "unemployment_rate", 
  geo: "US" 
});
```
