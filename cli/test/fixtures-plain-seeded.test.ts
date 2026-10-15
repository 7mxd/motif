import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assemble } from "../../tests/fixtures/assemble";
import { runCheck } from "../src/commands/check";
import { runShot } from "../src/commands/shot";
import { runValidate } from "../src/commands/validate";
import { findBrowser } from "../src/detect/browser";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const FIXTURES = join(import.meta.dir, "../../tests/fixtures");
const list = JSON.parse(readFileSync(join(FIXTURES, "plain-seeded-site/seeded-issues.json"), "utf8"));
const CATEGORIES = [
  "raw-value", "contrast", "target-size", "reduced-motion", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
];
type Consequence = { category: string; screens: string[]; schemes: string[]; note: string };
type Issue = {
  id: string; kind: string; detectedBy: string; rule?: string; categories: string[]; severity: string;
  location: { file?: string; line?: number; screen?: string; app?: boolean }; anchor?: string; summary: string; consequences?: Consequence[];
};
const issues: Issue[] = list.issues;
const byDetector = (d: string) => issues.filter((i) => i.detectedBy === d);

describe("the plain seeded site's list of planted problems", () => {
  test("has at least 12 problems: at least 7 the tool can detect and 5 that need judgement", () => {
    expect(issues.length).toBeGreaterThanOrEqual(12);
    expect(issues.filter((i) => i.kind === "exact").length).toBeGreaterThanOrEqual(7);
    expect(issues.filter((i) => i.kind === "judgement").length).toBeGreaterThanOrEqual(5);
  });

  test("at least 7 judgement problems, so the 70% bar allows two misses (5 of 7), close to the React app's three in 10", () => {
    expect(issues.filter((i) => i.kind === "judgement").length).toBeGreaterThanOrEqual(7);
  });

  test("every entry is well formed", () => {
    expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length);
    for (const i of issues) {
      for (const c of i.categories) expect(CATEGORIES).toContain(c);
      expect(["critical", "major", "minor"]).toContain(i.severity);
      expect(Boolean(i.location.file || i.location.screen || i.location.app)).toBe(true);
      expect(i.summary.length).toBeGreaterThan(10);
    }
  });

  test("knock-on findings are declared, so a grader doesn't count them as false", () => {
    for (const id of ["P-02", "P-03", "P-08"]) {
      const issue = issues.find((i) => i.id === id)!;
      expect(issue.consequences?.length ?? 0).toBeGreaterThan(0);
      for (const c of issue.consequences!) {
        expect(CATEGORIES).toContain(c.category);
        expect(c.screens).toEqual(["/"]);
        for (const s of c.schemes) expect(["light", "dark"]).toContain(s);
        expect(c.note.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("the assembled plain seeded site", () => {
  const dest = join(tempDir("motif-plain-seeded-"), "site");
  assemble("plain-seeded-site", dest);
  const at = (rel: string) => readFileSync(join(dest, rel), "utf8").replace(/\r\n/g, "\n");

  test("motif check reports every planted problem at its place, and nothing else", async () => {
    const r = await runCheck(dest, { positionals: [] });
    const found = [...(r.data.violations as { rule: string; file: string; line: number }[]), ...(r.data.warnings as { rule: string; file: string; line: number }[])];
    for (const issue of byDetector("check")) {
      const hit = found.find((h) => h.rule === issue.rule && h.file === issue.location.file && h.line === issue.location.line);
      expect(hit ? issue.id : `${issue.id} not reported`).toBe(issue.id);
    }
    for (const h of found) {
      const planted = byDetector("check").some((i) => i.rule === h.rule && i.location.file === h.file && i.location.line === h.line);
      expect(planted ? "planted" : `unplanned ${h.rule} at ${h.file}:${h.line}`).toBe("planted");
    }
    expect(r.data.exceptions).toEqual([]);
  });

  test("motif validate reports the planted readability problem, and nothing else", async () => {
    const r = await runValidate(dest);
    const findings = r.data.findings as { code: string; file: string }[];
    for (const issue of byDetector("validate")) expect(findings.some((f) => f.code === issue.rule && f.file === issue.location.file)).toBe(true);
    expect(findings.filter((f) => !byDetector("validate").some((i) => i.rule === f.code))).toEqual([]);
  });

  test("every pinned line holds its anchor text", () => {
    for (const issue of issues.filter((i) => i.location.file && i.location.line)) {
      expect(typeof issue.anchor === "string" ? "anchored" : `${issue.id} has no anchor`).toBe("anchored");
      const line = at(issue.location.file!).split("\n")[issue.location.line! - 1] ?? "";
      expect(line.includes(issue.anchor!) ? issue.id : `${issue.id}: "${line.trim()}"`).toBe(issue.id);
    }
  });

  test("it has no state scripts, so a review has to write its own", () => {
    expect(list.remove).toEqual(["design/states/sent.js", "design/states/errors.js", "design/states/empty.js"]);
    expect(existsSync(join(dest, "design/states"))).toBe(false);
  });

  test("nothing else is wrong on purpose: the tip closes, sending works, the plane is hidden from screen readers", () => {
    expect(at("app.js")).toContain('$("tip-close").addEventListener("click", () => $("tip").remove());');
    expect(at("app.js")).toContain("  send();");
    const page = at("index.html");
    for (const s of ['aria-label="Dismiss tip"', 'id="plane" aria-hidden="true"', '<legend class="field-label">Stamp</legend>', 'aria-label="Postcard preview"']) expect(page).toContain(s);
  });

  test("the tests README lists both plain fixtures", () => {
    const readme = readFileSync(join(FIXTURES, "../README.md"), "utf8");
    for (const s of ["fixtures/plain-contract-site/", "fixtures/plain-seeded-site/", "assemble.ts plain-seeded-site"]) expect(readme).toContain(s);
  });
});

describe("the plain seeded site in a browser", () => {
  const browser = findBrowser();
  // What the audit shows of each planted problem it finds: the element's selector or its text.
  const SHOWN: Record<string, string> = { "P-09": "Postage paid by Kitepost", "P-10": "#tip-close", "P-11": "#plane" };

  test.skipIf(!browser)("motif shot --audit finds the planted problems, and everything else is a declared knock-on (needs Chrome, Edge or Chromium)", async () => {
    const dest = join(tempDir("motif-plain-seeded-"), "site");
    assemble("plain-seeded-site", dest);
    mkdirSync(join(dest, "design/states"), { recursive: true });
    writeFileSync(join(dest, "design/states/sent.js"), readFileSync(join(FIXTURES, "plain-contract-site/design/states/sent.js")));
    const r = await runShot(dest, { positionals: [], flags: { audit: true, state: ["design/states/sent.js"] } });
    type Found = { category: string; location: { screen: string; selector: string; scheme?: string }; summary: string };
    const findings = r.data.findings as Found[];
    const shows = (f: Found, id: string) => `${f.location.selector} ${f.summary}`.includes(SHOWN[id]!);
    for (const issue of byDetector("shot")) {
      const seen = findings.some((f) => issue.categories.includes(f.category) && shows(f, issue.id));
      expect(seen ? issue.id : `${issue.id} not reported`).toBe(issue.id);
    }
    for (const f of findings) {
      const planted = byDetector("shot").some((i) => i.categories.includes(f.category) && shows(f, i.id));
      const knockOn = issues.some((i) => (i.consequences ?? []).some((c) => c.category === f.category && c.screens.includes(f.location.screen) && (!f.location.scheme || c.schemes.includes(f.location.scheme))));
      expect(planted || knockOn ? "expected" : `unplanned ${f.category}: ${f.location.selector} ${f.summary}`).toBe("expected");
    }
  }, 300_000);
});
