export function sdmxJsonToObs(data: any) {
  const dimensions = data.structure?.dimensions?.observation || [];
  const dimensionIds = dimensions.map((dim: any) => dim.id);
  const codes = dimensions.map((dim: any) => 
    dim.values.map((value: any) => value.id)
  );
  
  const observations = data.dataSets?.[0]?.observations || {};
  const rows: any[] = [];
  
  for (const key in observations) {
    const parts = key.split(':').map(Number);
    const row: any = {};
    
    parts.forEach((part, index) => {
      if (dimensionIds[index] && codes[index] && codes[index][part]) {
        row[dimensionIds[index]] = codes[index][part];
      }
    });
    
    const obsValue = observations[key];
    if (Array.isArray(obsValue) && obsValue.length > 0) {
      row.value = obsValue[0];
    } else {
      row.value = obsValue;
    }
    
    rows.push(row);
  }
  
  return {
    dimensionIds,
    rows
  };
}

export function sdmxJsonToSeries(
  data: any,
  timeDim = 'TIME_PERIOD',
  geoDim = 'REF_AREA'
): { time: string; value: number; geo?: string }[] {
  const { rows } = sdmxJsonToObs(data);
  
  return rows
    .filter(row => row.value != null)
    .map(row => {
      const entry: { time: string; value: number; geo?: string } = {
        time: String(row[timeDim] || row.time || ''),
        value: Number(row.value)
      };
      
      if (row[geoDim]) {
        entry.geo = String(row[geoDim]);
      }
      
      return entry;
    })
    .filter(entry => entry.time && !isNaN(entry.value));
}