import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** Every synthetic fixture, as `{ name, text }`. No real personal content. */
export const fixtures = readdirSync(dir)
  .filter((file) => file.endsWith('.md'))
  .sort()
  .map((file) => ({
    name: basename(file, '.md'),
    text: readFileSync(join(dir, file), 'utf8'),
  }));

export function fixture(name: string): string {
  const found = fixtures.find((f) => f.name === name);
  if (!found) throw new Error(`no fixture named ${name}`);
  return found.text;
}
