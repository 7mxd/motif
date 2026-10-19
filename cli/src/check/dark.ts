// The parts of a stylesheet that apply in dark mode: inside @media (prefers-color-scheme: dark), rules whose selector
// asks for dark ([data-theme="dark"], [data-bs-theme=dark], .dark…), and light-dark()'s second colour. Extract reads a
// colour's dark value from them.
const DARK_MEDIA = /@media([^{]*)prefers-color-scheme\s*:\s*dark[^{]*\{/gi;
const DARK_SELECTOR = /\[data-(?:theme|mode|color-scheme|bs-theme|color-mode)\s*=\s*["']?dark["']?\]|\.dark(?![\w-])/;

/** Just past the "}" that closes the block opened at `open` (a "{"), or the end of the text. */
function blockEnd(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i + 1;
  }
  return css.length;
}

/** :not(…) and :where(:not(…)) say what a rule doesn't apply to: what's inside them isn't asked for. */
function withoutNot(selector: string): string {
  let out = "";
  for (let i = 0; i < selector.length; i++) {
    if (selector.startsWith(":not(", i)) {
      let depth = 0;
      let j = i + 4;
      for (; j < selector.length; j++) {
        if (selector[j] === "(") depth++;
        else if (selector[j] === ")" && --depth === 0) break;
      }
      i = j;
      continue;
    }
    out += selector[i];
  }
  return out;
}

/**
 * A rule for dark mode only: one selector in its list asks for dark, and the others are dark too, by name at least
 * (".dark, .dark-mode"). One plain selector (".card, .dark .card") makes the rule apply in both.
 */
export function isDarkSelector(selector: string): boolean {
  const items = selector.split(",").map((s) => withoutNot(s.trim())).filter(Boolean);
  return items.some((s) => DARK_SELECTOR.test(s)) && items.every((s) => DARK_SELECTOR.test(s) || /dark|night/i.test(s));
}

/** The second colour of each light-dark(light, dark): its dark value. */
function lightDarkRanges(css: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of css.matchAll(/light-dark\(/gi)) {
    let depth = 0;
    let comma = -1;
    for (let i = m.index! + m[0].length - 1; i < css.length; i++) {
      if (css[i] === "(") depth++;
      else if (css[i] === ")" && --depth === 0) {
        if (comma !== -1) ranges.push([comma + 1, i]);
        break;
      } else if (css[i] === "," && depth === 1 && comma === -1) comma = i;
    }
  }
  return ranges;
}

export function darkRanges(css: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of css.matchAll(DARK_MEDIA)) {
    // "@media not (prefers-color-scheme: dark)" is for light.
    if (/\bnot\b/i.test(m[1]!)) continue;
    const open = m.index! + m[0].length - 1;
    ranges.push([open, blockEnd(css, open)]);
  }
  // A rule's selector runs from the previous "{", "}" or ";" to its "{".
  for (let i = 0; i < css.length; i++) {
    if (css[i] !== "{") continue;
    let s = i - 1;
    while (s >= 0 && css[s] !== "{" && css[s] !== "}" && css[s] !== ";") s--;
    const selector = css.slice(s + 1, i).trim();
    if (!selector.startsWith("@") && isDarkSelector(selector)) ranges.push([i, blockEnd(css, i)]);
  }
  return [...ranges, ...lightDarkRanges(css)];
}

// ---------- design variants ----------
// A block that sets a variant: its selector is one thing on the page itself — an attribute with a value ([data-variant="men"],
// [data-gender=male]) or a class (.theme-men, html.men, :root.men) — and it redefines custom properties.
const NOT_VARIANT_ATTR = /^data-(?:theme|mode|color-scheme|bs-theme|color-mode|state)$/i;
const NOT_VARIANT_VALUE = /^(?:light|dark|auto|system)$/i;
const ROOT_TAGS = /^(?:html|body|:root)$/i;

/** A variant id as the design guide spells it: lower-case, kebab-case. */
export function variantId(raw: string): string {
  const id = raw.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return /^[a-z]/.test(id) ? id : `v-${id}`;
}

/** The variant one selector asks for, or undefined (a dark/light switch, a descendant, a plain class). */
function selectorVariant(selector: string): string | undefined {
  const rest = withoutNot(selector.trim());
  // One compound selector: no spaces or combinators outside the brackets.
  if (!rest || /[\s>+~]/.test(rest.replace(/\[[^\]]*\]/g, ""))) return undefined;
  const tag = rest.match(/^(?:html|body|:root)(?![\w-])/i)?.[0];
  let found: string | undefined;
  for (const m of rest.matchAll(/\[\s*([\w-]+)\s*=\s*["']?([^"'\]\s]+)["']?\s*\]/g)) {
    if (!/^data-/i.test(m[1]!) || NOT_VARIANT_ATTR.test(m[1]!) || NOT_VARIANT_VALUE.test(m[2]!)) continue;
    found ??= m[2]!;
  }
  if (found) return variantId(found);
  for (const m of rest.matchAll(/\.([\w-]+)/g)) {
    const name = m[1]!;
    if (/^(?:dark|light)(?:-mode|-theme)?$/i.test(name) || /^dark|night/i.test(name)) continue;
    // A bare class names a variant only as theme-<id>; on html, body or :root any class does.
    if (/^theme-./i.test(name)) return variantId(name.replace(/^theme-/i, ""));
    if (tag && ROOT_TAGS.test(tag)) return variantId(name);
  }
  return undefined;
}

/** The blocks that set a design variant's custom properties, with the variant's id. */
export function variantRanges(css: string): { id: string; range: [number, number] }[] {
  const out: { id: string; range: [number, number] }[] = [];
  for (let i = 0; i < css.length; i++) {
    if (css[i] !== "{") continue;
    let s = i - 1;
    while (s >= 0 && css[s] !== "{" && css[s] !== "}" && css[s] !== ";") s--;
    const selector = css.slice(s + 1, i).trim();
    if (!selector || selector.startsWith("@")) continue;
    const end = blockEnd(css, i);
    // It must redefine custom properties.
    if (!/(?:^|[;{\s])--[\w-]+\s*:/.test(css.slice(i + 1, end))) continue;
    for (const item of selector.split(",")) {
      const id = selectorVariant(item);
      if (id) {
        out.push({ id, range: [i, end] });
        break;
      }
    }
  }
  return out;
}

/** The id of the variant block a place is in, if any (the innermost). */
export function variantAt(index: number, ranges: { id: string; range: [number, number] }[]): string | undefined {
  let best: { id: string; range: [number, number] } | undefined;
  for (const r of ranges) if (index >= r.range[0] && index < r.range[1] && (!best || r.range[0] > best.range[0])) best = r;
  return best?.id;
}
