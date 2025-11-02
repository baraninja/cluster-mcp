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
    let nutsLevel: string | undefined;

    if (to === 'NUTS') {
      // Converting ISO to NUTS
      result = ISO_TO_NUTS[inputCode];
      fromSystem = 'ISO2';
      nutsLevel = 'NUTS0';
    } else {
      // Converting NUTS to ISO
      fromSystem = 'NUTS';

      // NUTS codes always start with the ISO country code (first 2 characters)
      const countryCode = inputCode.slice(0, 2);

      // Detect NUTS level based on length
      if (inputCode.length === 2) {
        nutsLevel = 'NUTS0';
      } else if (inputCode.length === 3) {
        nutsLevel = 'NUTS1';
      } else if (inputCode.length === 4) {
        nutsLevel = 'NUTS2';
      } else if (inputCode.length === 5) {
        nutsLevel = 'NUTS3';
      }

      // Map to ISO (extract first 2 characters and convert EL→GR if needed)
      result = NUTS_TO_ISO[countryCode];

      if (!result) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'MAPPING_NOT_FOUND',
              message: `No mapping found from ${fromSystem} code '${code}' to ${to}`,
              input: { code: inputCode, system: fromSystem, level: nutsLevel },
              suggestion: 'This code may not be a valid EU NUTS region code'
            }, null, 2)
          }]
        };
      }
    }

    if (!result) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            error: 'MAPPING_NOT_FOUND',
            message: `No mapping found from ${fromSystem} code '${code}' to ${to}`,
            input: { code: inputCode, system: fromSystem },
            suggestion: 'This code may not be a valid ISO2 country code'
          }, null, 2)
        }]
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          input: {
            code: inputCode,
            system: fromSystem,
            level: nutsLevel
          },
          output: {
            code: result,
            system: to,
            level: to === 'NUTS' ? 'NUTS0' : undefined
          },
          mapping: `${inputCode} (${fromSystem}${nutsLevel ? ' ' + nutsLevel : ''}) → ${result} (${to})`
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