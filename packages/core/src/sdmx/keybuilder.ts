import type { SdmxDimension, SdmxDimensionValue } from './parse-json.js';

export interface DimensionCode {
  id: string;
  name?: string;
  description?: string;
}

export interface DimensionTemplateInfo {
  id: string;
  position: number;
  codelist?: {
    id: string;
    agencyId?: string;
    version?: string;
    codes: DimensionCode[];
  };
}

export interface BuildKeyOptions {
  template: string;
  values: Record<string, string | undefined>;
  dimensionMap?: Record<string, string>;
  dimensions?: Map<string, DimensionTemplateInfo>;
  strict?: boolean;
}

export interface BuildKeyResult {
  key: string;
  missing: string[];
  invalid: string[];
}

export function parseCodelistUrn(urn?: string): { id: string; agencyId?: string; version?: string } | undefined {
  if (!urn) return undefined;
  const match = urn.match(/=([^:]+):([^\(]+)(?:\(([^\)]+)\))?$/);
  if (!match) return undefined;
  const [, agencyId, id, version] = match;
  return { id, agencyId, version };
}

export function buildDimensionMapFromDatastructure(dsd: any): Map<string, DimensionTemplateInfo> {
  const dimensionList = dsd?.data?.dataStructures?.[0]?.dataStructureComponents?.dimensionList?.dimensions;
  if (!Array.isArray(dimensionList)) {
    return new Map();
  }

  const codelists = dsd?.data?.codelists || [];
  const codelistIndex = new Map<string, any>();

  for (const list of codelists) {
    const key = buildCodelistKey(list.agencyID, list.id);
    codelistIndex.set(key, list);
  }

  const map = new Map<string, DimensionTemplateInfo>();

  dimensionList.forEach((dimension: any, position: number) => {
    const enumeration = parseCodelistUrn(dimension?.localRepresentation?.enumeration);
    let codelist;

    if (enumeration) {
      const key = buildCodelistKey(enumeration.agencyId, enumeration.id);
      const found = codelistIndex.get(key);
      if (found) {
        codelist = {
          id: found.id,
          agencyId: found.agencyID,
          version: found.version,
          codes: extractCodes(found.codes)
        };
      }
    }

    map.set(dimension.id, {
      id: dimension.id,
      position,
      codelist
    });
  });

  return map;
}

function extractCodes(values: any[]): DimensionCode[] {
  if (!Array.isArray(values)) return [];
  return values.map(value => ({
    id: value.id,
    name: value.name ?? value.names?.en,
    description: value.description ?? value.descriptions?.en
  }));
}

function buildCodelistKey(agencyId?: string, id?: string): string {
  return `${agencyId || 'default'}:${id || ''}`;
}

export function buildKeyFromTemplate(options: BuildKeyOptions): BuildKeyResult {
  const { template, values, dimensionMap = {}, strict = false } = options;
  const dimensionInfo = options.dimensions || new Map<string, DimensionTemplateInfo>();
  const missing: string[] = [];
  const invalid: string[] = [];

  const resolved = template.replace(/\{([^}]+)\}/g, (_, placeholder: string) => {
    const value = values[placeholder];
    if (!value) {
      missing.push(placeholder);
      return '';
    }

    const dimensionId = dimensionMap[placeholder] || placeholder;
    const dimension = dimensionInfo.get(dimensionId);

    if (dimension?.codelist) {
      const allowed = new Set(dimension.codelist.codes.map(code => code.id));
      if (!allowed.has(value)) {
        invalid.push(placeholder);
        if (strict) {
          return '';
        }
      }
    }

    return value;
  });

  const key = resolved
    .replace(/\.\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');

  return { key, missing, invalid };
}

export function dimensionMapFromParseResult(dimensions: SdmxDimension[]): Map<string, DimensionTemplateInfo> {
  const map = new Map<string, DimensionTemplateInfo>();
  dimensions.forEach((dimension, index) => {
    map.set(dimension.id, {
      id: dimension.id,
      position: index,
      codelist: {
        id: dimension.id,
        codes: dimension.values as SdmxDimensionValue[]
      }
    });
  });
  return map;
}
