import { getText, getJSON, getWithRetry, buildUserAgent } from '@cluster-mcp/core';

export async function getCrossrefWork(doi: string, contactEmail?: string) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const headers = { 'User-Agent': buildUserAgent(contactEmail) };
  
  try {
    const { json } = await getWithRetry(() => getJSON(url, headers));
    return (json as any)?.message;
  } catch (error) {
    console.error(`Crossref error for DOI ${doi}:`, error);
    return null;
  }
}

export async function getBibtex(doi: string, contactEmail?: string): Promise<string | null> {
  const url = `https://doi.org/${encodeURIComponent(doi)}`;
  const headers = { 
    'Accept': 'application/x-bibtex',
    'User-Agent': buildUserAgent(contactEmail)
  };
  
  try {
    const { text } = await getWithRetry(() => getText(url, headers));
    return text.trim();
  } catch (error) {
    console.error(`BibTeX error for DOI ${doi}:`, error);
    return null;
  }
}

export function enrichWorkWithCrossref(openalexWork: any, crossrefWork: any) {
  if (!crossrefWork) return openalexWork;
  
  const enriched = { ...openalexWork };
  
  if (!enriched.external) enriched.external = {};
  enriched.external.crossref = `https://api.crossref.org/works/${openalexWork.doi}`;
  
  if (crossrefWork.abstract && !enriched.abstract) {
    enriched.abstract = crossrefWork.abstract;
  }
  
  if (crossrefWork.subtitle && crossrefWork.subtitle.length > 0) {
    enriched.title = `${enriched.title}: ${crossrefWork.subtitle.join('; ')}`;
  }
  
  return enriched;
}