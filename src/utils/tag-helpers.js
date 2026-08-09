/**
 * ESM re-export for Vite renderer — source of truth is tag-helpers.cjs.
 */
import helpers from './tag-helpers.cjs';

export const {
  SYSTEM_TAG_NAMES,
  normalizeTagName,
  normalizeTagNames,
  normalizeUserTagNames,
  formatTagDisplay,
  formatTagsDisplay,
  userTagsOnly,
  userTagsDisplay,
  matchTagPrefix,
  parseCurrentTagToken,
  getHashTokenAt,
} = helpers;

export default helpers;
