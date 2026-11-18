// Test A and D: what each brief says every screen must show, so both sides of a pair draw the same content and the
// design is the only difference (docs/specs/2026-11-18-motif-2.0-fair-test-and-rtl-design.md §5.1).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalCase } from "./cases";

/** The first line under every brief's ## Content. */
export const CONTENT_INTRO = "Show exactly this content on these screens: no more items, no fewer, no other actions. How it looks and is laid out is up to you.";

const BRIEFS = join(import.meta.dir, "..", "fixtures", "briefs");

/** The ## Content section's lines, without its heading, or null when the brief has none. */
function contentSection(markdown: string): string[] | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Content\s*$/.test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
}

/**
 * Each `### <Label> (<screen>)` sub-heading under ## Content, keyed by the text in its last parentheses exactly as the
 * case names the screen ("/", "/trips", "Sign in"), with its body trimmed.
 */
export function briefContent(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  const section = contentSection(markdown);
  if (!section) return out;
  let screen: string | null = null;
  let body: string[] = [];
  const flush = () => {
    if (screen !== null) out.set(screen, body.join("\n").trim());
  };
  for (const line of section) {
    const heading = /^###\s+.*\(([^()]+)\)\s*$/.exec(line);
    if (heading) {
      flush();
      screen = heading[1]!.trim();
      body = [];
    } else if (/^###\s/.test(line)) {
      flush();
      screen = null;
    } else if (screen !== null) body.push(line);
  }
  flush();
  return out;
}

/** What tests/fixtures/briefs/<brief>.md says the screen shows, or undefined. */
export function screenContent(brief: string, screen: string, dir = BRIEFS): string | undefined {
  const file = join(dir, `${brief}.md`);
  return existsSync(file) ? briefContent(readFileSync(file, "utf8")).get(screen) : undefined;
}

/** One line per D or A case whose brief has no ## Content, doesn't start it with CONTENT_INTRO, or misses one of its screens. */
export function contentProblems(cases: EvalCase[], dir = BRIEFS): string[] {
  const out: string[] = [];
  for (const c of cases) {
    if ((c.test !== "D" && c.test !== "A") || !c.brief) continue;
    const file = join(dir, `${c.brief}.md`);
    const text = existsSync(file) ? readFileSync(file, "utf8") : "";
    const section = contentSection(text);
    if (!section) {
      out.push(`${c.id}: brief ${c.brief} has no ## Content section.`);
      continue;
    }
    if (section.find((l) => l.trim() !== "")?.trim() !== CONTENT_INTRO) {
      out.push(`${c.id}: brief ${c.brief}'s ## Content doesn't start with: ${CONTENT_INTRO}`);
      continue;
    }
    const content = briefContent(text);
    for (const r of c.routes) {
      if (!content.get(r)) out.push(`${c.id}: brief ${c.brief} has no Content for ${r} (a "### <Label> (${r})" sub-heading under ## Content).`);
    }
  }
  return out;
}
