import { getWithRetry, getJSON } from '@cluster-mcp/core';

const BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

export async function findByDOI(doi: string) {
  const url = `${BASE}/search?query=${encodeURIComponent(`DOI:${doi}`)}&format=json`;
  
  try {
    const { json } = await getWithRetry(() => getJSON(url));
    const hit = (json as any)?.resultList?.result?.[0];
    
    if (!hit) return null;
    
    const pmcid = hit.pmcid;
    const fullTextXmlUrl = pmcid ? `${BASE}/${pmcid}/fullTextXML` : undefined;
    
    return {
      id: hit.id,
      source: hit.source,
      pmcid,
      fullTextXmlUrl,
      title: hit.title,
      pubYear: hit.pubYear ? Number(hit.pubYear) : undefined,
      authors: hit.authorString,
      doi: hit.doi
    };
  } catch (error) {
    console.error(`Europe PMC error for DOI ${doi}:`, error);
    return null;
  }
}

export function enrichWorkWithEuropePmc(work: any, pmcData: any) {
  if (!pmcData) return work;
  
  const enriched = { ...work };
  
  if (!enriched.external) enriched.external = {};
  enriched.external.europepmc = `${BASE}/search?query=DOI:${work.doi}`;
  
  if (pmcData.fullTextXmlUrl) {
    enriched.external.pdf = pmcData.fullTextXmlUrl;
  }
  
  return enriched;
}