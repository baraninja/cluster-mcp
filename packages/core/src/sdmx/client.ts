import { buildUserAgent, getJSON, RateLimitInfo } from '../http.js';

const STRUCTURE_ACCEPT = 'application/vnd.sdmx.structure+json;version=1.0.0-wd, application/json;q=0.9';
const DATA_ACCEPT = 'application/vnd.sdmx.data+json;version=1.0.0-wd, application/json;q=0.9';

type HeaderMap = Record<string, string>;

export interface SdmxClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  contactEmail?: string;
  userAgent?: string;
}

export interface SdmxResponse<T> {
  data: T;
  url: string;
  headers: HeaderMap;
  rateLimit?: RateLimitInfo;
}

export interface SdmxDataOptions {
  headers?: Record<string, string>;
  dimensionAtObservation?: string | false;
  format?: string | false;
  startPeriod?: string;
  endPeriod?: string;
  lastNObservations?: number;
  additionalParams?: Record<string, string | number | undefined>;
}

export interface SdmxStructureOptions {
  headers?: Record<string, string>;
  references?: 'none' | 'parents' | 'children' | 'descendants' | 'all';
}

export interface ParsedStructureUrn {
  agencyId: string;
  id: string;
  version?: string;
}

export class SdmxClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(private readonly options: SdmxClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/?$/, '/');
    const userAgent = options.userAgent ?? buildUserAgent(options.contactEmail);
    this.defaultHeaders = {
      'User-Agent': userAgent,
      ...(options.headers || {})
    };
  }

  async getDataflows(options: SdmxStructureOptions = {}): Promise<SdmxResponse<any>> {
    const url = this.buildUrl('dataflow', options.references);
    const { json, headers, rateLimit } = await getJSON(url, {
      ...this.defaultHeaders,
      Accept: STRUCTURE_ACCEPT,
      ...(options.headers || {})
    });

    return { data: json, url, headers, rateLimit };
  }

  async getDatastructure(
    agencyId: string,
    id: string,
    version?: string,
    options: SdmxStructureOptions = {}
  ): Promise<SdmxResponse<any>> {
    const segments = [
      'datastructure',
      encodeURIComponent(agencyId),
      encodeURIComponent(id)
    ];
    if (version) {
      segments.push(encodeURIComponent(version));
    }
    const path = segments.join('/');
    const url = this.buildUrl(path, options.references);

    const { json, headers, rateLimit } = await getJSON(url, {
      ...this.defaultHeaders,
      Accept: STRUCTURE_ACCEPT,
      ...(options.headers || {})
    });

    return { data: json, url, headers, rateLimit };
  }

  async getData(
    flowId: string,
    key: string,
    options: SdmxDataOptions = {}
  ): Promise<SdmxResponse<any>> {
    const safeFlow = encodeURIComponent(flowId);
    const safeKey = encodeURIComponent(key);
    const path = `data/${safeFlow}/${safeKey}`;
    const url = this.buildUrl(path);

    const searchParams = new URLSearchParams();

    const format = options.format === false ? undefined : options.format || 'jsondata';
    if (format) searchParams.set('format', format);

    const dimension = options.dimensionAtObservation === false
      ? undefined
      : options.dimensionAtObservation || 'AllDimensions';
    if (dimension) searchParams.set('dimensionAtObservation', dimension);

    if (options.startPeriod) searchParams.set('startPeriod', options.startPeriod);
    if (options.endPeriod) searchParams.set('endPeriod', options.endPeriod);
    if (options.lastNObservations !== undefined) {
      searchParams.set('lastNObservations', String(options.lastNObservations));
    }

    for (const [keyName, value] of Object.entries(options.additionalParams || {})) {
      if (value === undefined) continue;
      searchParams.set(keyName, String(value));
    }

    const fullUrl = searchParams.toString() ? `${url}?${searchParams.toString()}` : url;
    const { json, headers, rateLimit } = await getJSON(fullUrl, {
      ...this.defaultHeaders,
      Accept: DATA_ACCEPT,
      ...(options.headers || {})
    });

    return { data: json, url: fullUrl, headers, rateLimit };
  }

  private buildUrl(path: string, references?: SdmxStructureOptions['references']): string {
    const clean = path.replace(/^\/+/, '');
    const url = new URL(`./${clean}`, this.baseUrl);
    if (references && references !== 'none') {
      url.searchParams.set('references', references);
    }
    return url.toString();
  }
}

export function parseStructureUrn(urn: string): ParsedStructureUrn | undefined {
  if (!urn) return undefined;
  const match = urn.match(/=([^:]+):([^\(]+)(?:\(([^\)]+)\))?$/);
  if (!match) return undefined;
  const [, agencyId, id, version] = match;
  return {
    agencyId,
    id,
    version
  };
}
