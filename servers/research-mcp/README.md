# Research MCP Server

MCP server providing access to academic literature and citation data from OpenAlex, Crossref, and Europe PMC.

## Tools

### search_papers
Search academic papers using OpenAlex's comprehensive database.

**Input:**
```json
{
  "q": "machine learning fairness"
}
```

**Output:**
```json
{
  "query": "machine learning fairness",
  "count": 25,
  "results": [
    {
      "id": "https://openalex.org/W2345678901",
      "doi": "10.1145/3292500.3330691",
      "title": "Fairness and machine learning: Limitations and opportunities",
      "authors": "Solon Barocas, Moritz Hardt, Arvind Narayanan",
      "year": 2019,
      "venue": "Communications of the ACM",
      "citedByCount": 1247,
      "oaStatus": "green",
      "url": "https://arxiv.org/pdf/1909.09756.pdf"
    }
  ]
}
```

### get_paper
Get detailed information about a specific paper by DOI, combining data from multiple sources.

**Input:**
```json
{
  "doi": "10.1038/s41586-022-04566-9"
}
```

**Output:**
```json
{
  "doi": "10.1038/s41586-022-04566-9",
  "paper": {
    "id": "https://openalex.org/W4213456789",
    "title": "Language models can explain neurons in language models",
    "authors": [
      {
        "id": "https://openalex.org/A1234567890",
        "name": "Steven Bills"
      }
    ],
    "year": 2022,
    "venue": "Nature",
    "abstract": "Understanding the internal representations of large language models...",
    "citedByCount": 89,
    "oaStatus": "closed",
    "external": {
      "openalex": "https://openalex.org/W4213456789",
      "crossref": "https://api.crossref.org/works/10.1038/s41586-022-04566-9",
      "europepmc": "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1038/s41586-022-04566-9",
      "pdf": "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC8901234/fullTextXML"
    },
    "retrievedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### bibtex_for_doi
Get BibTeX citation format for a DOI using Crossref's content negotiation.

**Input:**
```json
{
  "doi": "10.1038/s41586-022-04566-9"
}
```

**Output:**
```bibtex
@article{Bills_2022,
  title={Language models can explain neurons in language models},
  volume={607},
  ISSN={1476-4687},
  url={http://dx.doi.org/10.1038/s41586-022-04566-9},
  DOI={10.1038/s41586-022-04566-9},
  number={7919},
  journal={Nature},
  publisher={Springer Science and Business Media LLC},
  author={Bills, Steven and Cammarata, Nick and Mossing, Dan and Tillman, Henk and Gao, Leo and Goh, Gabriel and Sutskever, Ilya and Leike, Jan and Wu, Jeff and Saunders, William},
  year={2022},
  month=jul,
  pages={657–663}
}
```

## Data Sources

### OpenAlex
- **Coverage**: 200M+ scholarly works, 50M+ authors, 100K+ venues
- **Rate Limits**: 100,000 requests/day, 10 requests/second  
- **Polite Pool**: Include email in requests for better performance
- **Open Access**: Green/gold OA status and links

### Crossref  
- **Coverage**: 130M+ DOI records across all disciplines
- **Content Negotiation**: BibTeX, JSON, XML formats
- **Polite Pool**: Email in User-Agent for enhanced service

### Europe PMC
- **Coverage**: 37M+ life science publications
- **Full Text**: XML access for PMC articles
- **DOI Lookup**: Links OpenAlex/Crossref to full-text when available

## Environment Variables

- `CONTACT_EMAIL`: Your email for polite pool access (recommended)

## Rate Limiting & Caching

- **Automatic retry**: 3 attempts with exponential backoff
- **Cache TTL**: 24 hours for metadata, 1 hour for search results  
- **Respectful delays**: Built-in rate limiting per provider guidelines

## Example Usage

```javascript
// Search for recent AI safety papers
const papers = await searchPapers({ 
  q: "AI safety alignment" 
});

// Get detailed paper info  
const paper = await getPaper({ 
  doi: papers.results[0].doi 
});

// Generate citation
const citation = await bibtexForDoi({ 
  doi: papers.results[0].doi 
});
```

## Error Handling

The server returns structured error responses:

```json
{
  "content": [
    {
      "type": "text",
      "text": "No paper found for DOI: 10.1234/invalid-doi"
    }
  ],
  "isError": true
}
```

Common error scenarios:
- Invalid or non-existent DOI
- Rate limit exceeded (temporary)
- Network timeouts (auto-retry)
- Malformed search queries