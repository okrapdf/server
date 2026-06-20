/**
 * okra search - Full-text search command
 *
 * Search page content across all pages.
 *
 * Usage:
 *   okra search <jobId> "revenue"
 *   okra search <jobId> "total" --format json
 */

import type { OkraClient } from '../../client';
import type { SearchResponse } from '../types';

export interface SearchOptions {
  format?: 'text' | 'json';
  limit?: number;
}

/**
 * Search page content.
 */
export async function search(
  client: OkraClient,
  jobId: string,
  query: string
): Promise<SearchResponse> {
  return client.request<SearchResponse>(`/document/${jobId}/search?q=${encodeURIComponent(query)}`);
}

/**
 * Format search results for output.
 */
export function formatSearchOutput(
  result: SearchResponse,
  format: 'text' | 'json' = 'text'
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];
  lines.push(`Search: "${result.query}"`);
  lines.push(`Found ${result.totalMatches} matches in ${result.results.length} pages`);
  lines.push('');

  for (const r of result.results) {
    const source = r.matchSource ? ` [${r.matchSource}]` : '';
    lines.push(`p${r.page.toString().padStart(3)} (${r.matchCount} matches)${source}`);
    if (r.snippet) {
      lines.push(`  "${r.snippet.slice(0, 80)}${r.snippet.length > 80 ? '...' : ''}"`);
    }
  }

  return lines.join('\n');
}
