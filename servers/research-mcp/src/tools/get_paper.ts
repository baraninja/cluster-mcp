import { z } from 'zod';
import { getWorkByDOI } from '../providers/openalex.js';
import { getCrossrefWork, enrichWorkWithCrossref } from '../providers/crossref.js';
import { findByDOI, enrichWorkWithEuropePmc } from '../providers/europepmc.js';

export const getPaperSchema = z.object({
  doi: z.string().min(1).describe('DOI of the paper to retrieve')
});

export type GetPaperParams = z.infer<typeof getPaperSchema>;

export async function getPaper(params: GetPaperParams, contactEmail?: string) {
  const { doi } = params;
  
  try {
    const [openalexWork, crossrefWork, pmcData] = await Promise.allSettled([
      getWorkByDOI(doi, contactEmail),
      getCrossrefWork(doi, contactEmail),
      findByDOI(doi)
    ]);
    
    let work = openalexWork.status === 'fulfilled' ? openalexWork.value : null;
    
    if (!work) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No paper found for DOI: ${doi}`
          }
        ]
      };
    }
    
    if (work && crossrefWork.status === 'fulfilled' && crossrefWork.value) {
      work = enrichWorkWithCrossref(work, crossrefWork.value);
    }
    
    if (work && pmcData.status === 'fulfilled' && pmcData.value) {
      work = enrichWorkWithEuropePmc(work, pmcData.value);
    }
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            doi,
            paper: work ? {
              id: work.id,
              title: work.title,
              authors: work.authors,
              year: work.publicationYear,
              venue: work.venue,
              abstract: work.abstract ? work.abstract.slice(0, 500) + '...' : undefined,
              citedByCount: work.citedByCount,
              oaStatus: work.oaStatus,
              external: work.external,
              retrievedAt: new Date().toISOString()
            } : null
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error retrieving paper: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ]
    };
  }
}