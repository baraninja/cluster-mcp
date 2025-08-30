import { z } from 'zod';

export const mapRegionCodeSchema = z.object({
  code: z.string().min(1).describe('Region code to convert'),
  to: z.enum(['ISO', 'NUTS']).describe('Target coding system')
});

export type MapRegionCodeParams = z.infer<typeof mapRegionCodeSchema>;

const ISO_TO_NUTS: Record<string, string> = {
  'AT': 'AT',
  'BE': 'BE', 
  'BG': 'BG',
  'HR': 'HR',
  'CY': 'CY',
  'CZ': 'CZ',
  'DK': 'DK',
  'EE': 'EE',
  'FI': 'FI',
  'FR': 'FR',
  'DE': 'DE',
  'GR': 'EL',
  'HU': 'HU',
  'IE': 'IE',
  'IT': 'IT',
  'LV': 'LV',
  'LT': 'LT',
  'LU': 'LU',
  'MT': 'MT',
  'NL': 'NL',
  'PL': 'PL',
  'PT': 'PT',
  'RO': 'RO',
  'SK': 'SK',
  'SI': 'SI',
  'ES': 'ES',
  'SE': 'SE'
};

const NUTS_TO_ISO: Record<string, string> = {
  'AT': 'AT',
  'BE': 'BE',
  'BG': 'BG', 
  'HR': 'HR',
  'CY': 'CY',
  'CZ': 'CZ',
  'DK': 'DK',
  'EE': 'EE',
  'FI': 'FI',
  'FR': 'FR',
  'DE': 'DE',
  'EL': 'GR',
  'HU': 'HU',
  'IE': 'IE',
  'IT': 'IT',
  'LV': 'LV',
  'LT': 'LT',
  'LU': 'LU',
  'MT': 'MT',
  'NL': 'NL',
  'PL': 'PL',
  'PT': 'PT',
  'RO': 'RO',
  'SK': 'SK',
  'SI': 'SI',
  'ES': 'ES',
  'SE': 'SE'
};

export async function mapRegionCode(params: MapRegionCodeParams) {
  const { code, to } = params;
  
  try {
    const inputCode = code.toUpperCase();
    let result: string | undefined;
    let fromSystem: string;
    
    if (to === 'NUTS') {
      result = ISO_TO_NUTS[inputCode];
      fromSystem = 'ISO';
    } else {
      result = NUTS_TO_ISO[inputCode];
      fromSystem = 'NUTS';
    }
    
    if (!result) {
      return {
        content: [{
          type: 'text' as const,
          text: `No mapping found from ${fromSystem} code '${code}' to ${to}`
        }]
      };
    }
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          input: {
            code: inputCode,
            system: fromSystem
          },
          output: {
            code: result,
            system: to
          },
          mapping: `${inputCode} (${fromSystem}) → ${result} (${to})`
        }, null, 2)
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: `Error mapping region code: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}