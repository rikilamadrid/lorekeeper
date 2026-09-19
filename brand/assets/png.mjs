/**
 * A deterministic PNG encoder, written here rather than taken from a
 * dependency.
 *
 * The reason is reproducibility. This ticket's contract is that rebuilding an
 * asset from its vector source reproduces it byte for byte, and the usual
 * route to a PNG -- `zlib.deflateSync`, or a native rasteriser -- ties those
 * bytes to the compressor shipped with the current runtime. A zlib upgrade
 * inside a Node release would change every generated file without a single
 * source file changing. So the DEFLATE stream is produced here, by fixed
 * Huffman codes over a greedy LZ77 match search: small, ordinary, and a pure
 * function of its input.
 *
 * `node:zlib` is still imported -- to inflate what was just written and prove
 * it round-trips. Verification only; nothing it returns reaches a file.
 *
 * Images are 8-bit truecolour (PNG colour type 2). Every asset this build
 * emits is opaque, so there is no alpha channel to carry.
 */

import { inflateSync } from 'node:zlib';

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
  1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13,
];

const WINDOW = 32768;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
/** Probes per hash chain. Bounded so the search cannot degenerate. */
const MAX_CHAIN = 128;

/**
 * Bit sink for RFC 1951: bits are packed into bytes from the least
 * significant bit up, while a Huffman code is written most significant bit
 * first.
 */
class BitWriter {
  constructor() {
    this.bytes = new Uint8Array(1024);
    this.length = 0;
    this.bitBuffer = 0;
    this.bitCount = 0;
  }

  /** @param {number} byte */
  pushByte(byte) {
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2);
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.length] = byte;
    this.length += 1;
  }

  /**
   * @param {number} value low `count` bits, least significant first
   * @param {number} count
   */
  writeBits(value, count) {
    for (let i = 0; i < count; i += 1) {
      this.bitBuffer |= ((value >> i) & 1) << this.bitCount;
      this.bitCount += 1;
      if (this.bitCount === 8) {
        this.pushByte(this.bitBuffer);
        this.bitBuffer = 0;
        this.bitCount = 0;
      }
    }
  }

  /**
   * @param {number} code Huffman code, most significant bit first
   * @param {number} count
   */
  writeCode(code, count) {
    for (let i = count - 1; i >= 0; i -= 1) {
      this.writeBits((code >> i) & 1, 1);
    }
  }

  /** @returns {Uint8Array} */
  finish() {
    if (this.bitCount > 0) {
      this.pushByte(this.bitBuffer);
      this.bitBuffer = 0;
      this.bitCount = 0;
    }
    return this.bytes.subarray(0, this.length);
  }
}

/**
 * The fixed literal/length code of RFC 1951 3.2.6.
 *
 * @param {BitWriter} out
 * @param {number} symbol
 */
function writeLiteralLengthSymbol(out, symbol) {
  if (symbol < 144) {
    out.writeCode(0x30 + symbol, 8);
  } else if (symbol < 256) {
    out.writeCode(0x190 + (symbol - 144), 9);
  } else if (symbol < 280) {
    out.writeCode(symbol - 256, 7);
  } else {
    out.writeCode(0xc0 + (symbol - 280), 8);
  }
}

/**
 * @param {number} length 3..258
 * @returns {number} index into LENGTH_BASE
 */
function lengthCode(length) {
  let index = LENGTH_BASE.length - 1;
  while (LENGTH_BASE[index] > length) {
    index -= 1;
  }
  return index;
}

/**
 * @param {number} distance 1..32768
 * @returns {number} index into DIST_BASE
 */
function distanceCode(distance) {
  let index = DIST_BASE.length - 1;
  while (DIST_BASE[index] > distance) {
    index -= 1;
  }
  return index;
}

/**
 * DEFLATE, one fixed-Huffman block, greedy matching.
 *
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function deflateFixed(data) {
  const out = new BitWriter();
  out.writeBits(1, 1); // BFINAL
  out.writeBits(1, 2); // BTYPE = fixed Huffman

  const head = new Int32Array(1 << 15).fill(-1);
  const prev = new Int32Array(data.length).fill(-1);
  const hashAt = (i) =>
    ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & 0x7fff;

  let position = 0;
  while (position < data.length) {
    let bestLength = 0;
    let bestDistance = 0;

    if (position + MIN_MATCH <= data.length) {
      const key = hashAt(position);
      let candidate = head[key];
      let probes = 0;
      const limit = Math.min(MAX_MATCH, data.length - position);
      while (
        candidate >= 0 &&
        probes < MAX_CHAIN &&
        position - candidate <= WINDOW
      ) {
        let length = 0;
        while (
          length < limit &&
          data[candidate + length] === data[position + length]
        ) {
          length += 1;
        }
        if (length > bestLength) {
          bestLength = length;
          bestDistance = position - candidate;
          if (length === limit) {
            break;
          }
        }
        candidate = prev[candidate];
        probes += 1;
      }
    }

    if (bestLength >= MIN_MATCH) {
      const lc = lengthCode(bestLength);
      writeLiteralLengthSymbol(out, 257 + lc);
      if (LENGTH_EXTRA[lc] > 0) {
        out.writeBits(bestLength - LENGTH_BASE[lc], LENGTH_EXTRA[lc]);
      }
      const dc = distanceCode(bestDistance);
      out.writeCode(dc, 5);
      if (DIST_EXTRA[dc] > 0) {
        out.writeBits(bestDistance - DIST_BASE[dc], DIST_EXTRA[dc]);
      }
    } else {
      bestLength = 1;
      writeLiteralLengthSymbol(out, data[position]);
    }

    // Index every position the cursor passes over, matched or not, so later
    // searches see the whole window.
    for (let i = 0; i < bestLength; i += 1) {
      const at = position + i;
      if (at + MIN_MATCH <= data.length) {
        const key = hashAt(at);
        prev[at] = head[key];
        head[key] = at;
      }
    }
    position += bestLength;
  }

  writeLiteralLengthSymbol(out, 256); // end of block
  return out.finish();
}

/**
 * @param {Uint8Array} data
 * @returns {number}
 */
function adler32(data) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i += 1) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * A zlib stream (RFC 1950) wrapping one fixed-Huffman DEFLATE block, then
 * inflated again to prove the encoder above and the world agree.
 *
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function zlibStream(data) {
  const body = deflateFixed(data);
  const stream = new Uint8Array(2 + body.length + 4);
  stream[0] = 0x78; // CM = 8, CINFO = 7 (32K window)
  stream[1] = 0x01; // FCHECK such that the header is a multiple of 31
  stream.set(body, 2);
  const sum = adler32(data);
  stream[stream.length - 4] = (sum >>> 24) & 0xff;
  stream[stream.length - 3] = (sum >>> 16) & 0xff;
  stream[stream.length - 2] = (sum >>> 8) & 0xff;
  stream[stream.length - 1] = sum & 0xff;

  const roundTrip = inflateSync(Buffer.from(stream));
  if (roundTrip.length !== data.length) {
    throw new Error('deflate round-trip changed the data length');
  }
  for (let i = 0; i < data.length; i += 1) {
    if (roundTrip[i] !== data[i]) {
      throw new Error(`deflate round-trip differs at byte ${i}`);
    }
  }
  return stream;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * @param {Uint8Array} data
 * @returns {number}
 */
function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type four ASCII characters
 * @param {Uint8Array} payload
 * @returns {Uint8Array}
 */
function chunk(type, payload) {
  const out = new Uint8Array(12 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, payload.length);
  for (let i = 0; i < 4; i += 1) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(payload, 8);
  view.setUint32(
    8 + payload.length,
    crc32(out.subarray(4, 8 + payload.length)),
  );
  return out;
}

/**
 * The five PNG filters, scored by the sum of absolute signed differences --
 * the heuristic PNG's own specification suggests. Ties go to the lower filter
 * number, so the choice is total and the output stays reproducible.
 *
 * @param {Uint8Array} raw RGB rows, no filter bytes
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} filtered scanlines, each prefixed with its filter byte
 */
function filterScanlines(raw, width, height) {
  const stride = width * 3;
  const out = new Uint8Array((stride + 1) * height);
  const candidate = new Uint8Array(stride);
  const chosen = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const line = raw.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : null;
    let bestFilter = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let filter = 0; filter < 5; filter += 1) {
      let score = 0;
      for (let i = 0; i < stride; i += 1) {
        const a = i >= 3 ? line[i - 3] : 0;
        const b = above ? above[i] : 0;
        const c = above && i >= 3 ? above[i - 3] : 0;
        let value;
        if (filter === 0) {
          value = line[i];
        } else if (filter === 1) {
          value = line[i] - a;
        } else if (filter === 2) {
          value = line[i] - b;
        } else if (filter === 3) {
          value = line[i] - ((a + b) >> 1);
        } else {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          value = line[i] - paeth;
        }
        candidate[i] = value & 0xff;
        const signed = candidate[i] < 128 ? candidate[i] : 256 - candidate[i];
        score += signed;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
        chosen.set(candidate);
      }
    }

    out[y * (stride + 1)] = bestFilter;
    out.set(chosen, y * (stride + 1) + 1);
  }
  return out;
}

/**
 * Encode an opaque RGB image as a PNG.
 *
 * @param {{ width: number, height: number, rgb: Uint8Array }} image
 * @returns {Uint8Array}
 */
export function encodePng({ width, height, rgb }) {
  if (rgb.length !== width * height * 3) {
    throw new Error(
      `pixel buffer is ${rgb.length} bytes, expected ${width * height * 3}`,
    );
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlibStream(filterScanlines(rgb, width, height))),
    chunk('IEND', new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}
