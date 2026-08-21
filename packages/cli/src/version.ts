import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads the version from this package's own manifest.
 *
 * The built entry point lives in `dist/`, so the manifest sits one directory
 * up. Reading it at runtime keeps a single source of truth: `npm version` is
 * the only thing that ever changes the number.
 */
export function readVersion(): string {
  const manifestPath = join(import.meta.dirname, '..', 'package.json');
  const raw = readFileSync(manifestPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    typeof parsed.version !== 'string'
  ) {
    throw new Error(`No usable "version" field in ${manifestPath}`);
  }

  return parsed.version;
}
