import { parseSdmxJson, sdmxJsonToSeries as toSeries } from '../sdmx/parse-json.js';

export function sdmxJsonToObs(data: any) {
  const parsed = parseSdmxJson(data);
  const rows = parsed.observations.map(obs => {
    const row: Record<string, unknown> = {
      ...obs.dimensions,
      value: obs.value
    };

    if (Object.keys(obs.attributes).length) {
      row.attributes = obs.attributes;
    }

    return row;
  });

  return {
    dimensionIds: parsed.dimensions.map(dimension => dimension.id),
    rows
  };
}

export function sdmxJsonToSeries(
  data: any,
  timeDim = 'TIME_PERIOD',
  geoDim = 'REF_AREA'
): { time: string; value: number; geo?: string }[] {
  const series = toSeries(data, { timeDimensionId: timeDim, geoDimensionId: geoDim });
  return series.map(({ time, value, geo }) => ({ time, value, geo }));
}
