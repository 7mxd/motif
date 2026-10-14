// Test C's exact grading: which planted problems a review found, by category and location, following "How a grader reads the list"
// in tests/fixtures/react-seeded-app/README.md. Judgement problems only get candidates here; the model grader (judge.ts) confirms them.
import { isAbsolute, relative } from "node:path";

export const CATEGORIES = [
  "raw-value", "contrast", "target-size", "reduced-motion", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
] as const;
const SEVERITIES = ["critical", "major", "minor"];

export interface Location { file?: string; line?: number; screen?: string; scheme?: string; viewport?: string; selector?: string; app?: boolean }
export interface Consequence { category: string; screens: string[]; schemes: string[]; note: string }
export interface SeededIssue {
  id: string; kind: "exact" | "judgement"; detectedBy: string; rule?: string; categories: string[]; severity: string;
  location: Location; anchor?: string; summary: string; consequences?: Consequence[];
}
export interface Finding { id: string; severity: string; category: string; source?: string; location: Location; locations?: Location[]; summary: string; fix?: string }

/** Reads a review's JSON report; findings that don't follow the format are left out and named. */
export function parseReport(raw: string): { findings: Finding[]; problems: string[] } {
  let doc: any;
  try {
    doc = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (e) {
    return { findings: [], problems: [`The report isn't valid JSON: ${(e as Error).message}`] };
  }
  if (doc?.motifReview !== 1) return { findings: [], problems: ['The report doesn\'t say "motifReview": 1.'] };
  if (!Array.isArray(doc.findings)) return { findings: [], problems: ["The report has no findings list."] };
  const findings: Finding[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  doc.findings.forEach((f: any, i: number) => {
    const wrong: string[] = [];
    if (typeof f?.id !== "string") wrong.push("no id");
    if (!SEVERITIES.includes(f?.severity)) wrong.push(`severity "${f?.severity}"`);
    if (!(CATEGORIES as readonly string[]).includes(f?.category)) wrong.push(`category "${f?.category}"`);
    if (typeof f?.location !== "object" || f.location === null) wrong.push("no location");
    if (typeof f?.summary !== "string") wrong.push("no summary");
    const name = typeof f?.id === "string" ? f.id : `finding ${i + 1}`;
    if (wrong.length) problems.push(`${name}: ${wrong.join(", ")}`);
    else if (seen.has(f.id)) problems.push(`${f.id}: the id is used twice`);
    else {
      seen.add(f.id);
      findings.push(f as Finding);
    }
  });
  return { findings, problems };
}

export function normFile(file: string, appRoot?: string): string {
  let f = file.trim();
  if (appRoot && isAbsolute(f)) {
    const rel = relative(appRoot, f);
    if (!rel.startsWith("..") && !isAbsolute(rel)) f = rel;
  }
  return f.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** "/products/oats/", "http://localhost:3000/products/oats?x=1" and "products/oats" are the same screen. */
export function normScreen(screen: string): string {
  let s = screen.trim().replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "");
  if (!s.startsWith("/")) s = `/${s}`;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s.toLowerCase() || "/";
}

/** A dynamic segment ([id]) matches any value. */
export function sameScreen(a: string, b: string): boolean {
  const x = normScreen(a).split("/");
  const y = normScreen(b).split("/");
  const dynamic = (s: string) => /^\[.+\]$/.test(s);
  return x.length === y.length && x.every((s, i) => s === y[i] || dynamic(s) || dynamic(y[i]!));
}

/** The places a finding points at, tidied: files relative to the app, "file:12" split, screens as routes. */
export function places(f: Finding, appRoot?: string): Location[] {
  const all = [f.location, ...(Array.isArray(f.locations) ? f.locations : [])].filter((l): l is Location => typeof l === "object" && l !== null);
  return all.map((l) => {
    const out: Location = { ...l };
    if (typeof l.line === "string") out.line = Number(l.line);
    if (typeof l.file === "string") {
      const m = l.line === undefined ? l.file.match(/^(.*?):(\d+)(?::\d+)?$/) : null;
      out.file = normFile(m ? m[1]! : l.file, appRoot);
      if (m) out.line = Number(m[2]);
    }
    if (typeof l.screen === "string") out.screen = normScreen(l.screen);
    return out;
  });
}

export type LineText = (file: string, line: number) => string | undefined;

/** Whether a place points at a planted problem: file and line (or a line holding the anchor), file alone, screen, either, or the whole app. */
export function pointsAt(issue: SeededIssue, place: Location, lineText: LineText): boolean {
  const L = issue.location;
  if (L.app) return true;
  let fileOk = false;
  if (L.file && place.file === L.file) {
    if (L.line === undefined || place.line === L.line) fileOk = true;
    else if (place.line !== undefined && issue.anchor) fileOk = (lineText(place.file, place.line) ?? "").includes(issue.anchor);
  }
  const screenOk = Boolean(L.screen && place.screen && sameScreen(place.screen, L.screen));
  return fileOk || screenOk;
}

const matches = (issue: SeededIssue, f: Finding, lineText: LineText, appRoot?: string) =>
  issue.categories.includes(f.category) && places(f, appRoot).some((p) => pointsAt(issue, p, lineText));

/** A knock-on finding the list declares: its category, on one of its screens (and schemes), or at the problem's own place. */
function isConsequence(f: Finding, issues: SeededIssue[], lineText: LineText, appRoot?: string): boolean {
  const ps = places(f, appRoot);
  return issues.some((issue) =>
    (issue.consequences ?? []).some((c) =>
      c.category === f.category &&
      ps.some((p) =>
        (p.screen !== undefined && c.screens.some((s) => sameScreen(p.screen!, s)) && (p.scheme === undefined || c.schemes.includes(String(p.scheme).toLowerCase()))) ||
        pointsAt({ ...issue, location: { ...issue.location, app: false } }, p, lineText))));
}

export interface ExactGrade {
  /** Per exact problem, the findings that found it. */
  exact: { id: string; findings: string[] }[];
  /** Per judgement problem, the findings in one of its categories that point at its place. */
  candidates: { id: string; findings: string[] }[];
  /** Findings that are declared knock-ons: correct, though they find nothing new. */
  consequences: string[];
  /** Critical and major findings that matched no exact problem and no knock-on; the model grader decides if they're real. */
  unmatchedSerious: string[];
}

export function gradeExact(findings: Finding[], issues: SeededIssue[], lineText: LineText, appRoot?: string): ExactGrade {
  const per = (kind: SeededIssue["kind"]) =>
    issues.filter((i) => i.kind === kind).map((i) => ({ id: i.id, findings: findings.filter((f) => matches(i, f, lineText, appRoot)).map((f) => f.id) }));
  const exact = per("exact");
  const candidates = per("judgement");
  const found = new Set(exact.flatMap((e) => e.findings));
  const consequences = findings.filter((f) => !found.has(f.id) && isConsequence(f, issues, lineText, appRoot)).map((f) => f.id);
  const settled = new Set([...found, ...consequences]);
  const unmatchedSerious = findings.filter((f) => (f.severity === "critical" || f.severity === "major") && !settled.has(f.id)).map((f) => f.id);
  return { exact, candidates, consequences, unmatchedSerious };
}
