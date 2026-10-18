import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runValidate } from "../src/commands/validate";
import { assemble } from "../../tests/fixtures/assemble";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const SEEDED = join(import.meta.dir, "../../tests/fixtures/react-seeded-app");
const list = JSON.parse(readFileSync(join(SEEDED, "seeded-issues.json"), "utf8"));
const CATEGORIES = [
  "raw-value", "contrast", "target-size", "reduced-motion", "accessibility", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
];
type Issue = { id: string; kind: string; detectedBy: string; rule?: string; categories: string[]; severity: string; location: { file?: string; line?: number; screen?: string; app?: boolean }; summary: string };
const issues: Issue[] = list.issues;
const byDetector = (d: string) => issues.filter((i) => i.detectedBy === d);

describe("the seeded app's list of planted problems", () => {
  test("has at least 20 problems: at least 12 the tool can detect and 8 that need judgement", () => {
    expect(issues.length).toBeGreaterThanOrEqual(20);
    expect(issues.filter((i) => i.kind === "exact").length).toBeGreaterThanOrEqual(12);
    expect(issues.filter((i) => i.kind === "judgement").length).toBeGreaterThanOrEqual(8);
  });

  test("buttons that only appear on hover count as an accessibility finding too", () => {
    expect(issues.find((i) => i.id === "S-22")!.categories).toContain("accessibility");
  });

  test("every entry is well formed", () => {
    expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length);
    for (const i of issues) {
      expect(i.categories.length).toBeGreaterThan(0);
      for (const c of i.categories) expect(CATEGORIES).toContain(c);
      expect(["critical", "major", "minor"]).toContain(i.severity);
      expect(Boolean(i.location.file || i.location.screen || i.location.app)).toBe(true);
      expect(i.summary.length).toBeGreaterThan(10);
    }
  });

  test("knock-on findings are declared, so a grader doesn't count them as false", () => {
    type Consequence = { category: string; screens: string[]; schemes: string[]; note: string };
    const withConsequences = issues as (Issue & { consequences?: Consequence[] })[];
    for (const id of ["S-01", "S-02", "S-07", "S-08", "S-11"]) {
      const issue = withConsequences.find((i) => i.id === id)!;
      expect(issue.consequences?.length ?? 0).toBeGreaterThan(0);
      for (const c of issue.consequences!) {
        expect(CATEGORIES).toContain(c.category);
        expect(c.screens.length).toBeGreaterThan(0);
        for (const s of c.screens) expect(s.startsWith("/")).toBe(true);
        for (const s of c.schemes) expect(["light", "dark"]).toContain(s);
        expect(c.note.length).toBeGreaterThan(10);
      }
    }
    // S-12 must stand on its own: the faded text is text-primary, which is readable without the fading.
    expect(issues.find((i) => i.id === "S-12")!.location.file).toBe("src/components/PromoBanner.tsx");
  });
});

describe("assemble", () => {
  test("copies only what git keeps, never local leftovers (build output, screenshots, caches)", () => {
    const app = join(import.meta.dir, "../../tests/fixtures/react-contract-app");
    const leftovers = ["stale.tsbuildinfo", ".next/leftover.txt", ".env.local"];
    mkdirSync(join(app, ".next"), { recursive: true });
    for (const file of leftovers) writeFileSync(join(app, file), "local only");
    try {
      const dest = join(tempDir("motif-seeded-"), "app");
      assemble("react-contract-app", dest);
      for (const file of leftovers) expect(existsSync(join(dest, file)) ? `${file} copied` : "skipped").toBe("skipped");
      expect(existsSync(join(dest, "src/components/Button.tsx"))).toBe(true);
    } finally {
      for (const file of leftovers) rmSync(join(app, file), { force: true });
    }
  });

  test("never writes into a folder that already holds something", () => {
    const dest = tempDir("motif-seeded-");
    writeFileSync(join(dest, "keep.txt"), "mine");
    expect(() => assemble("react-seeded-app", dest)).toThrow("isn't empty");
    expect(readFileSync(join(dest, "keep.txt"), "utf8")).toBe("mine");
  });
});

describe("the assembled seeded app", () => {
  const dest = join(tempDir("motif-seeded-"), "app");
  assemble("react-seeded-app", dest);

  test("motif check reports every planted problem at its place, and nothing else", async () => {
    const r = await runCheck(dest, { positionals: [] });
    const found = [...(r.data.violations as { rule: string; file: string; line: number }[]), ...(r.data.warnings as { rule: string; file: string; line: number }[])];
    for (const issue of byDetector("check")) {
      const hit = found.find((h) => h.rule === issue.rule && (issue.location.app || (h.file === issue.location.file && h.line === issue.location.line)));
      expect(hit ? issue.id : `${issue.id} not reported`).toBe(issue.id);
    }
    for (const h of found) {
      const planted = byDetector("check").some((i) => i.rule === h.rule && (i.location.app || (i.location.file === h.file && i.location.line === h.line)));
      expect(planted ? "planted" : `unplanned ${h.rule} at ${h.file}:${h.line}`).toBe("planted");
    }
    expect(r.data.exceptions).toEqual([]);
  });

  test("motif validate reports the planted readability problem in the theme values", async () => {
    const r = await runValidate(dest);
    const findings = r.data.findings as { code: string; file: string; path?: string }[];
    const planted = (f: (typeof findings)[number], i: any) => f.code === i.rule && f.file === i.location.file && f.path === i.location.path;
    for (const issue of byDetector("validate")) {
      expect(findings.some((f) => planted(f, issue))).toBe(true);
    }
    expect(findings.filter((f) => !byDetector("validate").some((i) => planted(f, i)))).toEqual([]);
  });

  test("every pinned line holds its anchor text, so a planted line can't drift unnoticed", () => {
    for (const issue of issues.filter((i) => i.location.file && i.location.line)) {
      expect(typeof (issue as Issue & { anchor?: string }).anchor === "string" ? "anchored" : `${issue.id} has no anchor`).toBe("anchored");
      const line = readFileSync(join(dest, issue.location.file!), "utf8").replace(/\r\n/g, "\n").split("\n")[issue.location.line! - 1] ?? "";
      expect(line.includes((issue as Issue & { anchor: string }).anchor) ? issue.id : `${issue.id}: "${line.trim()}"`).toBe(issue.id);
    }
  });

  test("nothing else is wrong on purpose: stock shows, controls work, every screen has its top bar", () => {
    const at = (rel: string) => readFileSync(join(dest, rel), "utf8").replace(/\r\n/g, "\n");
    const list = at("src/app/products/page.tsx");
    expect(list.split("\n")[16]).not.toContain("{p.unit}");
    expect(list).toContain("aria-label={`Add ${p.name}`}");
    expect(list).toContain('disabled={p.stock === "out"}');
    const banner = at("src/components/PromoBanner.tsx");
    expect(banner).toContain("setShown(false)");
    expect(banner).toContain("focus-visible:outline-focus");
    expect(banner).not.toContain("text-display");
    expect(at("src/app/page.tsx")).toContain('<TopBar title="Home"');
    expect(at("src/app/products/[id]/page.tsx")).toContain('disabled={product.stock === "out"}');
  });

  test("the files the list says to remove are in the contract app, so removing them means something (backlog)", () => {
    const contract = join(import.meta.dir, "../../tests/fixtures/react-contract-app");
    for (const path of list.remove as string[]) expect(existsSync(join(contract, path)) ? path : `${path} isn't in the contract app`).toBe(path);
  });

  test("the files the list says to remove are gone", () => {
    for (const path of list.remove as string[]) expect(() => readFileSync(join(dest, path))).toThrow();
  });
});
