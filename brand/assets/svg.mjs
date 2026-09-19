/**
 * Read the identity's vector sources.
 *
 * This is not a general SVG implementation and must not become one. It reads
 * exactly the element set `brand/logo/` uses -- `g` with a translate/scale
 * transform, `circle`, `ellipse`, and `path` -- and throws on anything else,
 * so a future change to a logo file that this reader cannot honour fails the
 * build instead of being silently dropped from a generated asset.
 *
 * Geometry is returned in the root viewBox's coordinates, with group
 * transforms already applied. Curves are kept as curves: how finely they are
 * flattened depends on the size being rendered, which only the rasteriser
 * knows.
 *
 * Paint is returned unresolved, as the reference the file actually carries --
 * a token name, `currentColor`, or a literal. Turning a reference into a value
 * is the build's job, because that is where the token source is read.
 */

const SUPPORTED_ELEMENTS = new Set([
  'svg',
  'title',
  'g',
  'circle',
  'ellipse',
  'path',
]);

const INHERITED = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
];

/**
 * @param {string} text an attribute list, as written in the tag
 * @returns {Record<string, string>}
 */
function parseAttributes(text) {
  /** @type {Record<string, string>} */
  const attributes = {};
  const pattern = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
  let match = pattern.exec(text);
  while (match !== null) {
    attributes[match[1]] = match[2];
    match = pattern.exec(text);
  }
  return attributes;
}

/**
 * Only the transforms the logo files use. A uniform scale is required: the
 * stroke width is a single number, and a non-uniform scale would make it two.
 *
 * @param {string} text
 * @returns {{ tx: number, ty: number, scale: number }}
 */
function parseTransform(text) {
  let tx = 0;
  let ty = 0;
  let scale = 1;
  const pattern = /([a-z]+)\(([^)]*)\)/g;
  let match = pattern.exec(text);
  while (match !== null) {
    const args = match[2]
      .split(/[\s,]+/)
      .filter((part) => part.length > 0)
      .map(Number);
    if (match[1] === 'translate') {
      tx += args[0] * scale;
      ty += (args[1] ?? 0) * scale;
    } else if (match[1] === 'scale') {
      if (args.length > 1 && args[1] !== args[0]) {
        throw new Error(`non-uniform scale in transform "${text}"`);
      }
      scale *= args[0];
    } else {
      throw new Error(`unsupported transform "${match[1]}" in "${text}"`);
    }
    match = pattern.exec(text);
  }
  return { tx, ty, scale };
}

/**
 * @param {string} value
 * @returns {{ kind: 'none' } | { kind: 'current' }
 *   | { kind: 'token', token: string, fallback: string | null }
 *   | { kind: 'literal', value: string }}
 */
export function parsePaint(value) {
  const text = (value ?? 'none').trim();
  if (text === 'none' || text === '') {
    return { kind: 'none' };
  }
  if (text === 'currentColor') {
    return { kind: 'current' };
  }
  const variable = /^var\(\s*--([a-z0-9-]+)\s*(?:,\s*([^)]*?)\s*)?\)$/i.exec(
    text,
  );
  if (variable !== null) {
    return {
      kind: 'token',
      token: variable[1],
      fallback: variable[2] ?? null,
    };
  }
  return { kind: 'literal', value: text };
}

/**
 * Parse a path's `d` attribute into subpaths of curve-preserving segments.
 *
 * @param {string} d
 * @returns {{ start: [number, number], closed: boolean, segments: object[] }[]}
 */
function parsePath(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const subpaths = [];
  let current = null;
  let cursor = [0, 0];
  let startPoint = [0, 0];
  let index = 0;
  let command = '';

  const number = () => {
    const value = Number(tokens[index]);
    index += 1;
    if (!Number.isFinite(value)) {
      throw new Error(`malformed number in path "${d}"`);
    }
    return value;
  };
  const point = (relative) => {
    const x = number();
    const y = number();
    return relative ? [cursor[0] + x, cursor[1] + y] : [x, y];
  };
  const push = (segment) => {
    if (current === null) {
      throw new Error(`path "${d}" draws before its first move`);
    }
    current.segments.push(segment);
  };

  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) {
      command = tokens[index];
      index += 1;
    }
    const relative = command === command.toLowerCase();
    switch (command.toUpperCase()) {
      case 'M': {
        cursor = point(relative);
        startPoint = cursor;
        current = { start: cursor, closed: false, segments: [] };
        subpaths.push(current);
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L': {
        const to = point(relative);
        push({ type: 'line', to });
        cursor = to;
        break;
      }
      case 'H': {
        const x = number();
        const to = [relative ? cursor[0] + x : x, cursor[1]];
        push({ type: 'line', to });
        cursor = to;
        break;
      }
      case 'V': {
        const y = number();
        const to = [cursor[0], relative ? cursor[1] + y : y];
        push({ type: 'line', to });
        cursor = to;
        break;
      }
      case 'Q': {
        const control = point(relative);
        const to = point(relative);
        push({ type: 'quad', control, to });
        cursor = to;
        break;
      }
      case 'C': {
        const c1 = point(relative);
        const c2 = point(relative);
        const to = point(relative);
        push({ type: 'cubic', c1, c2, to });
        cursor = to;
        break;
      }
      case 'A': {
        const rx = number();
        const ry = number();
        const rotation = number();
        const largeArc = number();
        const sweep = number();
        const to = point(relative);
        push({
          type: 'arc',
          rx,
          ry,
          rotation,
          largeArc,
          sweep,
          from: cursor,
          to,
        });
        cursor = to;
        break;
      }
      case 'Z': {
        if (current !== null) {
          current.closed = true;
        }
        cursor = startPoint;
        current = null;
        break;
      }
      default:
        throw new Error(`unsupported path command "${command}" in "${d}"`);
    }
  }
  return subpaths.filter((subpath) => subpath.segments.length > 0);
}

/**
 * @param {object} subpath
 * @param {{ tx: number, ty: number, scale: number }} transform
 * @returns {object}
 */
function transformSubpath(subpath, { tx, ty, scale }) {
  const at = ([x, y]) => [x * scale + tx, y * scale + ty];
  return {
    start: at(subpath.start),
    closed: subpath.closed,
    segments: subpath.segments.map((segment) => {
      switch (segment.type) {
        case 'line':
          return { type: 'line', to: at(segment.to) };
        case 'quad':
          return {
            type: 'quad',
            control: at(segment.control),
            to: at(segment.to),
          };
        case 'cubic':
          return {
            type: 'cubic',
            c1: at(segment.c1),
            c2: at(segment.c2),
            to: at(segment.to),
          };
        default:
          return {
            ...segment,
            rx: segment.rx * scale,
            ry: segment.ry * scale,
            from: at(segment.from),
            to: at(segment.to),
          };
      }
    }),
  };
}

/**
 * Read an SVG source into shapes in root viewBox coordinates.
 *
 * @param {string} source
 * @returns {{ viewBox: { x: number, y: number, width: number, height: number },
 *             shapes: object[] }}
 */
export function readSvg(source) {
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, '');
  const tags = withoutComments.match(/<[^>]*>/g) ?? [];

  /** @type {{ attributes: Record<string, string>,
   *           transform: { tx: number, ty: number, scale: number } }[]} */
  const stack = [{ attributes: {}, transform: { tx: 0, ty: 0, scale: 1 } }];
  const shapes = [];
  let viewBox = null;

  const inherited = () => stack[stack.length - 1].attributes;
  const transform = () => stack[stack.length - 1].transform;

  for (const tag of tags) {
    const parsed = /^<\s*(\/?)\s*([a-zA-Z]+)([\s\S]*?)(\/?)\s*>$/.exec(tag);
    if (parsed === null) {
      continue;
    }
    const [, closing, name, attributeText, selfClosing] = parsed;
    if (!SUPPORTED_ELEMENTS.has(name)) {
      throw new Error(`unsupported SVG element <${name}>`);
    }
    if (closing === '/') {
      if (name === 'g') {
        stack.pop();
      }
      continue;
    }

    const attributes = parseAttributes(attributeText);
    const own = { ...inherited() };
    for (const key of INHERITED) {
      if (attributes[key] !== undefined) {
        own[key] = attributes[key];
      }
    }
    const parentTransform = transform();
    let here = parentTransform;
    if (attributes.transform !== undefined) {
      const local = parseTransform(attributes.transform);
      here = {
        tx: parentTransform.tx + local.tx * parentTransform.scale,
        ty: parentTransform.ty + local.ty * parentTransform.scale,
        scale: parentTransform.scale * local.scale,
      };
    }

    if (name === 'svg') {
      const [x, y, width, height] = attributes.viewBox
        .split(/[\s,]+/)
        .map(Number);
      viewBox = { x, y, width, height };
      continue;
    }
    if (name === 'title') {
      continue;
    }
    if (name === 'g') {
      if (selfClosing !== '/') {
        stack.push({ attributes: own, transform: here });
      }
      continue;
    }

    /** @type {object[]} */
    let subpaths;
    if (name === 'circle' || name === 'ellipse') {
      const rx = Number(name === 'circle' ? attributes.r : attributes.rx);
      const ry = Number(name === 'circle' ? attributes.r : attributes.ry);
      subpaths = [
        {
          ellipse: {
            cx: Number(attributes.cx) * here.scale + here.tx,
            cy: Number(attributes.cy) * here.scale + here.ty,
            rx: rx * here.scale,
            ry: ry * here.scale,
          },
          closed: true,
        },
      ];
    } else {
      subpaths = parsePath(attributes.d).map((subpath) =>
        transformSubpath(subpath, here),
      );
    }

    shapes.push({
      subpaths,
      fill: parsePaint(own.fill),
      stroke: parsePaint(own.stroke),
      strokeWidth: Number(own['stroke-width'] ?? 1) * here.scale,
      linecap: own['stroke-linecap'] ?? 'butt',
    });
  }

  if (viewBox === null) {
    throw new Error('the SVG source carries no viewBox');
  }
  return { viewBox, shapes };
}
