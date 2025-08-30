import { z } from 'zod';
import { getBibtex } from '../providers/crossref.js';

export const bibtexForDoiSchema = z.object({
  doi: z.string().min(1).describe('DOI to get BibTeX citation for')
});

export type BibtexForDoiParams = z.infer<typeof bibtexForDoiSchema>;

export async function bibtexForDoi(params: BibtexForDoiParams, contactEmail?: string) {
  const { doi } = params;
  
  try {
    const bibtex = await getBibtex(doi, contactEmail);
    
    if (!bibtex) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No BibTeX found for DOI: ${doi}`
          }
        ]
      };
    }
    
    return {
      content: [
        {
          type: 'text' as const,
          text: bibtex
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error retrieving BibTeX: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ]
    };
  }
}