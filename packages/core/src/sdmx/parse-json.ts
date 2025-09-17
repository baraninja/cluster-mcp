export interface SdmxDimensionValue {
  id: string;
  name?: string;
  description?: string;
}

export interface SdmxDimension {
  id: string;
  role?: string;
  position: number;
  values: SdmxDimensionValue[];
}

export interface SdmxObservation {
  value: number;
  dimensions: Record<string, string>;
  attributes: Record<string, string | number | null>;
  time?: string;
  geo?: string;
}

export interface SdmxParseResult {
  dimensions: SdmxDimension[];
  attributes: string[];
  observations: SdmxObservation[];
  timeDimensionId?: string;
  geoDimensionId?: string;
}

function normaliseValues(values: any[]): SdmxDimensionValue[] {
  return (values || []).map(value => ({
    id: value.id ?? value.key ?? String(value),
    name: value.name ?? value.names?.en,
    description: value.description ?? value.descriptions?.en
  }));
}

function resolveRoleId(dimension: any): string | undefined {
  if (!dimension) return undefined;
  if (typeof dimension.role === 'string') return dimension.role;
  if (dimension.role && typeof dimension.role === 'object') {
    const roleEntries = Object.values(dimension.role);
    if (roleEntries.length && typeof roleEntries[0] === 'string') {
      return roleEntries[0] as string;
    }
  }
  return undefined;
}

function inferTimeDimensionId(dimensions: SdmxDimension[]): string | undefined {
  const direct = dimensions.find(dim => dim.id?.toUpperCase() === 'TIME_PERIOD');
  if (direct) return direct.id;
  const byRole = dimensions.find(dim => resolveRoleId(dim)?.toUpperCase() === 'TIME_PERIOD');
  if (byRole) return byRole.id;
  return dimensions[dimensions.length - 1]?.id;
}

function inferGeoDimensionId(dimensions: SdmxDimension[]): string | undefined {
  const candidates = ['REF_AREA', 'LOCATION', 'GEO', 'COUNTRY'];
  for (const id of candidates) {
    const match = dimensions.find(dim => dim.id?.toUpperCase() === id);
    if (match) return match.id;
  }
  const byRole = dimensions.find(dim => resolveRoleId(dim)?.toUpperCase().includes('AREA'));
  return byRole?.id;
}

function parseAttributes(payload: any): string[] {
  const attrs = payload?.structure?.attributes?.observation || [];
  return attrs.map((attr: any) => attr.id).filter(Boolean);
}

function buildAttributeLookup(payload: any): Array<{ id: string; values: SdmxDimensionValue[] }> {
  const attrs = payload?.structure?.attributes?.observation || [];
  return attrs.map((attr: any) => ({
    id: attr.id,
    values: normaliseValues(attr.values || [])
  }));
}

function resolveAttributeValue(def: { id: string; values: SdmxDimensionValue[] }, index: number | null | undefined) {
  if (index == null) return undefined;
  const value = def.values[index];
  if (!value) return String(index);
  return value.id;
}

export function parseSdmxJson(payload: any): SdmxParseResult {
  const dimensionsRaw = payload?.structure?.dimensions?.observation || [];
  const dimensions: SdmxDimension[] = dimensionsRaw.map((dimension: any, position: number) => ({
    id: dimension.id,
    role: resolveRoleId(dimension),
    position,
    values: normaliseValues(dimension.values || [])
  }));

  const timeDimensionId = inferTimeDimensionId(dimensions);
  const geoDimensionId = inferGeoDimensionId(dimensions);

  const observationsMap = payload?.dataSets?.[0]?.observations || {};
  const attributeDefs = buildAttributeLookup(payload);

  const observations: SdmxObservation[] = [];

  for (const [key, observation] of Object.entries(observationsMap)) {
    const indexes = key.split(':').map(Number);
    const dimensionsRecord: Record<string, string> = {};

    dimensions.forEach((dimension, position) => {
      const valueIndex = indexes[position];
      const code = dimension.values[valueIndex];
      if (code) {
        dimensionsRecord[dimension.id] = code.id;
      }
    });

    let value: number | undefined;
    const attrs: Record<string, string | number | null> = {};

    if (Array.isArray(observation)) {
      value = Number(observation[0]);
      const attributeIndexes = observation.slice(1);
      attributeIndexes.forEach((attrIndex, idx) => {
        const def = attributeDefs[idx];
        if (!def) return;
        const attrValue = resolveAttributeValue(def, attrIndex as number | null | undefined);
        if (attrValue !== undefined) {
          attrs[def.id] = attrValue;
        }
      });
    } else if (observation != null) {
      value = Number(observation);
    }

    if (value == null || Number.isNaN(value)) continue;

    const result: SdmxObservation = {
      value,
      dimensions: dimensionsRecord,
      attributes: attrs
    };

    if (timeDimensionId && dimensionsRecord[timeDimensionId]) {
      result.time = dimensionsRecord[timeDimensionId];
    }

    if (geoDimensionId && dimensionsRecord[geoDimensionId]) {
      result.geo = dimensionsRecord[geoDimensionId];
    }

    observations.push(result);
  }

  return {
    dimensions,
    attributes: attributeDefs.map(def => def.id),
    observations,
    timeDimensionId,
    geoDimensionId
  };
}

export interface SdmxSeriesPoint {
  time: string;
  value: number;
  geo?: string;
  attributes?: Record<string, string | number | null>;
  dimensions?: Record<string, string>;
}

export interface ToSeriesOptions {
  timeDimensionId?: string;
  geoDimensionId?: string;
}

export function sdmxJsonToSeries(payload: any, options: ToSeriesOptions = {}): SdmxSeriesPoint[] {
  const parsed = parseSdmxJson(payload);
  const timeDim = options.timeDimensionId || parsed.timeDimensionId;
  const geoDim = options.geoDimensionId || parsed.geoDimensionId;

  return parsed.observations
    .map(obs => {
      const timeValue = obs.time ?? (timeDim ? obs.dimensions[timeDim] : undefined);
      const point: SdmxSeriesPoint = {
        time: timeValue != null ? String(timeValue) : '',
        value: obs.value
      };

      if (geoDim && obs.dimensions[geoDim]) {
        point.geo = obs.dimensions[geoDim];
      } else if (obs.geo) {
        point.geo = obs.geo;
      }

      if (Object.keys(obs.attributes).length) {
        point.attributes = obs.attributes;
      }

      if (Object.keys(obs.dimensions).length) {
        point.dimensions = obs.dimensions;
      }

      return point;
    })
    .filter(point => point.time !== '' && Number.isFinite(point.value));
}
