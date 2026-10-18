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
  test("accessibility is a review category", () => {
    const { findings, problems } = parseReport(JSON.stringify({ motifReview: 1, findings: [{ id: "F-001", severity: "major", category: "accessibility", location: { screen: "/" }, summary: "No labels." }] }));
    expect(problems).toEqual([]);
    expect(findings.map((f) => f.category)).toEqual(["accessibility"]);
  });

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

  test("file and screen: either one; a finding that names only the screen goes to the model grader to confirm", () => {
    expect(exactFor([finding("contrast", { file: "src/components/PromoBanner.tsx", line: 16 })], "S-12")).toHaveLength(1);
    const byScreen = finding("contrast", { screen: "/", scheme: "light", selector: "p.opacity-40" });
    const g = gradeExact([byScreen], issues, noLines);
    expect(g.exact.find((e) => e.id === "S-12")!.findings).toEqual([]);
    expect(g.candidates.find((c) => c.id === "S-12")!.findings).toEqual([byScreen.id]);
  });

  test("another problem's knock-on on the same screen doesn't count as S-12 by itself", () => {
    // S-11 makes every text-secondary text in light mode fail contrast, on / too.
    const knockOn = finding("contrast", { screen: "/", scheme: "light", selector: "p.text-secondary" });
    const g = gradeExact([knockOn], issues, noLines);
    expect(g.exact.find((e) => e.id === "S-12")!.findings).toEqual([]);
    expect(g.consequences).toEqual([knockOn.id]);
  });

  test("an exact problem already found directly isn't sent to the model grader", () => {
    const direct = finding("target-size", { file: "src/components/PromoBanner.tsx", line: 17 });
    const byScreen = finding("target-size", { screen: "/" }, "minor");
    expect(gradeExact([direct, byScreen], issues, noLines).candidates.find((c) => c.id === "S-13")).toBeUndefined();
  });

  test("the whole app: the category alone", () => {
    expect(exactFor([finding("reduced-motion", { screen: "/products" })], "S-09")).toHaveLength(1);
  });
});

describe("findings written the ways real reviews write them (second eval run)", () => {
  const plain: SeededIssue[] = JSON.parse(readFileSync(join(import.meta.dir, "../../tests/fixtures/plain-seeded-site/seeded-issues.json"), "utf8")).issues;
  const candidatesFor = (fs: Finding[], id: string) => gradeExact(fs, plain, noLines).candidates.find((c) => c.id === id)?.findings ?? [];

  test("a screen with its state written into it is still that screen", () => {
    expect(normScreen("/ (sent)")).toBe("/");
    expect(normScreen("/index.html (no recent)")).toBe("/");
    expect(normScreen("/settings@editor")).toBe("/settings");
    expect(normScreen("/products/[id]")).toBe("/products/[id]");
    // The review's "no way to write another postcard" finding, which the grader didn't offer for P-17.
    const another = finding("missing-state", { file: "app.js", line: 17, screen: "/ (sent)" });
    expect(candidatesFor([another], "P-17")).toEqual([another.id]);
  });

  test("a hand edit to a generated file counts on any line of it (third eval run)", () => {
    // motif check reports P-07 on motif.css's header; the review pointed at the edited line, 39.
    const edited = finding("consistency", { file: "motif.css", line: 39 });
    expect(gradeExact([edited], plain, noLines).exact.find((e) => e.id === "P-07")!.findings).toEqual([edited.id]);
    // Other pinned problems still need their line.
    expect(gradeExact([finding("raw-value", { file: "styles.css", line: 40 })], plain, noLines).exact.find((e) => e.id === "P-01")!.findings).toEqual([]);
  });

  test("a judgement problem also gets the findings filed under other, for the model grader to confirm; exact problems stay strict", () => {
    // Motif has no accessibility category, so the review filed "placeholders instead of labels" (P-15) under other.
    const labels = finding("other", { file: "index.html", line: 29, screen: "/" });
    expect(candidatesFor([labels], "P-15")).toEqual([labels.id]);
    const typed = finding("other", { file: "styles.css", line: 47 });
    const g = gradeExact([typed], plain, noLines);
    expect(g.exact.find((e) => e.id === "P-01")!.findings).toEqual([]);
    expect(g.candidates.find((c) => c.id === "P-01")).toBeUndefined();
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

describe("a plain site's screens", () => {
  test("a folder's index page is the folder", () => {
    for (const s of ["/index.html", "index.html", "/INDEX.HTM", "http://127.0.0.1:5555/index.html?x=1", "/"]) expect(normScreen(s)).toBe("/");
    expect(normScreen("/blog/index.html")).toBe("/blog");
    expect(normScreen("/about.html")).toBe("/about.html");
    expect(sameScreen("/index.html", "/")).toBe(true);
  });
});

describe("matching places (backlog)", () => {
  const finding = (location: object): Finding => ({ id: "F", severity: "minor", category: "spacing", location: location as any, summary: "x" });
  const issue = (over: Partial<SeededIssue> = {}): SeededIssue => ({ id: "S", kind: "exact", detectedBy: "check", categories: ["spacing"], severity: "minor", location: { file: "src/a.tsx", line: 17 }, summary: "x", ...over });
  const none: LineText = () => undefined;

  test("a line range (file:16-17) covers the planted line", () => {
    expect(places(finding({ file: "src/a.tsx:16-17" }))[0]).toMatchObject({ file: "src/a.tsx", line: 16, lineEnd: 17 });
    expect(gradeExact([finding({ file: "src/a.tsx:16-17" })], [issue()], none).exact).toEqual([{ id: "S", findings: ["F"] }]);
  });

  test("a file written from the app's root (/src/a.tsx) is that file", () => {
    expect(places(finding({ file: "/src/a.tsx", line: 17 }), "/work/app")[0]!.file).toBe("src/a.tsx");
    expect(places(finding({ file: "/src/a.tsx", line: 17 }))[0]!.file).toBe("src/a.tsx");
  });

  test("route groups and :param segments are the same screen", () => {
    expect(sameScreen("/(shop)/products/[id]", "/products/oats")).toBe(true);
    expect(sameScreen("/products/:id", "/products/oats")).toBe(true);
    expect(sameScreen("/(shop)/products", "/settings")).toBe(false);
  });

  test("a planted problem can name more than one place: its CSS rule as well as its element", () => {
    const planted = issue({ categories: ["contrast"], location: { file: "index.html", line: 63, screen: "/" }, also: [{ file: "styles.css", line: 55, anchor: "opacity: 0.4" }] });
    const f: Finding = { id: "F", severity: "critical", category: "contrast", location: { file: "styles.css", line: 55 }, summary: "faded" };
    expect(gradeExact([f], [planted], none).exact).toEqual([{ id: "S", findings: ["F"] }]);
  });
});

describe("line ranges (review of batch F)", () => {
  test("a range wider than a few lines points at the file, not at every planted line in it", () => {
    const f: Finding = { id: "F", severity: "minor", category: "raw-value", location: { file: "styles.css:10-50" }, summary: "x" };
    const issue = (id: string, line: number): SeededIssue => ({ id, kind: "exact", detectedBy: "check", categories: ["raw-value"], severity: "minor", location: { file: "styles.css", line }, summary: "x" });
    expect(gradeExact([f], [issue("P-01", 47), issue("P-02", 13)], () => undefined).exact).toEqual([{ id: "P-01", findings: [] }, { id: "P-02", findings: [] }]);
  });
});
