import { readFileSync } from 'fs';
import { parse } from 'yaml';

export function loadEquivalenceYaml(filePath: string): Record<string, any> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parse(content) || {};
  } catch (error) {
    console.warn(`Failed to load equivalence file ${filePath}:`, error);
    return {};
  }
}

export function validateEquivalenceEntry(entry: any): boolean {
  if (!entry || typeof entry !== 'object') return false;

  const providerKeys = [
    'eurostat',
    'wb',
    'oecd',
    'ilostat',
    'who',
    'openaq',
    'comtrade'
  ];

  const hasAnyProvider = providerKeys.some(key => Boolean(entry[key]));

  return hasAnyProvider && Boolean(entry.label);
}
