import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8").replace(/\r\n/g, "\n");

describe("plain web in the design docs", () => {
  test("decision 0004 records why plain web came first and what it decided", () => {
    const decision = read("docs/decisions/0004-plain-web.md");
    for (const s of ["# 0004 — Plain web is the first Part 2 adapter", "Status: Accepted", "xBloom Recolor", "site folder", "two views", "--bg: var(--motif-color-background)", "--state", "360, 390 and 430", "b-plain", "c-plain"]) {
      expect(decision).toContain(s);
    }
  });

  test("the core spec names plain web, its rules, --state, the five screenshot sizes and the plain eval cases, and points at the decision", () => {
    const spec = read("docs/specs/2026-10-12-motif-core-design.md");
    for (const s of ["Plain web (HTML and CSS) first", "0004-plain-web.md", "plain web, the ninth", "`--state <file.js>`", "a tablet (768 px)", "at every screenshot size", "the two `tailwind-*` rules don't apply", "`b-plain`", "`c-plain`"]) {
      expect(spec).toContain(s);
    }
  });

  test("the plain web spec is approved and names its plans", () => {
    expect(read("docs/specs/2026-10-15-motif-plain-web-design.md")).toContain("- Status: Approved 2026-10-15; built by Plans 2A and 2B");
  });
});
