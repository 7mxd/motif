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
  "raw-value", "contrast", "target-size", "reduced-motion", "missing-state", "hierarchy", "spacing", "typography",
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
    const findings = r.data.findings as { code: string; file: string }[];
    for (const issue of byDetector("validate")) {
      expect(findings.some((f) => f.code === issue.rule && f.file === issue.location.file)).toBe(true);
    }
    expect(findings.filter((f) => !byDetector("validate").some((i) => i.rule === f.code))).toEqual([]);
  });

  test("the files the list says to remove are gone", () => {
    for (const path of list.remove as string[]) expect(() => readFileSync(join(dest, path))).toThrow();
  });
});
