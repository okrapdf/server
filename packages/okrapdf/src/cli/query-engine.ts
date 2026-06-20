/**
 * Query Engine - jQuery-like entity selector
 *
 * Inspired by okra-jquery from okra-jquery
 * Supports selectors like:
 * - Type: .table, .figure, .footnote
 * - ID: #entity_123
 * - Attributes: [confidence>0.9], [verified=true]
 * - Page: :page(5), :pages(1-10)
 * - Combinators: .table[confidence>0.9], .table, .figure
 */

import type { Entity, EntityType } from './types';

export interface SelectorParts {
  types: EntityType[];
  id?: string;
  pageFilter?: { type: 'single' | 'range'; value: number | [number, number] };
  confidenceFilter?: { op: '>' | '<' | '>=' | '<='; value: number };
  verificationFilter?: 'pending' | 'verified' | 'flagged' | 'rejected';
  textContains?: string;
}

/**
 * Parse a jQuery-like selector string into parts.
 *
 * Examples:
 * - ".table" -> { types: ['table'] }
 * - ".table, .figure" -> { types: ['table', 'figure'] }
 * - ".table:page(5)" -> { types: ['table'], pageFilter: { type: 'single', value: 5 } }
 * - "[confidence>0.9]" -> { confidenceFilter: { op: '>', value: 0.9 } }
 * - ".table[confidence>=0.8]:page(1-10)" -> complex filter
 */
export function parseSelector(selector: string): SelectorParts {
  const parts: SelectorParts = { types: [] };

  // Handle OR combinator first (comma-separated)
  if (selector.includes(',') && !selector.includes('[')) {
    const segments = selector.split(',').map((s) => s.trim());
    for (const seg of segments) {
      const subParts = parseSelector(seg);
      parts.types.push(...subParts.types);
    }
    return parts;
  }

  // Extract type selectors (.table, .figure, etc)
  // Must start with letter (not number) to avoid matching .8 in [confidence>=0.8]
  const typeMatches = selector.match(/\.([a-zA-Z][a-zA-Z0-9_]*)/g);
  if (typeMatches) {
    parts.types = typeMatches.map((m) => m.slice(1) as EntityType);
  }

  // Extract ID selector (#entity_123)
  const idMatch = selector.match(/#([\w-]+)/);
  if (idMatch) {
    parts.id = idMatch[1];
  }

  // Extract page filter (:page(5) or :pages(1-10))
  const pageMatch = selector.match(/:pages?\((\d+)(?:-(\d+))?\)/);
  if (pageMatch) {
    if (pageMatch[2]) {
      parts.pageFilter = {
        type: 'range',
        value: [parseInt(pageMatch[1], 10), parseInt(pageMatch[2], 10)],
      };
    } else {
      parts.pageFilter = {
        type: 'single',
        value: parseInt(pageMatch[1], 10),
      };
    }
  }

  // Extract confidence filter ([confidence>0.9])
  const confMatch = selector.match(/\[confidence(>=?|<=?|>|<)(\d+\.?\d*)\]/);
  if (confMatch) {
    parts.confidenceFilter = {
      op: confMatch[1] as '>' | '<' | '>=' | '<=',
      value: parseFloat(confMatch[2]),
    };
  }

  // Extract verification filter ([verified=true], [status=pending])
  const verifyMatch = selector.match(/\[(?:verified|status)=(\w+)\]/);
  if (verifyMatch) {
    const val = verifyMatch[1].toLowerCase();
    if (val === 'true') {
      parts.verificationFilter = 'verified';
    } else if (['pending', 'verified', 'flagged', 'rejected'].includes(val)) {
      parts.verificationFilter = val as typeof parts.verificationFilter;
    }
  }

  // Extract text contains filter (:contains(text))
  const containsMatch = selector.match(/:contains\(([^)]+)\)/);
  if (containsMatch) {
    parts.textContains = containsMatch[1];
  }

  // If no types specified and selector is "*", match all
  if (parts.types.length === 0 && selector.includes('*')) {
    parts.types = ['table', 'figure', 'footnote', 'summary', 'signature', 'paragraph'];
  }

  return parts;
}

/**
 * Filter entities based on parsed selector parts.
 */
export function filterEntities(entities: Entity[], parts: SelectorParts): Entity[] {
  return entities.filter((entity) => {
    // Type filter - only apply if types are specified
    if (parts.types.length > 0 && !parts.types.includes(entity.type)) {
      return false;
    }

    // ID filter
    if (parts.id && entity.id !== parts.id) {
      return false;
    }

    // Page filter
    if (parts.pageFilter) {
      if (parts.pageFilter.type === 'single') {
        if (entity.page !== parts.pageFilter.value) return false;
      } else {
        const [start, end] = parts.pageFilter.value as [number, number];
        if (entity.page < start || entity.page > end) return false;
      }
    }

    // Confidence filter
    if (parts.confidenceFilter && entity.confidence !== undefined) {
      const { op, value } = parts.confidenceFilter;
      switch (op) {
        case '>':
          if (!(entity.confidence > value)) return false;
          break;
        case '>=':
          if (!(entity.confidence >= value)) return false;
          break;
        case '<':
          if (!(entity.confidence < value)) return false;
          break;
        case '<=':
          if (!(entity.confidence <= value)) return false;
          break;
      }
    }

    // Verification filter
    if (parts.verificationFilter && entity.verificationStatus !== parts.verificationFilter) {
      return false;
    }

    // Text contains filter
    if (parts.textContains && entity.title) {
      if (!entity.title.toLowerCase().includes(parts.textContains.toLowerCase())) {
        return false;
      }
    }

    return true;
  });
}

export interface QueryOptions {
  topK?: number;
  minConfidence?: number;
  pageRange?: [number, number];
  sortBy?: 'confidence' | 'page' | 'type';
}

export interface QueryStats {
  total: number;
  byType: Record<string, number>;
  byPage: Record<number, number>;
  avgConfidence: number;
  minConfidence: number;
  maxConfidence: number;
}

export interface QueryResult {
  entities: Entity[];
  total: number;
  stats: QueryStats;
}

/**
 * Execute a query against entities.
 */
export function executeQuery(
  entities: Entity[],
  selector: string,
  options: QueryOptions = {}
): QueryResult {
  const parts = parseSelector(selector);

  // Apply min confidence if specified
  if (options.minConfidence !== undefined) {
    parts.confidenceFilter = { op: '>=', value: options.minConfidence };
  }

  // Apply page range if specified
  if (options.pageRange) {
    parts.pageFilter = { type: 'range', value: options.pageRange };
  }

  let results = filterEntities(entities, parts);

  // Sort
  if (options.sortBy) {
    results = [...results].sort((a, b) => {
      switch (options.sortBy) {
        case 'confidence':
          return (b.confidence ?? 0) - (a.confidence ?? 0);
        case 'page':
          return a.page - b.page;
        case 'type':
          return a.type.localeCompare(b.type);
        default:
          return 0;
      }
    });
  }

  // Calculate stats
  const stats = calculateStats(results);

  // Apply top-k limit
  if (options.topK && options.topK > 0) {
    results = results.slice(0, options.topK);
  }

  return {
    entities: results,
    total: results.length,
    stats,
  };
}

/**
 * Calculate aggregate statistics for entities.
 */
export function calculateStats(entities: Entity[]): QueryStats {
  const byType: Record<string, number> = {};
  const byPage: Record<number, number> = {};
  let totalConfidence = 0;
  let minConfidence = Infinity;
  let maxConfidence = -Infinity;
  let confidenceCount = 0;

  for (const entity of entities) {
    // Count by type
    byType[entity.type] = (byType[entity.type] || 0) + 1;

    // Count by page
    byPage[entity.page] = (byPage[entity.page] || 0) + 1;

    // Confidence stats
    if (entity.confidence !== undefined) {
      totalConfidence += entity.confidence;
      confidenceCount++;
      if (entity.confidence < minConfidence) minConfidence = entity.confidence;
      if (entity.confidence > maxConfidence) maxConfidence = entity.confidence;
    }
  }

  return {
    total: entities.length,
    byType,
    byPage,
    avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
    minConfidence: minConfidence === Infinity ? 0 : minConfidence,
    maxConfidence: maxConfidence === -Infinity ? 0 : maxConfidence,
  };
}
