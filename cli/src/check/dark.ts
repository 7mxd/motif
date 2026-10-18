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
