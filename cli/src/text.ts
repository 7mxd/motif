/** Remove a leading UTF-8 byte-order mark, which Windows editors and PowerShell 5.1 often add. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Maps a character index to a 1-based line and column. A CR before LF stays on its line, so CRLF files work. */
export function locator(text: string): (index: number) => { line: number; column: number } {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= index) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: index - starts[lo]! + 1 };
  };
}

/**
 * Whether text read as UTF-8 was really saved as UTF-16 (Windows PowerShell 5.1's > and Out-File save files that way):
 * its byte-order mark reads as two replacement characters, and ASCII letters come with zero bytes between them.
 */
export function savedAsUtf16(text: string): boolean {
  return text.startsWith("\uFFFD\uFFFD") || /\u0000/.test(text.slice(0, 200));
}

export const UTF16_MESSAGE = "This file is saved as UTF-16, not UTF-8 (Windows PowerShell's > saves files that way). Open it in your editor and save it as UTF-8.";

/** "1 file", "3 files". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "A", "A and B", "A, B and C". */
export function andList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
