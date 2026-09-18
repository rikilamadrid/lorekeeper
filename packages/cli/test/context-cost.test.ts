import { describe, expect, it } from 'vitest';
import { costOf } from '../src/bench/cost.js';

/**
 * A payload in the shape `lore search --json` prints. Only the fields the
 * accounting reads are needed, and they are the fields `05.1` froze.
 */
function payload(results: readonly { path: string; text: string }[]): string {
  return JSON.stringify({ query: 'q', queries: ['q'], results }, null, 2);
}

describe('costOf', () => {
  it('charges a file once however many of its spans came back', () => {
    const json = payload([
      { path: 'a.md', text: 'one' },
      { path: 'a.md', text: 'two' },
      { path: 'b.md', text: 'three' },
    ]);

    const cost = costOf(json, () => 1000);

    expect(cost.results).toBe(3);
    expect(cost.files).toBe(2);
    // Two distinct files, not three spans. Charging per span would inflate the
    // baseline and so the saving.
    expect(cost.wholeNoteBytes).toBe(2000);
  });

  it('counts the payload it was given and the span text inside it', () => {
    const json = payload([{ path: 'a.md', text: 'abcde' }]);

    const cost = costOf(json, () => 10);

    expect(cost.textBytes).toBe(5);
    expect(cost.payloadBytes).toBe(Buffer.byteLength(json, 'utf8'));
    // The payload carries addressing as well as evidence, so it is larger.
    expect(cost.payloadBytes).toBeGreaterThan(cost.textBytes);
  });

  it('counts bytes rather than characters', () => {
    const cost = costOf(payload([{ path: 'a.md', text: 'café' }]), () => 0);
    expect(cost.textBytes).toBe(5);
  });

  it('accounts for a run that matched nothing without inventing a saving', () => {
    const cost = costOf(payload([]), () => 1000);

    expect(cost.results).toBe(0);
    expect(cost.files).toBe(0);
    expect(cost.textBytes).toBe(0);
    expect(cost.wholeNoteBytes).toBe(0);
  });
});
