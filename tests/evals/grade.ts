// Pass or fail for each case, criterion by criterion, with the spec's thresholds (§13.2).

export interface Criterion { id: string; label: string; pass: boolean; detail: string }
export interface Grade { pass: boolean; criteria: Criterion[]; metrics: Record<string, number | string> }

export type CheckFacts = { violations: number; exceptions: number; warnings: number } | { error: string };
export type ValidateFacts = { errors: number; warnings: number; missingSections: string[] } | { error: string };
export interface CmdFacts { code: number; timedOut?: boolean }

const MAX_EXCEPTIONS = 2;

const grade = (criteria: Criterion[], metrics: Grade["metrics"] = {}): Grade => ({ pass: criteria.every((c) => c.pass), criteria, metrics });
const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 1000) / 10);
const ran = (c: CmdFacts, what: string) => (c.code === 0 ? `${what} passed.` : c.timedOut ? `${what} ran out of time.` : `${what} failed (exit code ${c.code}).`);
const missedText = (missed: string[]) => (missed.length ? `; missed ${missed.join(", ")}` : "");

function checkCriteria(check: CheckFacts): Criterion[] {
  if ("error" in check) return [{ id: "check", label: "motif check finds nothing", pass: false, detail: `motif check couldn't run: ${check.error}` }];
  return [
    { id: "check", label: "motif check finds nothing", pass: check.violations === 0 && check.warnings === 0, detail: `${check.violations} problems, ${check.warnings} warnings.` },
    { id: "exceptions", label: `At most ${MAX_EXCEPTIONS} motif-ok exceptions`, pass: check.exceptions <= MAX_EXCEPTIONS, detail: `${check.exceptions} exceptions.` },
  ];
}

function validateCriterion(v: ValidateFacts): Criterion {
  return "error" in v
    ? { id: "validate", label: "The design guide is valid", pass: false, detail: `motif validate couldn't run: ${v.error}` }
    : { id: "validate", label: "The design guide is valid", pass: v.errors === 0, detail: `${v.errors} problems, ${v.warnings} suggestions.` };
}

const buildCriteria = (build: CmdFacts, typecheck: CmdFacts): Criterion[] => [
  { id: "build", label: "The app builds", pass: build.code === 0, detail: ran(build, "The build") },
  { id: "typecheck", label: "The app type-checks", pass: typecheck.code === 0, detail: ran(typecheck, "The type check") },
];

export interface BFacts {
  route: string; pageExists: boolean; check: CheckFacts; validate: ValidateFacts;
  /** React web: the build and the type check. */
  build?: CmdFacts; typecheck?: CmdFacts;
  /** A plain site has nothing to build: its new page, as a browser loads it. */
  render?: ScreenFacts | { error: string };
  /** New components: React files under src/; a plain site's new "Component:" lines. */
  newComponents: string[];
  /** Those named in lines the session added to DESIGN.md (a recorded design guide change). */
  recorded: string[];
}

function renderCriterion(route: string, r: ScreenFacts | { error: string } | undefined): Criterion {
  const label = `The feature's page loads without errors (${route})`;
  if (!r || "error" in r) return { id: "renders", label, pass: false, detail: `motif shot couldn't capture it: ${r?.error ?? "it didn't run"}` };
  const pass = r.status === 200 && r.pageErrors === 0;
  return { id: "renders", label, pass, detail: pass ? "It loads with no page errors." : `Status ${r.status}${r.pageErrors ? `, ${r.pageErrors} page errors` : ""}.` };
}

export function gradeB(f: BFacts): Grade {
  const unrecorded = f.newComponents.filter((c) => !f.recorded.includes(c));
  const recorded = f.newComponents.filter((c) => f.recorded.includes(c));
  return grade([
    { id: "feature", label: `The feature's page exists (${f.route})`, pass: f.pageExists, detail: f.pageExists ? `${f.route} is a page of the app.` : `There's no page at ${f.route}.` },
    ...checkCriteria(f.check),
    validateCriterion(f.validate),
    ...(f.build && f.typecheck ? buildCriteria(f.build, f.typecheck) : [renderCriterion(f.route, f.render)]),
    {
      id: "components", label: "At most one new component, unless recorded in the design guide", pass: unrecorded.length <= 1,
      detail: f.newComponents.length === 0 ? "No new components." : `New: ${f.newComponents.join(", ")}${recorded.length ? ` (recorded in DESIGN.md: ${recorded.join(", ")})` : ""}.`,
    },
  ], { newComponents: f.newComponents.length });
}

export interface CFacts {
  report: { findings: number; problems: string[] } | { error: string };
  exact: { found: string[]; missed: string[] };
  judgement: { found: string[]; missed: string[] };
  /** Critical and major findings in the report. */
  serious: number;
  falseFindings: string[];
  /** Files outside design/ the review changed. */
  changedCode: string[];
}

export function gradeC(f: CFacts): Grade {
  const exactOf = f.exact.found.length + f.exact.missed.length;
  const judgementOf = f.judgement.found.length + f.judgement.missed.length;
  const exactRecall = pct(f.exact.found.length, exactOf);
  const judgementRecall = pct(f.judgement.found.length, judgementOf);
  const falseRate = pct(f.falseFindings.length, f.serious);
  const report: Criterion = "error" in f.report
    ? { id: "report", label: "A review report was written", pass: false, detail: f.report.error }
    : { id: "report", label: "A review report was written", pass: true, detail: `${f.report.findings} findings${f.report.problems.length ? `; left out (not in the review format): ${f.report.problems.join("; ")}` : ""}.` };
  return grade([
    report,
    { id: "exact-recall", label: "Finds at least 90% of the exact problems", pass: exactRecall >= 90, detail: `${f.exact.found.length} of ${exactOf} (${exactRecall}%)${missedText(f.exact.missed)}.` },
    { id: "judgement-recall", label: "Finds at least 70% of the judgement problems", pass: judgementRecall >= 70, detail: `${f.judgement.found.length} of ${judgementOf} (${judgementRecall}%)${missedText(f.judgement.missed)}.` },
    { id: "false-findings", label: "At most 10% of critical and major findings are false", pass: falseRate <= 10, detail: `${f.falseFindings.length} of ${f.serious} (${falseRate}%)${f.falseFindings.length ? `: ${f.falseFindings.join(", ")}` : ""}.` },
    { id: "report-only", label: "The app's code wasn't changed", pass: f.changedCode.length === 0, detail: f.changedCode.length ? `Changed: ${f.changedCode.join(", ")}.` : "Only design/ changed." },
  ], { exactRecall, judgementRecall, falseRate });
}

export interface ScreenFacts { route: string; status: number; pageErrors: number }

export interface DFacts {
  app: string | null; validate: ValidateFacts; check: CheckFacts; sections: { missing: string[]; empty: string[] };
  build: CmdFacts; typecheck: CmdFacts; screens: ScreenFacts[] | { error: string }; routes: string[]; auditFindings?: number;
}

export function gradeD(f: DFacts): Grade {
  if (!f.app) return grade([{ id: "app", label: "The new app exists", pass: false, detail: "No folder with a DESIGN.md was found." }]);
  const shown = "error" in f.screens ? [] : f.screens;
  const bad = f.routes.flatMap((route) => {
    const s = shown.find((x) => x.route === route);
    if (!s) return [`${route} (not captured)`];
    if (s.status !== 200 || s.pageErrors > 0) return [`${route} (status ${s.status}${s.pageErrors ? `, ${s.pageErrors} page errors` : ""})`];
    return [];
  });
  const gaps = [f.sections.missing.length ? `missing: ${f.sections.missing.join(", ")}` : "", f.sections.empty.length ? `empty: ${f.sections.empty.join(", ")}` : ""].filter(Boolean);
  return grade([
    { id: "app", label: "The new app exists", pass: true, detail: f.app },
    validateCriterion(f.validate),
    ...checkCriteria(f.check),
    { id: "sections", label: "DESIGN.md has every section, each filled in", pass: gaps.length === 0, detail: gaps.length ? `${gaps.join("; ")}.` : "All sections are there." },
    ...buildCriteria(f.build, f.typecheck),
    {
      id: "screens", label: `The starter screens render (${f.routes.join(", ")})`, pass: !("error" in f.screens) && bad.length === 0,
      detail: "error" in f.screens ? `motif shot couldn't run: ${f.screens.error}` : bad.length ? `Didn't render: ${bad.join(", ")}.` : "All rendered.",
    },
  ], f.auditFindings !== undefined ? { auditFindings: f.auditFindings } : {});
}
