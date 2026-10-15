// The parts of a stylesheet that apply in dark mode: inside @media (prefers-color-scheme: dark), and rules whose selector
// asks for dark ([data-theme="dark"], [data-mode=dark], .dark). Extract reads a colour's dark value from them.
const DARK_MEDIA = /@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{/gi;
const DARK_SELECTOR = /\[data-(?:theme|mode|color-scheme)\s*=\s*["']?dark["']?\]|\.dark(?![\w-])/;

/** Just past the "}" that closes the block opened at `open` (a "{"), or the end of the text. */
function blockEnd(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i + 1;
  }
  return css.length;
}

export function darkRanges(css: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of css.matchAll(DARK_MEDIA)) {
    const open = m.index! + m[0].length - 1;
    ranges.push([open, blockEnd(css, open)]);
  }
  // A rule's selector runs from the previous "{", "}" or ";" to its "{".
  for (let i = 0; i < css.length; i++) {
    if (css[i] !== "{") continue;
    let s = i - 1;
    while (s >= 0 && css[s] !== "{" && css[s] !== "}" && css[s] !== ";") s--;
    const selector = css.slice(s + 1, i).trim();
    if (!selector.startsWith("@") && DARK_SELECTOR.test(selector)) ranges.push([i, blockEnd(css, i)]);
  }
  return ranges;
}
