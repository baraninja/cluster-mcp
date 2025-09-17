export type StandardUnit =
  | 'count'
  | 'percent'
  | 'per_1000'
  | 'per_100k'
  | 'per_million'
  | 'ratio'
  | 'index'
  | 'unknown';

const UNIT_ALIASES: Record<string, StandardUnit> = Object.fromEntries([
  ['%', 'percent'],
  ['percent', 'percent'],
  ['per cent', 'percent'],
  ['percentage', 'percent'],
  ['per 1,000', 'per_1000'],
  ['per 1000', 'per_1000'],
  ['per 1 000', 'per_1000'],
  ['per thousand', 'per_1000'],
  ['per 100,000', 'per_100k'],
  ['per 100000', 'per_100k'],
  ['per 100 000', 'per_100k'],
  ['per 100k', 'per_100k'],
  ['per 1e5', 'per_100k'],
  ['per 1,000,000', 'per_million'],
  ['per 1000000', 'per_million'],
  ['per 1 000 000', 'per_million'],
  ['per million', 'per_million'],
  ['ratio', 'ratio'],
  ['share', 'ratio'],
  ['index', 'index'],
  ['index (2015=100)', 'index'],
  ['index (2010=100)', 'index'],
  ['number', 'count'],
  ['count', 'count'],
  ['people', 'count'],
  ['usd', 'count'],
  ['eur', 'count']
]);

const RATE_TO_RATIO: Record<Exclude<StandardUnit, 'count' | 'index' | 'unknown'>, number> = {
  percent: 0.01,
  per_1000: 1 / 1000,
  per_100k: 1 / 100000,
  per_million: 1 / 1000000,
  ratio: 1
};

export interface NormalisedUnit {
  unit: StandardUnit;
  original?: string;
}

export function normaliseUnit(input?: string | null): NormalisedUnit {
  if (!input) {
    return { unit: 'unknown' };
  }
  const key = input.trim().toLowerCase();
  const unit = UNIT_ALIASES[key] ?? inferUnitFromSymbol(key);
  return {
    unit: unit ?? 'unknown',
    original: input
  };
}

function inferUnitFromSymbol(value: string): StandardUnit | undefined {
  if (value.endsWith('%')) return 'percent';
  if (/\bper\s*1\s*000\b/.test(value)) return 'per_1000';
  if (/\bper\s*100\s*000\b/.test(value)) return 'per_100k';
  if (/\bper\s*1\s*000\s*000\b/.test(value)) return 'per_million';
  if (/index/.test(value)) return 'index';
  return undefined;
}

export function convertRate(value: number, from: StandardUnit, to: StandardUnit): number {
  if (from === to) return value;
  if (!isRateUnit(from) || !isRateUnit(to)) {
    throw new Error(`Cannot convert from ${from} to ${to}`);
  }
  const ratio = value * RATE_TO_RATIO[from];
  return ratio / RATE_TO_RATIO[to];
}

export function isRateUnit(unit: StandardUnit): unit is Exclude<StandardUnit, 'count' | 'index' | 'unknown'> {
  return unit === 'percent' || unit === 'per_1000' || unit === 'per_100k' || unit === 'per_million' || unit === 'ratio';
}

export function describeUnit(unit: StandardUnit): string {
  switch (unit) {
    case 'percent':
      return 'Percentage values from 0 to 100';
    case 'per_1000':
      return 'Rate per 1 000 inhabitants';
    case 'per_100k':
      return 'Rate per 100 000 inhabitants';
    case 'per_million':
      return 'Rate per 1 000 000 inhabitants';
    case 'ratio':
      return 'Unitless ratio between 0 and 1';
    case 'index':
      return 'Indexed measure (e.g. 2015 = 100)';
    case 'count':
      return 'Absolute count or sum';
    default:
      return 'Unclassified unit';
  }
}
