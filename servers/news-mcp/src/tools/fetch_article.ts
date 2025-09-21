import { z } from 'zod';
import { getText, getWithRetry, buildUserAgent } from '@cluster-mcp/core';

const DEFAULT_MAX_CHARS = 10_000;
const MAX_ALLOWED_CHARS = 50_000;
const DEFAULT_BATCH_MAX_CHARS = 5_000;
const CONTACT_EMAIL = process.env.CONTACT_EMAIL;

export const fetchArticleSchema = z.object({
  url: z
    .string()
    .url()
    .describe('Direct URL to the news article'),
  maxChars: z
    .number()
    .int()
    .positive()
    .max(MAX_ALLOWED_CHARS)
    .optional()
    .default(DEFAULT_MAX_CHARS)
    .describe('Maximum number of characters to return (default: 10000, max: 50000)'),
});

export const fetchMultipleSchema = z.object({
  urls: z
    .array(z.string().url())
    .min(1)
    .max(5)
    .describe('List of article URLs to fetch (max 5)'),
  maxCharsPerArticle: z
    .number()
    .int()
    .positive()
    .max(MAX_ALLOWED_CHARS)
    .optional()
    .default(DEFAULT_BATCH_MAX_CHARS)
    .describe('Character limit for each article (default: 5000)'),
});

export type FetchArticleParams = z.infer<typeof fetchArticleSchema>;
export type FetchMultipleParams = z.infer<typeof fetchMultipleSchema>;

type FetchResult = {
  url: string;
  title?: string;
  content: string;
  contentType?: string;
  originalLength: number;
  truncated: boolean;
  maxChars: number;
  retrievedAt: string;
};

function decodeBasicEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToPlainText(html: string): { title?: string; text: string } {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const withoutScripts = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  const withoutStyles = withoutScripts.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  const withBreaks = withoutStyles
    .replace(/<(br|p|div|section|article|li|tr|td|th|h[1-6])[^>]*>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/section>/gi, '\n')
    .replace(/<\/article>/gi, '\n');

  const plain = withBreaks
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/\s{3,}/g, '\n')
    .split('\n')
    .map(line => decodeBasicEntities(line.trim()))
    .filter(Boolean)
    .join('\n');

  const title = titleMatch ? decodeBasicEntities(titleMatch[1].trim()) : undefined;
  return { title, text: plain.trim() };
}

function truncateContent(content: string, maxChars: number) {
  if (content.length <= maxChars) {
    return { content, truncated: false };
  }

  return {
    content: content.slice(0, maxChars),
    truncated: true,
  };
}

async function fetchArticleContent(url: string, maxChars: number): Promise<FetchResult> {
  const limit = Math.min(Math.max(maxChars, 1), MAX_ALLOWED_CHARS);
  const headers: Record<string, string> = {};
  if (CONTACT_EMAIL) {
    headers['User-Agent'] = buildUserAgent(CONTACT_EMAIL);
  }
  const { text: raw, headers: responseHeaders } = await getWithRetry(() => getText(url, headers));

  const contentType = responseHeaders['content-type'];
  const isHtml = contentType?.includes('html') || raw.trim().startsWith('<!DOCTYPE html') || raw.trim().startsWith('<html');

  let processedText = raw;
  let title: string | undefined;

  if (isHtml) {
    const htmlResult = htmlToPlainText(raw);
    processedText = htmlResult.text || raw;
    title = htmlResult.title;

    // Fallback to raw HTML if plain text extraction failed badly
    if (!processedText || processedText.length < 200) {
      processedText = raw;
    }
  }

  const { content, truncated } = truncateContent(processedText, limit);

  return {
    url,
    title,
    content,
    contentType,
    originalLength: processedText.length,
    truncated,
    maxChars: limit,
    retrievedAt: new Date().toISOString(),
  };
}

export async function fetchArticle(params: FetchArticleParams) {
  const { url, maxChars } = params;

  try {
    const result = await fetchArticleContent(url, maxChars);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: `Error fetching article: ${message}`,
      }],
      isError: true,
    };
  }
}

export async function fetchMultiple(params: FetchMultipleParams) {
  const { urls, maxCharsPerArticle } = params;

  const results = [] as Array<FetchResult | { url: string; error: string }>;

  for (const url of urls) {
    try {
      const result = await fetchArticleContent(url, maxCharsPerArticle);
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      results.push({ url, error: message });
    }
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            count: urls.length,
            maxCharsPerArticle,
            results,
            retrievedAt: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  };
}
