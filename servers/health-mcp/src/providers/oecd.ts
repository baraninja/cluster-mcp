import {
  SdmxClient,
  sdmxSeries,
  mapRegionCode,
  parseStructureUrn,
  parseCodelistUrn,
  type Series
} from '@cluster-mcp/core';
import type { GetSeriesParams } from '../tools/get_series.js';

const CLIENT = new SdmxClient({
  baseUrl: 'https://sdmx.oecd.org/public/rest/'
});

type DimensionCode = { id: string; name?: string };
const flowDimensionCache = new Map<string, Map<string, DimensionCode[]>>();
const flowFetchPromises = new Map<string, Promise<void>>();

export interface OecdMapping {
  flow: string;
  keyTemplate: string;
  placeholders?: Record<string, string>;
}

export async function getOecdHealthSeries(
  mapping: OecdMapping,
  params: GetSeriesParams,
  unitHint?: string
): Promise<Series | null> {
  const iso3 = mapRegionCode(params.geo ?? 'SE', 'ISO3');
  if (!iso3) {
    throw new Error(`Unable to map geo code ${params.geo ?? 'SE'} to ISO3 for OECD request`);
  }

  const replacements: Record<string, string> = {
    LOCATION: iso3,
    ...(mapping.placeholders || {})
  };

  if (params.dim1) {
    replacements.DIM1 = params.dim1;
  }

  const key = fillTemplate(mapping.keyTemplate, replacements);
  await ensureFlowStructure(mapping.flow);
  const response = await CLIENT.getData(mapping.flow, key, {
    startPeriod: params.years ? String(params.years[0]) : undefined,
    endPeriod: params.years ? String(params.years[1]) : undefined,
    dimensionAtObservation: 'AllDimensions',
    format: 'jsondata'
  });

  const seriesPoints = sdmxSeries(response.data, {
    timeDimensionId: 'TIME_PERIOD',
    geoDimensionId: 'REF_AREA'
  });

  const values = seriesPoints
    .filter((point) => Number.isFinite(point.value))
    .map((point) => ({
      time: point.time,
      value: Number(point.value),
      geo: point.geo
    }));

  if (values.length === 0) {
    return null;
  }

  return {
    semanticId: params.semanticId,
    unit: unitHint ?? 'unknown',
    freq: 'A',
    values,
    source: {
      name: 'oecd',
      id: `${mapping.flow}/${key}`,
      url: response.url
    },
    retrievedAt: new Date().toISOString()
  };
}

function fillTemplate(template: string, replacements: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, placeholder: string) => {
    const key = placeholder.trim();
    return replacements[key] ?? '';
  });
}

export async function listOecdDimensionCodes(
  flowId: string,
  dimensionId: string
): Promise<DimensionCode[]> {
  await ensureFlowStructure(flowId);
  const flowMap = flowDimensionCache.get(flowId);
  return flowMap?.get(dimensionId.toUpperCase()) ?? [];
}

async function ensureFlowStructure(flowId: string): Promise<void> {
  if (flowDimensionCache.has(flowId)) {
    return;
  }
  if (flowFetchPromises.has(flowId)) {
    return flowFetchPromises.get(flowId)!;
  }

  const promise = (async () => {
    const dataflows = await CLIENT.getDataflows();
    const flowEntry = (dataflows.data?.dataflows ?? []).find((flow: any) => flow.id === flowId);
    if (!flowEntry?.structure) {
      throw new Error(`OECD flow ${flowId} missing structure metadata`);
    }

    const structureUrn = flowEntry.structure;
    const structureInfo = parseStructureUrn(structureUrn);
    if (!structureInfo) {
      throw new Error(`Unable to parse structure URN for flow ${flowId}`);
    }

    const datastructure = await CLIENT.getDatastructure(
      structureInfo.agencyId,
      structureInfo.id,
      structureInfo.version,
      { references: 'descendants' }
    );

    const dimensionMap = new Map<string, DimensionCode[]>();
    const dimensions: any[] = datastructure.data?.dataStructures?.[0]?.dataStructureComponents?.dimensionList?.dimensions ?? [];
    const codelists: any[] = datastructure.data?.codelists ?? [];
    const codelistIndex = new Map<string, any>();
    for (const codelist of codelists) {
      const key = `${codelist.agencyID ?? 'default'}:${codelist.id}`;
      codelistIndex.set(key, codelist);
    }

    for (const dimension of dimensions) {
      const values: DimensionCode[] = [];
      const enumeration = parseCodelistUrn(dimension?.localRepresentation?.enumeration);
      if (enumeration) {
        const codelistKey = `${enumeration.agencyId ?? 'default'}:${enumeration.id}`;
        const codelist = codelistIndex.get(codelistKey);
        if (codelist?.codes) {
          for (const code of codelist.codes) {
            values.push({ id: code.id, name: code.name ?? code.names?.en });
          }
        }
      }

      if (!values.length && Array.isArray(dimension.values)) {
        for (const code of dimension.values) {
          values.push({ id: code.id, name: code.name ?? code.names?.en });
        }
      }

      if (values.length) {
        dimensionMap.set(String(dimension.id).toUpperCase(), values);
      }
    }

    flowDimensionCache.set(flowId, dimensionMap);
    flowFetchPromises.delete(flowId);
  })();

  flowFetchPromises.set(flowId, promise);
  await promise;
}
