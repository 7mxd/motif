// Measures what a finished case left behind: the motif tool's checks, the build and the type check, what the session changed,
// and for test C the review report, graded against the seeded list (match.ts) and by the model grader (judge.ts).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { REQUIRED_SECTIONS } from "../../cli/src/contract/design-md";
import { discoverRoutes } from "../../cli/src/stacks/react-web/routes";
import type { EvalCase } from "./cases";
import { gradeB, gradeC, gradeD, type BFacts, type CFacts, type CheckFacts, type CmdFacts, type DFacts, type Grade, type ValidateFacts } from "./grade";
import { Paused, type JudgeFn, type JudgeInput, type JudgeVerdict } from "./judge";
import { gradeExact, parseReport, type SeededIssue } from "./match";
import { packageManager, type Motif, type MotifResult, type Run } from "./tools";
import { changes, findApp, patch, type Workspace } from "./workspace";

export interface Collectors { run: Run; motif: Motif; judge: JudgeFn }

const SEEDED = join(import.meta.dir, "..", "fixtures", "react-seeded-app", "seeded-issues.json");

const save = (out: string, name: string, data: unknown) => writeFileSync(join(out, name), typeof data === "string" ? data : JSON.stringify(data, null, 2));

const checkFacts = (r: MotifResult): CheckFacts =>
  r.json?.summary ? { violations: r.json.summary.violations, exceptions: r.json.summary.exceptions, warnings: r.json.summary.warnings } : { error: String(r.json?.error ?? r.output) };

const validateFacts = (r: MotifResult): ValidateFacts =>
  r.json?.summary
    ? { errors: r.json.summary.errors, warnings: r.json.summary.warnings, missingSections: (r.json.findings ?? []).filter((x: any) => x.code === "missing-section").map((x: any) => String(x.message)) }
    : { error: String(r.json?.error ?? r.output) };

async function motifJson(k: Collectors, args: string[], cwd: string, out: string, name: string, timeoutMs?: number): Promise<MotifResult> {
  const r = await k.motif(args, cwd, timeoutMs);
  save(out, name, r.json ?? { output: r.output });
  return r;
}

async function buildAndTypecheck(dir: string, k: Collectors, out: string): Promise<{ build: CmdFacts; typecheck: CmdFacts }> {
  const build = await k.run([packageManager(dir), "run", "build"], dir, 900_000);
  save(out, "build.log", `${build.stdout}\n${build.stderr}`);
  const typecheck = await k.run(["npx", "--no", "tsc", "--noEmit"], dir, 600_000);
  save(out, "typecheck.log", `${typecheck.stdout}\n${typecheck.stderr}`);
  return { build: { code: build.code, timedOut: build.timedOut }, typecheck: { code: typecheck.code, timedOut: typecheck.timedOut } };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Next's route files, tests and stories aren't components; any other .tsx or .jsx file under src/ is, wherever it sits. */
const ROUTE_FILES = new Set(["page", "layout", "loading", "error", "global-error", "not-found", "template", "default", "route", "opengraph-image", "twitter-image", "icon", "apple-icon"]);
const isComponentFile = (path: string) =>
  /^src\/.+\.(tsx|jsx)$/.test(path) && !/\.(test|spec|stories|d)\.(tsx|jsx)$/.test(path) && !ROUTE_FILES.has(basename(path, extname(path)));

export async function collectB(c: EvalCase, ws: Workspace, k: Collectors, out: string): Promise<BFacts> {
  mkdirSync(out, { recursive: true });
  const route = c.routes[0]!;
  // What changed is read before the build, which may touch files of its own.
  const changed = await changes(ws, k.run);
  save(out, "diff.patch", await patch(ws, k.run));
  const newComponents = changed.filter((x) => x.status === "added" && isComponentFile(x.path)).map((x) => basename(x.path, extname(x.path)));
  const added = (await patch(ws, k.run, ["DESIGN.md"])).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).join("\n");
  const recorded = newComponents.filter((n) => new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(added));
  const check = await motifJson(k, ["check"], ws.app, out, "check.json");
  const validate = await motifJson(k, ["validate"], ws.app, out, "validate.json");
  const { build, typecheck } = await buildAndTypecheck(ws.app, k, out);
  return {
    route, pageExists: discoverRoutes(ws.app).routes.includes(route), check: checkFacts(check), validate: validateFacts(validate),
    build, typecheck, newComponents, recorded,
  };
}

function newestReport(app: string): string | null {
  const dir = join(app, "design", "reviews");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

/** What a report-only review may change: its report, screenshots and notes in design/, and files agents keep for themselves. */
const reviewMayChange = (path: string) => path.startsWith("design/") || path.startsWith(".claude/") || path === "AGENTS.md" || path === "CLAUDE.md";

export async function collectC(_c: EvalCase, ws: Workspace, k: Collectors, out: string): Promise<CFacts> {
  mkdirSync(out, { recursive: true });
  const issues: SeededIssue[] = JSON.parse(readFileSync(SEEDED, "utf8")).issues;
  const exactIds = issues.filter((i) => i.kind === "exact").map((i) => i.id);
  const judgementIds = issues.filter((i) => i.kind === "judgement").map((i) => i.id);
  const changed = await changes(ws, k.run);
  save(out, "diff.patch", await patch(ws, k.run));
  const changedCode = changed.map((x) => x.path).filter((p) => !reviewMayChange(p));

  const file = newestReport(ws.app);
  if (!file) {
    return {
      report: { error: "No review report was written (design/reviews/*.json)." },
      exact: { found: [], missed: exactIds }, judgement: { found: [], missed: judgementIds }, serious: 0, falseFindings: [], changedCode,
    };
  }
  for (const ext of [".json", ".md"]) {
    const f = file.replace(/\.json$/, ext);
    if (existsSync(f)) copyFileSync(f, join(out, `review${ext}`));
  }
  const audit = join(ws.app, "design", "shots", "audit.json");
  if (existsSync(audit)) copyFileSync(audit, join(out, "audit.json"));

  const { findings, problems } = parseReport(readFileSync(file, "utf8"));
  const lineText = (path: string, line: number) => {
    try {
      return readFileSync(join(ws.app, path), "utf8").split(/\r?\n/)[line - 1];
    } catch {
      return undefined;
    }
  };
  const g = gradeExact(findings, issues, lineText, ws.app);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const input: JudgeInput = {
    issues: g.candidates.filter((x) => x.findings.length > 0).map((x) => ({ issue: issues.find((i) => i.id === x.id)!, candidates: x.findings.map((id) => byId.get(id)!) })),
    unmatched: g.unmatchedSerious.map((id) => byId.get(id)!),
  };
  let verdict: JudgeVerdict = { issues: {}, unmatched: {}, notes: [] };
  if (input.issues.length + input.unmatched.length > 0) {
    const r = await k.judge(input, ws.app);
    if ("paused" in r) throw new Paused(r.paused.resetsAt);
    if ("error" in r) throw new Error(`The grader couldn't finish: ${r.error}`);
    verdict = r.verdict;
  }
  const confirmed = new Set(Object.values(verdict.issues).flatMap((v) => v.findings));
  const confirmedFor = (id: string) => (verdict.issues[id]?.findings.length ?? 0) > 0;
  const judgementFound = judgementIds.filter(confirmedFor);
  // An exact problem counts when found at its place, or when the grader confirms a finding that named only its screen.
  const exactFound = exactIds.filter((id) => g.exact.find((e) => e.id === id)!.findings.length > 0 || confirmedFor(id));
  const falseFindings = g.unmatchedSerious.filter((id) => !confirmed.has(id) && verdict.unmatched[id]?.verdict !== "real");
  save(out, "grading.json", { ...g, judge: verdict });
  return {
    report: { findings: findings.length, problems },
    exact: { found: exactFound, missed: exactIds.filter((id) => !exactFound.includes(id)) },
    judgement: { found: judgementFound, missed: judgementIds.filter((id) => !judgementFound.includes(id)) },
    serious: findings.filter((f) => f.severity === "critical" || f.severity === "major").length,
    falseFindings,
    changedCode,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();

/** Which of DESIGN.md's sections are missing, and which hold nothing but comments or sub-headings. */
export function designSections(md: string): { missing: string[]; empty: string[] } {
  const lines = md.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n?/g, "\n").split("\n");
  const heads = lines.flatMap((l, i) => {
    const m = l.match(/^##\s+(?:\d+\.\s*)?(.+?)\s*#*\s*$/);
    return m ? [{ i, name: norm(m[1]!) }] : [];
  });
  const missing: string[] = [];
  const empty: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    const at = heads.findIndex((h) => h.name === norm(section));
    if (at === -1) {
      missing.push(section);
      continue;
    }
    const body = lines.slice(heads[at]!.i + 1, heads[at + 1]?.i ?? lines.length).filter((l) => l.trim() !== "" && !/^#{1,6}\s/.test(l));
    if (body.length === 0) empty.push(section);
  }
  return { missing, empty };
}

function copyShots(app: string, json: any, dest: string): void {
  const shots: unknown[] = Array.isArray(json?.shots) ? json.shots : [];
  for (const s of shots) {
    if (typeof s !== "string" || !existsSync(join(app, s))) continue;
    mkdirSync(dest, { recursive: true });
    copyFileSync(join(app, s), join(dest, basename(s)));
  }
}

export async function collectD(c: EvalCase, ws: Workspace, k: Collectors, out: string): Promise<DFacts> {
  mkdirSync(out, { recursive: true });
  const app = findApp(ws.app);
  if (!app) {
    const none = { error: "no app" };
    return { app: null, validate: none, check: none, sections: { missing: [...REQUIRED_SECTIONS], empty: [] }, build: { code: 1 }, typecheck: { code: 1 }, screens: none, routes: c.routes };
  }
  for (const f of ["DESIGN.md", "design/tokens.json"]) if (existsSync(join(app, f))) copyFileSync(join(app, f), join(out, basename(f)));
  if (!existsSync(join(app, "node_modules"))) {
    const r = await k.run([packageManager(app), "install"], app, 900_000);
    save(out, "install.log", `${r.stdout}\n${r.stderr}`);
  }
  const validate = await motifJson(k, ["validate"], app, out, "validate.json");
  const check = await motifJson(k, ["check"], app, out, "check.json");
  const sections = designSections(existsSync(join(app, "DESIGN.md")) ? readFileSync(join(app, "DESIGN.md"), "utf8") : "");
  const { build, typecheck } = await buildAndTypecheck(app, k, out);
  const shot = await motifJson(k, ["shot", "--audit", "--routes", c.routes.join(",")], app, out, "shot.json", 900_000);
  copyShots(app, shot.json, join(out, "shots"));
  const screens = Array.isArray(shot.json?.routes)
    ? shot.json.routes.map((r: any) => ({ route: String(r.route), status: Number(r.status ?? 0), pageErrors: Array.isArray(r.pageErrors) ? r.pageErrors.length : 0 }))
    : { error: String(shot.json?.error ?? shot.output) };
  return {
    app, validate: validateFacts(validate), check: checkFacts(check), sections, build, typecheck, screens, routes: c.routes,
    ...(Array.isArray(shot.json?.findings) ? { auditFindings: shot.json.findings.length } : {}),
  };
}

export async function collectAndGrade(c: EvalCase, ws: Workspace, out: string, k: Collectors): Promise<Grade> {
  if (c.test === "B") return gradeB(await collectB(c, ws, k, out));
  if (c.test === "C") return gradeC(await collectC(c, ws, k, out));
  return gradeD(await collectD(c, ws, k, out));
}
