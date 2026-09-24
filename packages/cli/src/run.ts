import { capture } from './capture.js';
import { init } from './init.js';
import { search } from './search.js';
import { type Paint, PLAIN } from './terminal.js';
import { usage } from './usage.js';
import { readVersion } from './version.js';

/** The streams `run` writes to, injected so tests can capture output. */
export interface Streams {
  out: (text: string) => void;
  err: (text: string) => void;
}

/**
 * Parses argv and writes the result, returning the intended exit code.
 *
 * Kept free of `process` so it can be called directly from a test. The binary
 * entry point in `cli.ts` is the only place that touches global state, which
 * is also why it, and not this function, decides whether `paint` has colour.
 */
export function run(
  argv: readonly string[],
  streams: Streams,
  paint: Paint = PLAIN,
): number {
  const version = readVersion();

  if (argv.length === 0) {
    streams.out(`${usage(version, paint)}\n`);
    return 0;
  }

  const [first] = argv;

  if (first === '--version' || first === '-v') {
    streams.out(`${version}\n`);
    return 0;
  }

  if (first === '--help' || first === '-h') {
    streams.out(`${usage(version, paint)}\n`);
    return 0;
  }

  if (first === 'init') {
    return init(argv.slice(1), streams);
  }

  if (first === 'capture') {
    return capture(argv.slice(1), streams);
  }

  if (first === 'search') {
    return search(argv.slice(1), streams);
  }

  streams.err(`lore: unknown argument "${first}"\n`);
  streams.err("Run 'lore --help' to see what is available.\n");
  return 1;
}
