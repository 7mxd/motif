// Test C's exact grading: which planted problems a review found, by category and location, following "How a grader reads the list"
// in tests/fixtures/react-seeded-app/README.md. Judgement problems only get candidates here; the model grader (judge.ts) confirms them.
import { isAbsolute, relative } from "node:path";

export const CATEGORIES = [
  "raw-value", "contrast", "target-size", "reduced-motion", "accessibility", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
] as const;
const SEVERITIES = ["critical", "major", "minor"];

export interface Location {
  file?: string; line?: number; screen?: string; scheme?: string; viewport?: string; selector?: string; app?: boolean;
  /** The last line of a range a finding names (file:16-17). */
  lineEnd?: number;
  /** A theme value's path (color.text-secondary), for a problem motif validate reports. */
  path?: string;
}
export interface Consequence { category: string; screens: string[]; schemes: string[]; note: string }
export interface SeededIssue {
  id: string; kind: "exact" | "judgement"; detectedBy: string; rule?: string; categories: string[]; severity: string;
  location: Location; anchor?: string; summary: string; consequences?: Consequence[];
  /** A finding anywhere in the problem's file counts (a hand edit to a generated file, which motif check reports at its header). */
  wholeFile?: boolean;
  /** Other places that are the problem too (the CSS rule behind an element), each with the text its line holds. */
  also?: { file: string; line: number; anchor: string }[];
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
  // A path written from the app's root (/src/app/page.tsx) is that file.
  return f.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/(?!\/)/, "");
}

/**
 * "/products/oats/", "http://localhost:3000/products/oats?x=1", "products/oats" are the same screen; so are "/index.html"
 * and "/". A state written into the screen ("/ (sent)", "/settings@editor") is still that screen.
 */
export function normScreen(screen: string): string {
  let s = screen.trim().replace(/\s*\([^()]*\)$/, "").replace(/@[\w-]+$/, "").replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "");
  if (!s.startsWith("/")) s = `/${s}`;
  // A folder's index page is the folder: a plain site's "/index.html" is "/".
  s = s.replace(/\/index\.html?$/i, "/");
  // A Next.js route group, (shop), isn't part of the address.
  s = s.split("/").filter((seg, i) => i === 0 || !/^\(.+\)$/.test(seg)).join("/") || "/";
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s.toLowerCase() || "/";
}

/** A dynamic segment ([id], [slug], :id) matches any value. */
export function sameScreen(a: string, b: string): boolean {
  const x = normScreen(a).split("/");
  const y = normScreen(b).split("/");
  const dynamic = (s: string) => /^\[.+\]$|^:\w+$/.test(s);
  return x.length === y.length && x.every((s, i) => s === y[i] || dynamic(s) || dynamic(y[i]!));
}

/** The places a finding points at, tidied: files relative to the app, "file:12" split, screens as routes. */
export function places(f: Finding, appRoot?: string): Location[] {
  const all = [f.location, ...(Array.isArray(f.locations) ? f.locations : [])].filter((l): l is Location => typeof l === "object" && l !== null);
  return all.map((l) => {
    const out: Location = { ...l };
    if (typeof l.line === "string") out.line = Number(l.line);
    if (typeof l.file === "string") {
      // "file:12", "file:12:5" or a range, "file:16-17".
      const m = l.line === undefined ? l.file.match(/^(.*?):(\d+)(?:[-–](\d+)|:\d+)?$/) : null;
      out.file = normFile(m ? m[1]! : l.file, appRoot);
      if (m) out.line = Number(m[2]);
      if (m?.[3]) out.lineEnd = Number(m[3]);
    }
    if (typeof l.screen === "string") out.screen = normScreen(l.screen);
    return out;
  });
}

export type LineText = (file: string, line: number) => string | undefined;

/** Whether a place points at a planted problem: file and line (or a line holding the anchor), file alone, screen, either, or the whole app. */
export function pointsAt(issue: SeededIssue, place: Location, lineText: LineText): boolean {
  return how(issue, place, lineText) !== null;
}

/** "place": the whole app, or the problem's file (and line, or a line holding its anchor). "screen": only its screen. */
function how(issue: SeededIssue, place: Location, lineText: LineText): "place" | "screen" | null {
  const L = issue.location;
  if (L.app) return "place";
  // The lines a place covers: one, or a range (capped, so a whole-file range can't match by sheer size).
  const lines = place.line === undefined ? [] : Array.from({ length: Math.min(Math.max((place.lineEnd ?? place.line) - place.line + 1, 1), 50) }, (_, i) => place.line! + i);
  const at = (file: string | undefined, line: number | undefined, anchor: string | undefined) =>
    file !== undefined &&
    place.file === file &&
    (line === undefined || lines.includes(line) || (anchor !== undefined && lines.some((n) => (lineText(file, n) ?? "").includes(anchor))));
  if (L.file && place.file === L.file && issue.wholeFile) return "place";
  if (at(L.file, L.line, issue.anchor)) return "place";
  if ((issue.also ?? []).some((a) => at(a.file, a.line, a.anchor))) return "place";
  return L.screen && place.screen && sameScreen(place.screen, L.screen) ? "screen" : null;
}

/**
 * How a finding matches a problem: in one of its categories, at its place, or only on its screen. With other, a finding
 * the reviewer filed under "other" counts as in any category (the model grader still confirms it).
 */
function match(issue: SeededIssue, f: Finding, lineText: LineText, appRoot?: string, other = false): "place" | "screen" | null {
  if (!issue.categories.includes(f.category) && !(other && f.category === "other")) return null;
  const ways = places(f, appRoot).map((p) => how(issue, p, lineText));
  return ways.includes("place") ? "place" : ways.includes("screen") ? "screen" : null;
}

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
  /**
   * For the model grader to confirm: per judgement problem, the findings in one of its categories that point at its place or screen;
   * and per exact problem not found at its place, the findings that name only its screen (another problem's knock-on can share a screen).
   */
  candidates: { id: string; findings: string[] }[];
  /** Findings that are declared knock-ons: correct, though they find nothing new. */
  consequences: string[];
  /** Critical and major findings that matched no exact problem and no knock-on; the model grader decides if they're real. */
  unmatchedSerious: string[];
}

export function gradeExact(findings: Finding[], issues: SeededIssue[], lineText: LineText, appRoot?: string): ExactGrade {
  const ids = (i: SeededIssue, ways: ("place" | "screen")[], other = false) =>
    findings.filter((f) => ways.includes(match(i, f, lineText, appRoot, other)!)).map((f) => f.id);
  const exactIssues = issues.filter((i) => i.kind === "exact");
  const exact = exactIssues.map((i) => ({ id: i.id, findings: ids(i, ["place"]) }));
  const candidates = [
    // A judgement problem has no one right category, and Motif has none for some problems (accessibility): findings filed
    // under "other" go to the model grader too.
    ...issues.filter((i) => i.kind === "judgement").map((i) => ({ id: i.id, findings: ids(i, ["place", "screen"], true) })),
    ...exactIssues
      .filter((i) => exact.find((e) => e.id === i.id)!.findings.length === 0)
      .map((i) => ({ id: i.id, findings: ids(i, ["screen"]) }))
      .filter((c) => c.findings.length > 0),
  ];
  const found = new Set(exact.flatMap((e) => e.findings));
  const consequences = findings.filter((f) => !found.has(f.id) && isConsequence(f, issues, lineText, appRoot)).map((f) => f.id);
  const settled = new Set([...found, ...consequences]);
  const unmatchedSerious = findings.filter((f) => (f.severity === "critical" || f.severity === "major") && !settled.has(f.id)).map((f) => f.id);
  return { exact, candidates, consequences, unmatchedSerious };
}
