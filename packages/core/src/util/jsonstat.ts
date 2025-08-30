export function jsonstatToSeries(
  data: any,
  timeDim = 'time',
  geoDim = 'geo'
): { time: string; value: number; geo?: string }[] {
  const dataset = data.dataset || data;
  const dimensions = dataset.dimension;
  
  const order: string[] = dataset.id || Object.keys(dimensions);
  const size: number[] = dataset.size || order.map(k => 
    Object.keys(dimensions[k].category.index).length
  );
  
  const labels: Record<string, string[]> = {};
  for (const key of order) {
    const category = dimensions[key].category;
    const ids = Object.keys(category.index)
      .sort((a, b) => category.index[a] - category.index[b]);
    labels[key] = category.label 
      ? ids.map(id => category.label[id] ?? id)
      : ids;
  }
  
  const values = dataset.value;
  const strides = size.map((_, i) => 
    size.slice(i + 1).reduce((a, b) => a * b, 1)
  );
  const total = size.reduce((a, b) => a * b, 1);
  
  const output: { time: string; value: number; geo?: string }[] = [];
  
  for (let pos = 0; pos < total; pos++) {
    const value = values[pos];
    if (value == null) continue;
    
    let remainder = pos;
    const coordinates: Record<string, string> = {};
    
    for (let i = 0; i < size.length; i++) {
      const stride = strides[i] || 1;
      const index = Math.floor(remainder / stride) % size[i];
      const dimension = order[i];
      coordinates[dimension] = labels[dimension][index];
      remainder = remainder % stride;
    }
    
    const entry: { time: string; value: number; geo?: string } = {
      time: String(coordinates[timeDim]),
      value: Number(value)
    };
    
    if (coordinates[geoDim]) {
      entry.geo = coordinates[geoDim];
    }
    
    output.push(entry);
  }
  
  return output;
}