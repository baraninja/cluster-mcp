export type AliasDictionary = Record<string, string | string[]>;

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

export function normalizeSemanticId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]+/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildSemanticAliasMap(dictionary: AliasDictionary): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(dictionary)) {
    const canonicalNormalized = normalizeSemanticId(canonical);
    map.set(canonicalNormalized, canonical);
    for (const alias of toArray(aliases)) {
      const normalizedAlias = normalizeSemanticId(alias);
      if (!normalizedAlias) continue;
      map.set(normalizedAlias, canonical);
    }
  }
  return map;
}

export function registerCanonicalIds(map: Map<string, string>, ids: Iterable<string>): void {
  for (const id of ids) {
    const normalized = normalizeSemanticId(id);
    if (!normalized) continue;
    if (!map.has(normalized)) {
      map.set(normalized, id);
    }
  }
}

export interface ResolveSemanticIdResult {
  semanticId: string;
  matchedAlias: string | null;
}

export function resolveSemanticId(
  input: string,
  map: Map<string, string>
): ResolveSemanticIdResult {
  const normalized = normalizeSemanticId(input);
  const canonical = map.get(normalized);
  if (canonical) {
    const matchedAlias = normalizeSemanticId(canonical) === normalized ? null : normalized;
    return { semanticId: canonical, matchedAlias };
  }
  return { semanticId: input, matchedAlias: null };
}
