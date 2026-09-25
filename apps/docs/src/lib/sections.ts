/** Splitting Feature 09's copy files into their `##` sections. */

export function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface Section {
  readonly heading: string;
  readonly body: string;
}

/** Split at `## ` lines outside fenced code; the preamble before the first is dropped. */
export function sections(text: string): Section[] {
  const out: Section[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) fenced = !fenced;
    const match = fenced ? null : /^## (.+)$/.exec(line);
    if (match) {
      if (current)
        out.push({
          heading: current.heading,
          body: current.lines.join('\n').trim(),
        });
      current = { heading: match[1] ?? '', lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current)
    out.push({
      heading: current.heading,
      body: current.lines.join('\n').trim(),
    });
  return out;
}

/** Give every `<pre>` without a tabindex one, so a scrolling block is reachable. */
export function focusablePre(html: string): string {
  return html.replace(/<pre(?![^>]*\stabindex=)/g, '<pre tabindex="0"');
}
