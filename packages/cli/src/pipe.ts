/**
 * Let a reader close `lore`'s output early without a crash.
 *
 * `lore init brain | head -1` closes the pipe after one line. Node ignores
 * SIGPIPE, so the next write surfaces as an `EPIPE` error on the stream, and an
 * unhandled stream error kills the process with a stack trace and exit 1.
 *
 * A closed output pipe means the reader has everything it wants. The command
 * has already run to completion (`run` is synchronous), so the process simply
 * exits with the code `run` chose. Every other stream error still throws.
 */

/** The part of a writable stream this guard needs. */
export interface ErrorSource {
  on(event: 'error', listener: (error: Error) => void): unknown;
}

/** Ignore `EPIPE` on `stream`; rethrow every other error unchanged. */
export function tolerateClosedPipe(stream: ErrorSource): void {
  stream.on('error', (error) => {
    if ((error as NodeJS.ErrnoException).code === 'EPIPE') return;
    throw error;
  });
}
