/**
 * Write a Windows icon container around PNG images.
 *
 * `favicon.ico` is the one asset here whose format is not a choice: it is the
 * file browsers and bookmark managers still ask for by name at the site root.
 * Since Windows Vista an entry may hold a PNG rather than a device-independent
 * bitmap, which is what this writes -- the same PNG bytes already generated
 * for the standalone favicons, so the two can never disagree.
 */

/**
 * @param {{ size: number, png: Uint8Array }[]} entries smallest first
 * @returns {Uint8Array}
 */
export function encodeIco(entries) {
  const headerSize = 6 + entries.length * 16;
  const total = entries.reduce(
    (sum, entry) => sum + entry.png.length,
    headerSize,
  );
  const ico = new Uint8Array(total);
  const view = new DataView(ico.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type 1: icon
  view.setUint16(4, entries.length, true);

  let offset = headerSize;
  entries.forEach((entry, index) => {
    const at = 6 + index * 16;
    if (entry.size > 256) {
      throw new Error(
        `an icon entry cannot be ${entry.size}px; 256 is the limit`,
      );
    }
    ico[at] = entry.size === 256 ? 0 : entry.size; // 0 means 256
    ico[at + 1] = entry.size === 256 ? 0 : entry.size;
    ico[at + 2] = 0; // palette size: not a palette image
    ico[at + 3] = 0; // reserved
    view.setUint16(at + 4, 1, true); // colour planes
    view.setUint16(at + 6, 24, true); // bits per pixel: opaque RGB
    view.setUint32(at + 8, entry.png.length, true);
    view.setUint32(at + 12, offset, true);
    ico.set(entry.png, offset);
    offset += entry.png.length;
  });

  return ico;
}
