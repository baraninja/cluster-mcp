import type { ProviderKey } from './types.js';

export interface RoutingPolicy {
  getProviderOrder(semanticId: string, geo?: string): ProviderKey[];
  getProviderIds(semanticId: string): Record<ProviderKey, string>;
}

export class DefaultRoutingPolicy implements RoutingPolicy {
  private equivalenceMap: Map<string, Record<string, any>>;

  constructor(equivalenceData?: Record<string, any>) {
    this.equivalenceMap = new Map();
    if (equivalenceData) {
      this.loadEquivalenceData(equivalenceData);
    }
  }

  private loadEquivalenceData(data: Record<string, any>) {
    for (const [semanticId, mapping] of Object.entries(data)) {
      this.equivalenceMap.set(semanticId, mapping);
    }
  }

  getProviderOrder(semanticId: string, geo?: string): ProviderKey[] {
    if (geo && this.isEuCountry(geo)) {
      return ['eurostat', 'oecd', 'wb', 'ilostat'];
    }
    
    return ['wb', 'oecd', 'eurostat', 'ilostat'];
  }

  getProviderIds(semanticId: string): Record<ProviderKey, string> {
    const mapping = this.equivalenceMap.get(semanticId);
    if (!mapping) {
      return {} as Record<ProviderKey, string>;
    }

    const result: Partial<Record<ProviderKey, string>> = {};
    
    if (mapping.eurostat) result.eurostat = mapping.eurostat;
    if (mapping.wb) result.wb = mapping.wb;
    if (mapping.oecd) result.oecd = mapping.oecd;
    if (mapping.ilostat) result.ilostat = mapping.ilostat;
    
    return result as Record<ProviderKey, string>;
  }

  private isEuCountry(geo: string): boolean {
    const euCountries = [
      'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
      'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
      'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
    ];
    
    const geoCode = geo.toUpperCase().slice(0, 2);
    return euCountries.includes(geoCode);
  }
}