import {
  getJSON,
  getWithRetry,
  mapRegionCode,
  extractRateLimit,
  type RateLimitInfo
} from '@cluster-mcp/core';
import type { GetTradeMatrixParams } from '../tools/get_trade_matrix.js';
import type { SearchHsCodeParams } from '../tools/search_hs_code.js';
import { searchHsCatalog } from '../comtrade_catalog.js';

const LEGACY_BASE = 'https://comtrade.un.org/api/get';
const DEFAULT_APIM_BASE = (process.env.COMTRADE_BASE_URL || 'https://comtradeapi.un.org/ga/').replace(/\/+$/, '/');
const APIM_KEY_HEADER = 'Ocp-Apim-Subscription-Key';

const KEYWORD_PRESETS: Record<string, HsCodeResult[]> = {
  coffee: [
    { code: '0901', description: 'Coffee, whether or not roasted or decaffeinated' },
    { code: '2101', description: 'Extracts, essences and concentrates of coffee' }
  ],
  wheat: [
    { code: '1001', description: 'Wheat and meslin' }
  ],
  steel: [
    { code: '7208', description: 'Flat-rolled products of iron or non-alloy steel, hot-rolled' },
    { code: '7207', description: 'Semi-finished products of iron or non-alloy steel' }
  ],
  electronics: [
    { code: '8542', description: 'Electronic integrated circuits' },
    { code: '8471', description: 'Automatic data-processing machines and units thereof' }
  ],
  automobiles: [
    { code: '8703', description: 'Motor cars and other motor vehicles principally designed for transport of persons' },
    { code: '8704', description: 'Motor vehicles for the transport of goods' }
  ],
  pharmaceuticals: [
    { code: '3004', description: 'Medicaments consisting of mixed or unmixed products for therapeutic uses' },
    { code: '3003', description: 'Medicaments consisting of mixed or unmixed products without dosage' }
  ],
  textiles: [
    { code: '6203', description: 'Men’s or boys’ suits, ensembles, jackets, trousers' },
    { code: '6109', description: 'T-shirts, singlets and other vests, knitted or crocheted' }
  ],
  oil: [
    { code: '2709', description: 'Crude oil' },
    { code: '2710', description: 'Petroleum oils and oils obtained from bituminous minerals' }
  ],
  machinery: [
    { code: '8479', description: 'Machines and mechanical appliances having individual functions' },
    { code: '8421', description: 'Centrifuges, filtering or purifying machinery and apparatus' }
  ],
  chemicals: [
    { code: '2901', description: 'Acyclic hydrocarbons' },
    { code: '2933', description: 'Heterocyclic compounds with nitrogen hetero-atom(s) only' }
  ],
  plastic: [
    { code: '3901', description: 'Polymers of ethylene, in primary forms' },
    { code: '3920', description: 'Plates, sheets, film, foil and strip, of plastics, non-cellular and not reinforced' }
  ],
  plastics: [
    { code: '3902', description: 'Polymers of propylene or of other olefins, in primary forms' },
    { code: '3921', description: 'Other plates, sheets, film, foil and strip, of plastics' }
  ],
  metals: [
    { code: '7206', description: 'Iron and non-alloy steel in ingots or other primary forms' },
    { code: '7403', description: 'Refined copper and copper alloys, unwrought' }
  ],
  furniture: [
    { code: '9403', description: 'Other furniture and parts thereof' },
    { code: '9401', description: 'Seats (other than barber, dental, etc.), and parts thereof' }
  ]
};

export interface HsCodeResult {
  code: string;
  description: string;
  additionalInformation?: string;
}

export interface TradeMatrixResult {
  query: GetTradeMatrixParams;
  rows: unknown[];
  source: 'apim' | 'legacy';
  url: string;
  rateLimit?: RateLimitInfo;
}

export async function searchHsCodes(params: SearchHsCodeParams): Promise<HsCodeResult[]> {
  const query = params.q.trim();
  if (!query) return [];

  const apimResult = await searchApimHsCodes(query, params.year);
  if (apimResult.length) {
    return apimResult;
  }

  const legacyResult = await searchLegacyHsCodes(query);
  if (legacyResult.length) {
    return legacyResult.slice(0, 25);
  }

  const catalogHits = await searchHsCatalog(query, 25);
  if (catalogHits.length) {
    return catalogHits.map((entry) => ({
      code: entry.code,
      description: entry.text
    }));
  }

  const preset = KEYWORD_PRESETS[query.toLowerCase()];
  if (preset) {
    return preset;
  }

  return [];
}

export async function fetchTradeMatrix(params: GetTradeMatrixParams): Promise<TradeMatrixResult | null> {
  const apim = await fetchApimMatrix(params).catch(() => null);
  if (apim && apim.rows.length > 0) {
    return apim;
  }

  return fetchLegacyMatrix(params);
}

async function searchApimHsCodes(query: string, year?: number): Promise<HsCodeResult[]> {
  const apiKey = process.env.COMTRADE_API_KEY;
  if (!apiKey) return [];

  try {
    const params = new URLSearchParams({
      q: query,
      page: '1',
      pageSize: '50'
    });
    if (year) {
      params.set('year', String(year));
    }
    const result = await requestApim('metadata/HS', params);
    const payload = result.json as Record<string, any> | undefined;
    const items = payload ? (payload['data'] ?? payload['results']) : undefined;
    if (!Array.isArray(items)) return [];
    return items.map((item) => ({
      code: item.code ?? item.id ?? item.hsCode ?? '',
      description: item.text ?? item.description ?? item.title ?? '',
      additionalInformation: item.note ?? item.additionalInformation
    })).filter((entry) => entry.code && entry.description);
  } catch (error) {
    console.error('Comtrade APIM HS search failed:', error);
    return [];
  }
}

async function searchLegacyHsCodes(query: string): Promise<HsCodeResult[]> {
  const encoded = encodeURIComponent(query.toLowerCase());
  const url = `https://comtrade.un.org/data/cache/classificationHS.json?q=${encoded}`;
  try {
    const { json } = await getWithRetry(() => getJSON(url));
    const payload = json as Record<string, any> | undefined;
    const dataset = payload ? (payload['results'] ?? payload['data'] ?? []) : [];
    if (!Array.isArray(dataset)) return [];
    return dataset
      .filter((item: any) => typeof item.id === 'string' && typeof item.text === 'string')
      .map((item: any) => ({
        code: item.id,
        description: item.text,
        additionalInformation: item.classId
      }));
  } catch (error) {
    console.error('Comtrade legacy HS search failed:', error);
    return [];
  }
}

async function fetchApimMatrix(params: GetTradeMatrixParams): Promise<TradeMatrixResult | null> {
  const apiKey = process.env.COMTRADE_API_KEY;
  if (!apiKey) return null;

  const search = new URLSearchParams({
    type: 'C',
    freq: params.frequency ?? 'A',
    reporter: params.reporter,
    partner: params.partner ?? 'WLD',
    time: String(params.year),
    flow: params.flow,
    classification: 'HS'
  });
  if (params.hs?.length) {
    search.set('commodities', params.hs.join(','));
  }

  try {
    const result = await requestApim('tradeflow', search);
    const payload = result.json as Record<string, any> | undefined;
    const data = payload ? (payload['data'] ?? payload['results'] ?? []) : [];
    const rows = Array.isArray(data) ? data : [];
    return {
      query: params,
      rows,
      source: 'apim',
      url: result.url,
      rateLimit: result.rateLimit
    };
  } catch (error) {
    console.error('Comtrade APIM matrix failed:', error);
    return null;
  }
}

async function fetchLegacyMatrix(params: GetTradeMatrixParams): Promise<TradeMatrixResult | null> {
  const reporterCode = mapRegionCode(params.reporter, 'M49');
  if (!reporterCode) {
    throw new Error(`Unable to map reporter ${params.reporter} to M49 code`);
  }

  const partnerCode = params.partner ? mapRegionCode(params.partner, 'M49') : '0';
  if (params.partner && !partnerCode) {
    throw new Error(`Unable to map partner ${params.partner} to M49 code`);
  }

  const flowCode = mapFlow(params.flow);
  const search = new URLSearchParams({
    max: '50000',
    type: 'C',
    freq: params.frequency ?? 'A',
    px: 'HS',
    ps: String(params.year),
    r: reporterCode,
    rg: String(flowCode),
    p: partnerCode ?? '0',
    cc: params.hs?.length ? params.hs.join(',') : 'TOTAL'
  });

  const url = `${LEGACY_BASE}?${search.toString()}`;
  const { json, rateLimit } = await getWithRetry(() => getJSON(url));
  if (!Array.isArray(json) || json.length < 2) {
    return null;
  }

  const rows = json[1] ?? [];
  return {
    query: params,
    rows,
    source: 'legacy',
    url,
    rateLimit
  };
}

interface ApimRequestResult {
  json: any;
  url: string;
  rateLimit?: RateLimitInfo;
}

async function requestApim(path: string, params?: URLSearchParams): Promise<ApimRequestResult> {
  const apiKey = process.env.COMTRADE_API_KEY;
  if (!apiKey) {
    throw new Error('COMTRADE_API_KEY is not set');
  }

  const base = DEFAULT_APIM_BASE;
  const url = new URL(path.replace(/^\/+/, ''), base);
  if (params) {
    for (const [key, value] of params.entries()) {
      url.searchParams.set(key, value);
    }
  }

  const headers = {
    Accept: 'application/json',
    [APIM_KEY_HEADER]: apiKey
  } as Record<string, string>;

  const { json, headers: responseHeaders, rateLimit } = await getWithRetry(() => getJSON(url.toString(), headers));
  return {
    json,
    url: url.toString(),
    rateLimit: rateLimit ?? extractRateLimit(responseHeaders)
  };
}

function mapFlow(flow: GetTradeMatrixParams['flow']): number {
  switch (flow) {
    case 'imports':
      return 1;
    case 'exports':
      return 2;
    case 'reimports':
      return 3;
    case 'reexports':
      return 4;
    default:
      return 2;
  }
}
