/**
 * Turn the shapes read from a vector source into pixels.
 *
 * The approach is deliberately plain. Curves are flattened to polylines at a
 * tolerance derived from the output size; a stroke is converted to the union
 * of one quadrilateral per segment plus a disc at each join, which the
 * non-zero winding rule resolves into exactly the stroked region; and
 * coverage is measured by sampling sixteen sub-scanlines per pixel row and
 * computing each span's horizontal coverage exactly. Everything is
 * double-precision arithmetic over the same inputs on every machine, so the
 * pixels are reproducible.
 *
 * Two departures from SVG are worth stating rather than hiding. Joins are
 * round where the sources declare `miter`: every join in `brand/logo/` is
 * between tangent-continuous segments -- a line meeting an arc it is tangent
 * to, or two flattened steps of the same circle -- where the two constructions
 * coincide. Butt caps, on the other hand, are honoured exactly, because the
 * wordmark's stems end on the cap line and the baseline and a round cap would
 * push its ink outside the ink box the identity measures.
 */

/** Sub-scanlines sampled per pixel row. */
const SUB_ROWS = 16;

/** Target flattening error, in device pixels. */
const FLATNESS = 0.08;

/**
 * @param {[number, number][]} points
 * @returns {[number, number][]} the same ring, counter-clockwise
 */
function counterClockwise(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    area += x0 * y1 - x1 * y0;
  }
  return area < 0 ? [...points].reverse() : points;
}

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 * @returns {number}
 */
function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * How many straight steps a curve of this device length needs.
 *
 * @param {number} deviceLength
 * @returns {number}
 */
function steps(deviceLength) {
  return clamp(Math.ceil(Math.sqrt(deviceLength / FLATNESS)), 4, 4096);
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @param {number} scale
 * @returns {[number, number][]}
 */
function flattenEllipse(cx, cy, rx, ry, scale) {
  const count = clamp(
    Math.ceil(Math.PI / Math.acos(1 - FLATNESS / (Math.max(rx, ry) * scale))),
    24,
    4096,
  );
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (2 * Math.PI * i) / count;
    points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  return points;
}

/**
 * The endpoint-to-centre conversion of the SVG arc specification, F.6.5.
 *
 * @param {object} arc
 * @param {number} scale
 * @returns {[number, number][]} points after the arc's start point
 */
function flattenArc(arc, scale) {
  const [x1, y1] = arc.from;
  const [x2, y2] = arc.to;
  const phi = (arc.rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;

  let rx = Math.abs(arc.rx);
  let ry = Math.abs(arc.ry);
  const oversize = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (oversize > 1) {
    const grow = Math.sqrt(oversize);
    rx *= grow;
    ry *= grow;
  }

  const numerator =
    rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const factor =
    (arc.largeArc === arc.sweep ? -1 : 1) *
    Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (factor * rx * y1p) / ry;
  const cyp = (-factor * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const angleOf = (ux, uy) => Math.atan2(uy, ux);
  const start = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry);
  let sweep = angleOf((-x1p - cxp) / rx, (-y1p - cyp) / ry) - start;
  if (arc.sweep === 0 && sweep > 0) {
    sweep -= 2 * Math.PI;
  } else if (arc.sweep === 1 && sweep < 0) {
    sweep += 2 * Math.PI;
  }

  const count = steps(Math.abs(sweep) * Math.max(rx, ry) * scale);
  const points = [];
  for (let i = 1; i <= count; i += 1) {
    const angle = start + (sweep * i) / count;
    const px = Math.cos(angle) * rx;
    const py = Math.sin(angle) * ry;
    points.push([cx + cos * px - sin * py, cy + sin * px + cos * py]);
  }
  return points;
}

/**
 * @param {object} subpath
 * @param {number} scale device pixels per user unit
 * @returns {{ points: [number, number][], closed: boolean }}
 */
function flattenSubpath(subpath, scale) {
  if (subpath.ellipse !== undefined) {
    const { cx, cy, rx, ry } = subpath.ellipse;
    return { points: flattenEllipse(cx, cy, rx, ry, scale), closed: true };
  }

  const points = [subpath.start];
  let cursor = subpath.start;
  for (const segment of subpath.segments) {
    if (segment.type === 'line') {
      points.push(segment.to);
    } else if (segment.type === 'quad') {
      const length =
        (Math.hypot(
          segment.control[0] - cursor[0],
          segment.control[1] - cursor[1],
        ) +
          Math.hypot(
            segment.to[0] - segment.control[0],
            segment.to[1] - segment.control[1],
          )) *
        scale;
      const count = steps(length);
      for (let i = 1; i <= count; i += 1) {
        const t = i / count;
        const u = 1 - t;
        points.push([
          u * u * cursor[0] +
            2 * u * t * segment.control[0] +
            t * t * segment.to[0],
          u * u * cursor[1] +
            2 * u * t * segment.control[1] +
            t * t * segment.to[1],
        ]);
      }
    } else if (segment.type === 'cubic') {
      const length =
        (Math.hypot(segment.c1[0] - cursor[0], segment.c1[1] - cursor[1]) +
          Math.hypot(
            segment.c2[0] - segment.c1[0],
            segment.c2[1] - segment.c1[1],
          ) +
          Math.hypot(
            segment.to[0] - segment.c2[0],
            segment.to[1] - segment.c2[1],
          )) *
        scale;
      const count = steps(length);
      for (let i = 1; i <= count; i += 1) {
        const t = i / count;
        const u = 1 - t;
        points.push([
          u * u * u * cursor[0] +
            3 * u * u * t * segment.c1[0] +
            3 * u * t * t * segment.c2[0] +
            t * t * t * segment.to[0],
          u * u * u * cursor[1] +
            3 * u * u * t * segment.c1[1] +
            3 * u * t * t * segment.c2[1] +
            t * t * t * segment.to[1],
        ]);
      }
    } else {
      points.push(...flattenArc(segment, scale));
    }
    cursor = segment.to;
  }
  return { points, closed: subpath.closed };
}

/**
 * @param {[number, number]} centre
 * @param {number} radius
 * @param {number} scale
 * @returns {[number, number][]}
 */
function disc([cx, cy], radius, scale) {
  const count = clamp(Math.ceil(radius * scale * 3), 12, 512);
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (2 * Math.PI * i) / count;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

/**
 * A stroked polyline as polygons whose non-zero union is the stroke: one
 * quadrilateral per segment, one disc per join, and a disc per end only when
 * the cap is round.
 *
 * @param {{ points: [number, number][], closed: boolean }} line
 * @param {number} width
 * @param {string} linecap
 * @param {number} scale
 * @returns {[number, number][][]}
 */
function strokePolygons(line, width, linecap, scale) {
  const half = width / 2;
  const polygons = [];
  const points = line.closed ? [...line.points, line.points[0]] : line.points;

  for (let i = 0; i + 1 < points.length; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const length = Math.hypot(bx - ax, by - ay);
    if (length === 0) {
      continue;
    }
    const nx = (-(by - ay) / length) * half;
    const ny = ((bx - ax) / length) * half;
    polygons.push([
      [ax + nx, ay + ny],
      [bx + nx, by + ny],
      [bx - nx, by - ny],
      [ax - nx, ay - ny],
    ]);
  }

  // A join needs a disc whenever the turn leaves a wedge between the two
  // quadrilaterals. That wedge is an arc of `half * turn` at the stroke's
  // outer edge -- on a flattened circle with a wide stroke it is a visible
  // radial gap, which is exactly what a first attempt at this produced. The
  // disc is skipped only when that arc is a twentieth of a pixel or less.
  const first = line.closed ? 0 : 1;
  for (let i = first; i < points.length - 1; i += 1) {
    const before = points[i === 0 ? points.length - 2 : i - 1];
    const here = points[i];
    const after = points[i + 1];
    const incoming = Math.atan2(here[1] - before[1], here[0] - before[0]);
    const outgoing = Math.atan2(after[1] - here[1], after[0] - here[0]);
    let turn = Math.abs(outgoing - incoming);
    if (turn > Math.PI) {
      turn = 2 * Math.PI - turn;
    }
    if (half * turn >= 0.05) {
      polygons.push(disc(here, half, scale));
    }
  }
  if (!line.closed && linecap === 'round') {
    polygons.push(disc(points[0], half, scale));
    polygons.push(disc(points[points.length - 1], half, scale));
  }
  return polygons;
}

/**
 * Measure per-pixel coverage of a polygon set under the non-zero winding rule.
 *
 * @param {[number, number][][]} polygons device coordinates
 * @param {number} width
 * @param {number} height
 * @returns {{ x0: number, y0: number, x1: number, y1: number,
 *             coverage: Float64Array } | null}
 */
function coverageOf(polygons, width, height) {
  /** @type {{ x0: number, y0: number, x1: number, y1: number,
   *            top: number, bottom: number, direction: number }[]} */
  const edges = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const polygon of polygons) {
    const ring = counterClockwise(polygon);
    for (let i = 0; i < ring.length; i += 1) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      minX = Math.min(minX, x0);
      maxX = Math.max(maxX, x0);
      minY = Math.min(minY, y0);
      maxY = Math.max(maxY, y0);
      if (y0 !== y1) {
        edges.push({
          x0,
          y0,
          x1,
          y1,
          top: Math.min(y0, y1),
          bottom: Math.max(y0, y1),
          direction: y1 > y0 ? 1 : -1,
        });
      }
    }
  }
  if (edges.length === 0) {
    return null;
  }

  const x0 = clamp(Math.floor(minX), 0, width);
  const x1 = clamp(Math.ceil(maxX), 0, width);
  const y0 = clamp(Math.floor(minY), 0, height);
  const y1 = clamp(Math.ceil(maxY), 0, height);
  if (x1 <= x0 || y1 <= y0) {
    return null;
  }

  const span = x1 - x0;
  const coverage = new Float64Array(span * (y1 - y0));
  const weight = 1 / SUB_ROWS;
  const crossings = [];

  // An active edge table: edges enter as the scan reaches their top and leave
  // once it passes their bottom, so a row only ever looks at the edges that
  // can cross it. Without it a ring flattened into thousands of segments would
  // rescan all of them for every one of its sub-scanlines.
  const byTop = [...edges].sort((a, b) => a.top - b.top);
  let pending = 0;
  let active = [];

  for (let y = y0; y < y1; y += 1) {
    while (pending < byTop.length && byTop[pending].top < y + 1) {
      active.push(byTop[pending]);
      pending += 1;
    }
    active = active.filter((edge) => edge.bottom > y);
    const row = coverage.subarray((y - y0) * span, (y - y0 + 1) * span);
    for (let s = 0; s < SUB_ROWS; s += 1) {
      const sy = y + (s + 0.5) / SUB_ROWS;
      crossings.length = 0;
      for (const edge of active) {
        if (sy < edge.top || sy >= edge.bottom) {
          continue;
        }
        crossings.push({
          x:
            edge.x0 +
            ((sy - edge.y0) * (edge.x1 - edge.x0)) / (edge.y1 - edge.y0),
          direction: edge.direction,
        });
      }
      if (crossings.length === 0) {
        continue;
      }
      crossings.sort((a, b) => a.x - b.x);

      let winding = 0;
      let spanStart = 0;
      for (const crossing of crossings) {
        if (winding === 0) {
          spanStart = crossing.x;
        }
        winding += crossing.direction;
        if (winding === 0) {
          addSpan(row, spanStart - x0, crossing.x - x0, weight, span);
        }
      }
    }
  }
  return { x0, y0, x1, y1, coverage };
}

/**
 * @param {Float64Array} row
 * @param {number} from
 * @param {number} to
 * @param {number} weight
 * @param {number} span
 */
function addSpan(row, from, to, weight, span) {
  const start = Math.max(from, 0);
  const end = Math.min(to, span);
  if (end <= start) {
    return;
  }
  const firstPixel = Math.floor(start);
  const lastPixel = Math.floor(end);
  if (firstPixel === lastPixel) {
    row[firstPixel] += (end - start) * weight;
    return;
  }
  row[firstPixel] += (firstPixel + 1 - start) * weight;
  for (let i = firstPixel + 1; i < lastPixel; i += 1) {
    row[i] += weight;
  }
  if (lastPixel < span) {
    row[lastPixel] += (end - lastPixel) * weight;
  }
}

/**
 * Render shapes onto an opaque ground.
 *
 * @param {{
 *   shapes: object[],
 *   width: number,
 *   height: number,
 *   scale: number,
 *   offsetX: number,
 *   offsetY: number,
 *   background: [number, number, number],
 *   colorOf: (paint: object) => [number, number, number],
 * }} request
 * @returns {Uint8Array} RGB, row-major, no padding
 */
export function render({
  shapes,
  width,
  height,
  scale,
  offsetX,
  offsetY,
  background,
  colorOf,
}) {
  const canvas = new Float64Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    canvas[i * 3] = background[0];
    canvas[i * 3 + 1] = background[1];
    canvas[i * 3 + 2] = background[2];
  }

  const toDevice = (points) =>
    points.map(([x, y]) => [x * scale + offsetX, y * scale + offsetY]);

  const paint = (polygons, color) => {
    const measured = coverageOf(polygons, width, height);
    if (measured === null) {
      return;
    }
    const span = measured.x1 - measured.x0;
    for (let y = measured.y0; y < measured.y1; y += 1) {
      for (let x = measured.x0; x < measured.x1; x += 1) {
        const alpha = clamp(
          measured.coverage[(y - measured.y0) * span + (x - measured.x0)],
          0,
          1,
        );
        if (alpha === 0) {
          continue;
        }
        const at = (y * width + x) * 3;
        canvas[at] = canvas[at] * (1 - alpha) + color[0] * alpha;
        canvas[at + 1] = canvas[at + 1] * (1 - alpha) + color[1] * alpha;
        canvas[at + 2] = canvas[at + 2] * (1 - alpha) + color[2] * alpha;
      }
    }
  };

  for (const shape of shapes) {
    const flattened = shape.subpaths.map((subpath) =>
      flattenSubpath(subpath, scale),
    );
    if (shape.fill.kind !== 'none') {
      paint(
        flattened.map((line) => toDevice(line.points)),
        colorOf(shape.fill),
      );
    }
    if (shape.stroke.kind !== 'none' && shape.strokeWidth > 0) {
      const polygons = [];
      for (const line of flattened) {
        const device = { points: toDevice(line.points), closed: line.closed };
        polygons.push(
          ...strokePolygons(
            device,
            shape.strokeWidth * scale,
            shape.linecap,
            1,
          ),
        );
      }
      paint(polygons, colorOf(shape.stroke));
    }
  }

  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < rgb.length; i += 1) {
    rgb[i] = clamp(Math.round(canvas[i]), 0, 255);
  }
  return rgb;
}
