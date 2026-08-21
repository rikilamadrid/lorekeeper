/**
 * Shared contracts for Lorekeeper.
 *
 * Feature 01 establishes this package as a build seam only. The frontmatter
 * schema, validation, and managed manifest format arrive in Feature 02; until
 * then the exports here are limited to product identity that the CLI genuinely
 * consumes, so the workspace boundary is exercised rather than assumed.
 */

export const PRODUCT_NAME = 'Lorekeeper';

export const TAGLINE =
  'Pathfinder finds the way; Lorekeeper remembers the journey.';
