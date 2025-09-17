import { z } from 'zod';
import { fetchMetadata } from '../providers/index.js';

export const getMetadataSchema = z.object({
  provider: z.string().min(1).describe('Provider identifier (e.g. who, oecd, wb)'),
  id: z.string().min(1).describe('Provider-specific indicator code')
});

export const getMetadataInputSchema = {
  type: 'object',
  properties: {
    provider: {
      type: 'string',
      description: 'Provider identifier (e.g. who, oecd, wb)',
      minLength: 1
    },
    id: {
      type: 'string',
      description: 'Provider-specific indicator code',
      minLength: 1
    }
  },
  required: ['provider', 'id']
} as const;

export type GetMetadataParams = z.infer<typeof getMetadataSchema>;

export async function getMetadata(params: GetMetadataParams) {
  const metadata = await fetchMetadata(params);
  if (metadata) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(metadata, null, 2)
        }
      ]
    };
  }
  return {
    content: [
      {
        type: 'text' as const,
        text: `No metadata available for provider ${params.provider} with id ${params.id}`
      }
    ]
  };
}
