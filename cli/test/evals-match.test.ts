import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gradeExact, normScreen, parseReport, places, sameScreen, type Finding, type LineText, type SeededIssue } from "../../tests/evals/match";

const SEEDED = join(import.meta.dir, "../../tests/fixtures/react-seeded-app");
const issues: SeededIssue[] = JSON.parse(readFileSync(join(SEEDED, "seeded-issues.json"), "utf8")).issues;
const noLines: LineText = () => undefined;
let n = 0;
const finding = (category: string, location: Finding["location"], severity = "major"): Finding => ({ id: `F-${String(++n).padStart(3, "0")}`, severity, category, source: "exact", location, summary: "x", fix: "y" });
const exactFor = (fs: Finding[], id: string, lineText: LineText = noLines) => gradeExact(fs, issues, lineText).exact.find((e) => e.id === id)!.findings;

describe("reading a review report", () => {
  test("keeps findings in the review format", () => {
    const r = parseReport(JSON.stringify({ motifReview: 1, scope: "whole app", findings: [finding("contrast", { screen: "/" })] }));
    expect(r.findings).toHaveLength(1);
    expect(r.problems).toEqual([]);
  });

  test("names what isn't in the format and leaves it out", () => {
    const r = parseReport(JSON.stringify({ motifReview: 1, findings: [
      { id: "F-1", severity: "high", category: "contrast", location: {}, summary: "x" },
      { id: "F-2", severity: "major", category: "colours", location: {}, summary: "x" },
      { id: "F-3", severity: "minor", category: "copy", location: {}, summary: "x" },
      { id: "F-3", severity: "minor", category: "copy", location: {}, summary: "x" },
    ] }));
    expect(r.findings.map((f) => f.id)).toEqual(["F-3"]);
    const p = r.problems.join("\n");
    expect(p).toContain('severity "high"');
    expect(p).toContain('category "colours"');
    expect(p).toContain("F-3: the id is used twice");
  });

  test("a file that isn't a report", () => {
    expect(parseReport("{").problems[0]).toContain("isn't valid JSON");
    expect(parseReport('{"findings": []}').problems[0]).toContain("motifReview");
    expect(parseReport('{"motifReview": 1}').problems[0]).toContain("no findings list");
  });
});

describe("where a finding points", () => {
  test("screens are routes, however they're written", () => {
    expect(normScreen("http://localhost:3000/products/oats/?x=1")).toBe("/products/oats");
    expect(normScreen("products")).toBe("/products");
    expect(normScreen("/")).toBe("/");
    expect(sameScreen("/products/[id]", "/products/oats")).toBe(true);
    expect(sameScreen("/products", "/products/oats")).toBe(false);
  });

  test("files are relative to the app, with file:line split", () => {
    const app = join(SEEDED, "copy");
    expect(places(finding("raw-value", { file: "src/components/PriceTag.tsx:3" }))[0]).toMatchObject({ file: "src/components/PriceTag.tsx", line: 3 });
    expect(places(finding("raw-value", { file: join(app, "src", "components", "PriceTag.tsx"), line: 3 }), app)[0]!.file).toBe("src/components/PriceTag.tsx");
    expect(places(finding("raw-value", { file: ".\\src\\app\\page.tsx" }))[0]!.file).toBe("src/app/page.tsx");
  });

  test("a finding's extra places count too", () => {
    const f = { ...finding("raw-value", { file: "src/components/PromoBanner.tsx", line: 9 }), locations: [{ file: "src/components/PriceTag.tsx", line: 3 }] };
    expect(exactFor([f], "S-01")).toEqual([f.id]);
    expect(exactFor([f], "S-02")).toEqual([f.id]);
  });
});

describe("the exact problems (README: how a grader reads the list)", () => {
  test("file and line: the finding must point there, in one of the problem's categories", () => {
    expect(exactFor([finding("raw-value", { file: "src/components/PriceTag.tsx", line: 3 })], "S-01")).toHaveLength(1);
    expect(exactFor([finding("contrast", { file: "src/components/PriceTag.tsx", line: 3 })], "S-01")).toHaveLength(0);
    expect(exactFor([finding("raw-value", { file: "src/components/PriceTag.tsx" })], "S-01")).toHaveLength(0);
    expect(exactFor([finding("raw-value", { file: "src/components/PriceTag.tsx", line: 7 })], "S-01")).toHaveLength(0);
  });

  test("…or at a line holding the problem's anchor", () => {
    const lineText: LineText = (f, l) => (f === "src/components/PriceTag.tsx" && l === 4 ? 'className="text-[#2F7D4F]"' : undefined);
    expect(exactFor([finding("raw-value", { file: "src/components/PriceTag.tsx", line: 4 })], "S-01", lineText)).toHaveLength(1);
  });

  test("file alone: anywhere in that file", () => {
    expect(exactFor([finding("contrast", { file: "design/tokens.json", line: 40 })], "S-11")).toHaveLength(1);
  });

  test("file and screen: either one", () => {
    expect(exactFor([finding("contrast", { screen: "/", scheme: "light" })], "S-12")).toHaveLength(1);
    expect(exactFor([finding("contrast", { file: "src/components/PromoBanner.tsx", line: 16 })], "S-12")).toHaveLength(1);
  });

  test("the whole app: the category alone", () => {
    expect(exactFor([finding("reduced-motion", { screen: "/products" })], "S-09")).toHaveLength(1);
  });
});

describe("knock-on findings and the rest", () => {
  test("a declared consequence is correct, not false", () => {
    const f = finding("contrast", { screen: "/products", scheme: "light", selector: "p.caption" });
    const g = gradeExact([f], issues, noLines);
    expect(g.consequences).toEqual([f.id]);
    expect(g.unmatchedSerious).toEqual([]);
  });

  test("…only in the schemes the list names", () => {
    // S-02's banner is a problem only in dark mode.
    expect(gradeExact([finding("contrast", { screen: "/", scheme: "light" })], issues.filter((i) => i.id === "S-02"), noLines).consequences).toEqual([]);
  });

  test("judgement problems get candidates by category and place, for the model grader to confirm", () => {
    const yes = finding("hierarchy", { screen: "/" });
    const no = finding("copy", { screen: "/products" }, "minor");
    expect(gradeExact([yes, no], issues, noLines).candidates.find((c) => c.id === "S-14")!.findings).toEqual([yes.id]);
  });

  test("serious findings that match nothing go to the model grader; minor ones don't count", () => {
    const stray = finding("navigation", { screen: "/settings" }, "critical");
    const small = finding("other", { screen: "/settings" }, "minor");
    expect(gradeExact([stray, small], issues, noLines).unmatchedSerious).toEqual([stray.id]);
  });
});

describe("the seeded list itself", () => {
  test("a review reporting every planted problem where the list says finds all of them", () => {
    const perfect = issues.map((i) => finding(i.categories[0]!, i.location.app ? { screen: "/" } : { ...i.location }, i.severity));
    const g = gradeExact(perfect, issues, noLines);
    expect(g.exact.filter((e) => e.findings.length === 0)).toEqual([]);
    expect(g.candidates.filter((c) => c.findings.length === 0)).toEqual([]);
  });

  test("every judgement problem seen on a screen can be reported by its screen (all but the unknown product)", () => {
    for (const i of issues.filter((x) => x.kind === "judgement" && x.id !== "S-20")) expect(i.location.screen).toBeDefined();
  });
});
