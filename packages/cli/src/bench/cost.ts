/**
 * Accounting for what one run of the prescribed workflow cost, in bytes.
 *
 * Separated from the script that prints it so the accounting can be tested. A
 * baseline that charged a file once per span rather than once would inflate the
 * saving silently, and that is exactly the kind of error a printed number
 * hides.
 *
 * Bytes are the proxy for token cost and are labelled as one wherever the
 * number is recorded. Counting real tokens needs a tokenizer, which is a
 * dependency and a vendor coupling, and the CLI ships offline with neither.
 */

/** What one run of the prescribed workflow cost, in bytes. */
export interface ContextCost {
  readonly results: number;
  /** Distinct files the returned spans came from. */
  readonly files: number;
  /** The JSON the command printed. What actually enters a caller's context. */
  readonly payloadBytes: number;
  /** The span text inside that payload. The evidence, without its addressing. */
  readonly textBytes: number;
  /** Every distinct file the spans came from, whole. The naive baseline. */
  readonly wholeNoteBytes: number;
}

/** Account for one JSON payload against the files its spans came from. */
export function costOf(
  json: string,
  sizeOf: (path: string) => number,
): ContextCost {
  const payload = JSON.parse(json) as {
    results: readonly { path: string; text: string }[];
  };

  const paths = new Set(payload.results.map((result) => result.path));
  let textBytes = 0;
  for (const result of payload.results) {
    textBytes += Buffer.byteLength(result.text, 'utf8');
  }
  let wholeNoteBytes = 0;
  for (const path of paths) {
    wholeNoteBytes += sizeOf(path);
  }

  return {
    results: payload.results.length,
    files: paths.size,
    payloadBytes: Buffer.byteLength(json, 'utf8'),
    textBytes,
    wholeNoteBytes,
  };
}
