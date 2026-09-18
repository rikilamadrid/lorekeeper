/**
 * What every measurement over the synthetic corpus agrees on.
 *
 * Two benchmarks now describe the same vault — one records how long retrieval
 * takes, the other how much context it costs — and both numbers are recorded in
 * Feature specs that a reader will compare. If the corpus size, the seed, or
 * the wordings drifted apart, those recorded numbers would quietly stop
 * describing the same thing while still looking comparable. They live here once
 * so that cannot happen.
 *
 * None of these is a knob. Changing one changes what every recorded measurement
 * means, so a change is a decision that belongs in a Feature's verification
 * alongside the new numbers.
 */

/** Notes the synthetic corpus holds. "A few thousand", made specific. */
export const NOTES = 3_000;

/** The seed every generated corpus derives from. */
export const SEED = 20260917;

/**
 * Three wordings of one question, as the agent artifact instructs.
 *
 * They are drawn from the generator's own vocabulary, because the artifact's
 * illustrative example is about certificates in a vault that has none. What is
 * measured is the shape of the call — several wordings, fused — not these
 * particular words.
 */
export const WORDINGS: readonly string[] = [
  'retry backoff jitter',
  'queue consumer timeout',
  'certificate rotation expiry',
];
