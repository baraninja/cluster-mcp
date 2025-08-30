export type Freq = 'A' | 'Q' | 'M';
export type ProviderKey = 
  | 'eurostat' 
  | 'oecd' 
  | 'ilostat' 
  | 'wb' 
  | 'openalex' 
  | 'crossref' 
  | 'europepmc' 
  | 'gdelt';

export interface Series {
  semanticId: string;
  unit: string;
  freq: Freq;
  values: { time: string; value: number; geo?: string }[];
  source: { name: ProviderKey; id: string; url: string };
  definition?: string;
  methodNotes?: string;
  retrievedAt: string;
}

export interface Work {
  id: string;
  doi?: string;
  title: string;
  authors?: { id?: string; name: string }[];
  publicationYear?: number;
  venue?: string;
  oaStatus?: string;
  external?: { 
    openalex?: string; 
    crossref?: string; 
    europepmc?: string; 
    pdf?: string 
  };
  citedByCount?: number;
  referencedWorks?: string[];
  abstract?: string;
}

export interface Author {
  id?: string;
  name: string;
  affiliations?: string[];
  orcid?: string;
}

export interface Profile {
  provider: ProviderKey;
  id: string;
  label?: string;
  unit?: string;
  description?: string;
  frequency?: Freq;
  lastUpdated?: string;
  coverage?: {
    timeStart?: string;
    timeEnd?: string;
    geos?: string[];
  };
}

export interface NewsArticle {
  id: string;
  title?: string;
  url?: string;
  date?: string;
  source?: string;
  language?: string;
  tone?: number;
  content?: string;
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number;
  createdAt: number;
}