import { z } from 'zod';
import { getHsChapters } from '../comtrade_catalog.js';

export const listHsChaptersSchema = z.object({
  section: z.string().optional()
    .describe('Filter by HS section (1-21) or section name keyword. Sections group related chapters.')
});

export type ListHsChaptersParams = z.infer<typeof listHsChaptersSchema>;

// HS Sections (groupings of chapters)
const HS_SECTIONS: Array<{ section: string; name: string; chapters: string }> = [
  { section: '1', name: 'Live animals; animal products', chapters: '01-05' },
  { section: '2', name: 'Vegetable products', chapters: '06-14' },
  { section: '3', name: 'Animal or vegetable fats and oils', chapters: '15' },
  { section: '4', name: 'Foodstuffs; beverages, spirits, tobacco', chapters: '16-24' },
  { section: '5', name: 'Mineral products', chapters: '25-27' },
  { section: '6', name: 'Chemicals and allied industries', chapters: '28-38' },
  { section: '7', name: 'Plastics and rubber', chapters: '39-40' },
  { section: '8', name: 'Raw hides, skins, leather, furskins', chapters: '41-43' },
  { section: '9', name: 'Wood, cork, straw, plaiting materials', chapters: '44-46' },
  { section: '10', name: 'Pulp, paper, paperboard', chapters: '47-49' },
  { section: '11', name: 'Textiles and textile articles', chapters: '50-63' },
  { section: '12', name: 'Footwear, headgear, umbrellas', chapters: '64-67' },
  { section: '13', name: 'Stone, plaster, cement, ceramics, glass', chapters: '68-70' },
  { section: '14', name: 'Pearls, precious stones, metals, jewelry', chapters: '71' },
  { section: '15', name: 'Base metals and articles thereof', chapters: '72-83' },
  { section: '16', name: 'Machinery and mechanical appliances; electrical equipment', chapters: '84-85' },
  { section: '17', name: 'Vehicles, aircraft, vessels', chapters: '86-89' },
  { section: '18', name: 'Optical, photographic, medical instruments', chapters: '90-92' },
  { section: '19', name: 'Arms and ammunition', chapters: '93' },
  { section: '20', name: 'Miscellaneous manufactured articles', chapters: '94-96' },
  { section: '21', name: 'Works of art, antiques', chapters: '97' }
];

export async function listHsChapters(params: ListHsChaptersParams) {
  const chapters = await getHsChapters();

  let filteredChapters = chapters;
  let matchedSection: typeof HS_SECTIONS[0] | undefined;

  if (params.section) {
    const sectionQuery = params.section.toLowerCase().trim();

    // Try to match by section number
    const sectionNum = parseInt(sectionQuery, 10);
    if (!isNaN(sectionNum) && sectionNum >= 1 && sectionNum <= 21) {
      matchedSection = HS_SECTIONS[sectionNum - 1];
    } else {
      // Try to match by section name keyword
      matchedSection = HS_SECTIONS.find(s =>
        s.name.toLowerCase().includes(sectionQuery)
      );
    }

    if (matchedSection) {
      // Parse chapter range
      const range = matchedSection.chapters;
      const [start, end] = range.includes('-')
        ? range.split('-').map(s => parseInt(s, 10))
        : [parseInt(range, 10), parseInt(range, 10)];

      filteredChapters = chapters.filter(ch => {
        const chNum = parseInt(ch.code, 10);
        return chNum >= start && chNum <= end;
      });
    }
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          description: 'HS (Harmonized System) chapters are 2-digit codes organizing traded goods into 99 categories',
          sections: params.section ? undefined : HS_SECTIONS,
          filter: matchedSection ? {
            section: matchedSection.section,
            name: matchedSection.name,
            chapterRange: matchedSection.chapters
          } : undefined,
          count: filteredChapters.length,
          chapters: filteredChapters.map(ch => ({
            code: ch.code,
            description: ch.description
          }))
        }, null, 2)
      }
    ]
  };
}
