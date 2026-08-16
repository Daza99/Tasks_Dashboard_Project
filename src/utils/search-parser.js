/**
 * Search query parser — comma = OR, + = AND, #name = tag, else phrase.
 * ESM for Vite renderer (keep in sync with search-parser.cjs).
 */

import { normalizeTagName } from './tag-helpers.js';

/**
 * Parse a search string into OR-groups of AND-parts.
 * "dog, food" → OR; "dog + food" → AND; "dog food" → one phrase.
 * @param {string} raw
 * @returns {{ empty: boolean, orGroups: { kind: 'tag'|'term', value: string }[][] }}
 */
export function parseSearchQuery(raw) {
  const s = String(raw || '').trim();
  if (!s) return { empty: true, orGroups: [] };

  const orGroups = [];
  for (const chunk of s.split(',')) {
    const andParts = [];
    for (const piece of chunk.split('+')) {
      const token = piece.trim();
      if (!token) continue;
      if (token.startsWith('#')) {
        const value = normalizeTagName(token);
        if (value) andParts.push({ kind: 'tag', value });
      } else {
        andParts.push({ kind: 'term', value: token.toLowerCase() });
      }
    }
    if (andParts.length) orGroups.push(andParts);
  }

  return { empty: orGroups.length === 0, orGroups };
}
