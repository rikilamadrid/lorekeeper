#!/usr/bin/env node
import { usage } from './usage.js';
import { readVersion } from './version.js';

export function run(argv: readonly string[]): number {
  const version = readVersion();

  if (argv.length === 0) {
    process.stdout.write(`${usage(version)}\n`);
    return 0;
  }

  const [first] = argv;

  if (first === '--version' || first === '-v') {
    process.stdout.write(`${version}\n`);
    return 0;
  }

  if (first === '--help' || first === '-h') {
    process.stdout.write(`${usage(version)}\n`);
    return 0;
  }

  process.stderr.write(`lore: unknown argument "${first}"\n`);
  process.stderr.write("Run 'lore --help' to see what is available.\n");
  return 1;
}

process.exitCode = run(process.argv.slice(2));
