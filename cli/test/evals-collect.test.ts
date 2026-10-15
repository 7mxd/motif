import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../../tests/evals/cases";
import { addedComponents, collectB, collectC, collectD, designSections } from "../../tests/evals/collect";
import { Paused, type JudgeFn } from "../../tests/evals/judge";
import type { SeededIssue } from "../../tests/evals/match";
import { runCmd, type MotifResult, type Run } from "../../tests/evals/tools";
import { prepareWorkspace } from "../../tests/evals/workspace";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");
const byId = (id: string) => CASES.find((c) => c.id === id)!;
const commands: string[][] = [];
// Real git; installs, builds and type checks are stubbed (exit 0) and recorded.
const run: Run = async (cmd, cwd, t, env) => {
  if (cmd[0] === "git") return runCmd(cmd, cwd, t, env);
  commands.push(cmd);
  return { code: 0, stdout: "ok", stderr: "", timedOut: false };
};
const outputs: Record<string, any> = {
  check: { command: "check", ok: true, exitCode: 0, summary: { files: 40, violations: 0, exceptions: 1, warnings: 0 } },
  validate: { command: "validate", ok: true, exitCode: 0, findings: [], summary: { errors: 0, warnings: 0 } },
  shot: {
    command: "shot", ok: false, exitCode: 1, shots: [], findings: [{ id: "F-001" }],
    routes: [{ route: "/", status: 200, shots: [] }, { route: "/sign-in", status: 200, shots: [] }, { route: "/home", status: 200, pageErrors: ["TypeError: x"], shots: [] }],
  },
};
const motif = async (args: string[]): Promise<MotifResult> => ({ code: 0, json: outputs[args[0]!], output: "" });
const noJudge: JudgeFn = async () => ({ error: "the grader wasn't expected here" });

describe("DESIGN.md's sections", () => {
  const ALL = ["1. Brief", "2. Direction", "3. Foundations", "4. Motion", "5. Components", "6. Patterns", "7. Accessibility", "8. Platform notes", "9. Do / Don't", "10. Change log"];
  const md = (body: Record<string, string>) => ["---", "motifContract: 1", "---", "", "Summary.", "", ...Object.entries(body).flatMap(([h, t]) => [`## ${h}`, "", t, ""])].join("\n");

  test("all there and filled in", () => {
    expect(designSections(md(Object.fromEntries(ALL.map((h) => [h, "Text."]))))).toEqual({ missing: [], empty: [] });
  });

  test("missing and empty ones are named; a comment or sub-heading alone is empty", () => {
    const body = Object.fromEntries(ALL.filter((h) => h !== "6. Patterns").map((h) => [h, "Text."]));
    body["4. Motion"] = "<!-- Fill this in -->\n### Springs";
    expect(designSections(md(body))).toEqual({ missing: ["Patterns"], empty: ["Motion"] });
  });

  test("the contract fixture's guide is complete", () => {
    expect(designSections(readFileSync(join(REPO, "tests/fixtures/react-contract-app/DESIGN.md"), "utf8"))).toEqual({ missing: [], empty: [] });
  });
});

describe("test B's measurements", () => {
  test("the page, new components (and which the design guide records), check, validate, build and type check", async () => {
    const ws = await prepareWorkspace(byId("b-settings"), join(tempDir("motif-col-"), "b"), run);
    mkdirSync(join(ws.app, "src/app/settings"), { recursive: true });
    writeFileSync(join(ws.app, "src/app/settings/page.tsx"), "export default function Settings() { return null; }\n");
    writeFileSync(join(ws.app, "src/components/SettingsRow.tsx"), "export function SettingsRow() { return null; }\n");
    writeFileSync(join(ws.app, "src/components/AddressCard.tsx"), "export function AddressCard() { return null; }\n");
    writeFileSync(join(ws.app, "DESIGN.md"), `${readFileSync(join(ws.app, "DESIGN.md"), "utf8")}\n- 2026-10-14 — Added AddressCard for saved addresses — approved by the eval\n`);
    const out = join(ws.dir, "results");
    const f = await collectB(byId("b-settings"), ws, { run, motif, judge: noJudge }, out);
    expect(f).toMatchObject({ route: "/settings", pageExists: true, check: { violations: 0, exceptions: 1, warnings: 0 }, validate: { errors: 0 }, build: { code: 0 }, typecheck: { code: 0 } });
    expect([...f.newComponents].sort()).toEqual(["AddressCard", "SettingsRow"]);
    expect(f.recorded).toEqual(["AddressCard"]);
    expect(commands.some((c) => c.join(" ") === "npm run build")).toBe(true);
    expect(commands.some((c) => c.join(" ") === "npx --no tsc --noEmit")).toBe(true);
    for (const file of ["check.json", "validate.json", "diff.patch", "build.log", "typecheck.log"]) expect(existsSync(join(out, file))).toBe(true);
  });

  test("new components count wherever they are under src/, but not route files, tests or stories", async () => {
    const ws = await prepareWorkspace(byId("b-checkout"), join(tempDir("motif-col-"), "b3"), run);
    const files: Record<string, string> = {
      "src/app/checkout/page.tsx": "export default function Checkout() { return null; }\n",
      "src/app/checkout/layout.tsx": "export default function L({ children }: { children: React.ReactNode }) { return children; }\n",
      "src/app/checkout/_components/Summary.tsx": "export function Summary() { return null; }\n",
      "src/app/checkout/SlotPicker.tsx": "export function SlotPicker() { return null; }\n",
      "src/components/Switch.test.tsx": "export {};\n",
      "src/components/Card.stories.tsx": "export {};\n",
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(ws.app, path, ".."), { recursive: true });
      writeFileSync(join(ws.app, path), text);
    }
    writeFileSync(join(ws.app, "DESIGN.md"), `${readFileSync(join(ws.app, "DESIGN.md"), "utf8")}\n- 2026-10-14 — Added the order summary component — approved by the eval\n`);
    const f = await collectB(byId("b-checkout"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect([...f.newComponents].sort()).toEqual(["SlotPicker", "Summary"]);
    expect(f.recorded).toEqual(["Summary"]);
  });

  test("no page at the feature's route", async () => {
    const ws = await prepareWorkspace(byId("b-search"), join(tempDir("motif-col-"), "b2"), run);
    expect((await collectB(byId("b-search"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"))).pageExists).toBe(false);
  });
});

describe("test C's measurements", () => {
  const seeded: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/react-seeded-app/seeded-issues.json"), "utf8")).issues;
  const perfect = seeded.map((i, n) => ({
    id: `F-${String(n + 1).padStart(3, "0")}`, severity: i.severity, category: i.categories[0], source: i.kind,
    location: i.location.app ? { screen: "/" } : i.location, summary: i.summary, fix: "Fix it.",
  }));
  const writeReport = (app: string, findings: unknown[]) => {
    mkdirSync(join(app, "design/reviews"), { recursive: true });
    writeFileSync(join(app, "design/reviews/2026-10-14-whole-app.json"), JSON.stringify({ motifReview: 1, scope: "whole app", date: "2026-10-14", findings }));
    writeFileSync(join(app, "design/reviews/2026-10-14-whole-app.md"), "# Review\n");
  };
  const confirmAll: JudgeFn = async (input) => ({
    verdict: {
      issues: Object.fromEntries(input.issues.map((x) => [x.issue.id, { findings: x.candidates.map((f) => f.id), why: "" }])),
      unmatched: Object.fromEntries(input.unmatched.map((f) => [f.id, { verdict: "real" as const, why: "" }])),
      notes: [],
    },
  });

  test("a review that reports every planted problem finds them all, with nothing false", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c"), run);
    writeReport(ws.app, perfect);
    const out = join(ws.dir, "results");
    const f = await collectC(byId("c-review"), ws, { run, motif, judge: confirmAll }, out);
    expect(f.exact.missed).toEqual([]);
    expect(f.judgement.missed).toEqual([]);
    expect(f.falseFindings).toEqual([]);
    expect(f.changedCode).toEqual([]);
    expect(f.report).toEqual({ findings: seeded.length, problems: [] });
    for (const file of ["review.json", "review.md", "grading.json", "diff.patch"]) expect(existsSync(join(out, file))).toBe(true);
  });

  test("a finding the grader calls false counts, and changes to the code are listed", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c2"), run);
    writeReport(ws.app, [...perfect, { id: "F-999", severity: "critical", category: "navigation", source: "judgement", location: { screen: "/settings" }, summary: "Settings can't be reached.", fix: "Add it." }]);
    writeFileSync(join(ws.app, "src/app/page.tsx"), "export default function Home() { return null; }\n");
    const judge: JudgeFn = async (input, cwd) => {
      const r = await confirmAll(input, cwd);
      if ("verdict" in r) r.verdict.unmatched["F-999"] = { verdict: "false", why: "There's no settings page in this app." };
      return r;
    };
    const f = await collectC(byId("c-review"), ws, { run, motif, judge }, join(ws.dir, "results"));
    expect(f.falseFindings).toEqual(["F-999"]);
    expect(f.changedCode).toEqual(["src/app/page.tsx"]);
  });

  test("an exact problem named only by its screen counts when the grader confirms it, and not otherwise", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c5"), run);
    const s12 = seeded.findIndex((i) => i.id === "S-12");
    const byScreen = { id: "F-900", severity: "critical", category: "contrast", source: "exact", location: { screen: "/", scheme: "light", selector: "p.opacity-40" }, summary: "The promo's small print is unreadable.", fix: "Use text-secondary at full opacity." };
    writeReport(ws.app, [...perfect.filter((_, n) => n !== s12), byScreen]);
    const out = join(ws.dir, "results");
    expect((await collectC(byId("c-review"), ws, { run, motif, judge: confirmAll }, out)).exact.missed).toEqual([]);
    const decline: JudgeFn = async (input, cwd) => {
      const r = await confirmAll(input, cwd);
      if ("verdict" in r) r.verdict.issues["S-12"] = { findings: [], why: "That finding is about the caption text." };
      return r;
    };
    expect((await collectC(byId("c-review"), ws, { run, motif, judge: decline }, out)).exact.missed).toEqual(["S-12"]);
  });

  test("no report: everything missed", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c3"), run);
    const f = await collectC(byId("c-review"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.report).toEqual({ error: expect.stringContaining("No review report") });
    expect(f.exact.found).toEqual([]);
    expect(f.judgement.missed).toHaveLength(10);
  });

  test("the grader meeting the usage limit pauses grading; a grader that fails is an error", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c4"), run);
    writeReport(ws.app, perfect);
    const out = join(ws.dir, "results");
    await expect(collectC(byId("c-review"), ws, { run, motif, judge: async () => ({ paused: { resetsAt: 1 } }) }, out)).rejects.toBeInstanceOf(Paused);
    await expect(collectC(byId("c-review"), ws, { run, motif, judge: async () => ({ error: "timed out" }) }, out)).rejects.toThrow("timed out");
  });
});

describe("test D's measurements", () => {
  test("finds the new app and measures it, screens included", async () => {
    const ws = await prepareWorkspace(byId("d-stride"), join(tempDir("motif-col-"), "d"), run);
    const app = join(ws.app, "stride");
    mkdirSync(join(app, "node_modules"), { recursive: true });
    writeFileSync(join(app, "DESIGN.md"), readFileSync(join(REPO, "tests/fixtures/react-contract-app/DESIGN.md"), "utf8"));
    writeFileSync(join(app, "package.json"), "{}");
    const out = join(ws.dir, "results");
    const before = commands.length;
    const f = await collectD(byId("d-stride"), ws, { run, motif, judge: noJudge }, out);
    expect(f.app).toBe(app);
    expect(f.sections).toEqual({ missing: [], empty: [] });
    expect(f.screens).toEqual([{ route: "/", status: 200, pageErrors: 0 }, { route: "/sign-in", status: 200, pageErrors: 0 }, { route: "/home", status: 200, pageErrors: 1 }]);
    expect(f.auditFindings).toBe(1);
    expect(commands.slice(before).some((c) => c[1] === "install")).toBe(false); // its packages were installed
    for (const file of ["DESIGN.md", "validate.json", "check.json", "shot.json", "build.log", "typecheck.log"]) expect(existsSync(join(out, file))).toBe(true);
  });

  test("installs the packages when the session didn't", async () => {
    const ws = await prepareWorkspace(byId("d-ledgerly"), join(tempDir("motif-col-"), "d3"), run);
    writeFileSync(join(ws.app, "DESIGN.md"), "");
    const before = commands.length;
    await collectD(byId("d-ledgerly"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(commands.slice(before)).toContainEqual(["npm", "install"]);
  });

  test("no app found", async () => {
    const ws = await prepareWorkspace(byId("d-bloom"), join(tempDir("motif-col-"), "d2"), run);
    expect((await collectD(byId("d-bloom"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"))).app).toBeNull();
  });
});

describe("test B on a plain site", () => {
  test("new components are new Component: lines; an edited one isn't new", () => {
    const diff = [
      "diff --git a/components.css b/components.css",
      "--- a/components.css",
      "+++ b/components.css",
      "-/* Component: Button — actions: primary (default), secondary */",
      "+/* Component: Button — actions: primary (default), secondary, ghost */",
      "+/* Component: MonthGroup — a month's heading and its rows */",
      "+/* Component: Stat — a number with a label */",
    ].join("\n");
    expect(addedComponents(diff)).toEqual(["MonthGroup", "Stat"]);
  });

  test("the page, the page loading in a browser, new components (and which the guide records), check and validate; nothing built", async () => {
    const ws = await prepareWorkspace(byId("b-plain"), join(tempDir("motif-col-"), "bp"), run);
    const before = commands.length;
    writeFileSync(join(ws.app, "history.html"), "<!doctype html><title>History</title>\n");
    writeFileSync(join(ws.app, "components.css"), `${readFileSync(join(ws.app, "components.css"), "utf8")}\n/* Component: MonthGroup — a month's heading and its rows */\n.month-group { display: grid; }\n`);
    writeFileSync(join(ws.app, "DESIGN.md"), `${readFileSync(join(ws.app, "DESIGN.md"), "utf8")}\n- 2026-10-15 — Added MonthGroup for the history page — approved by the eval\n`);
    const saved = outputs.shot;
    outputs.shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "/history.html", status: 200, shots: [] }] };
    try {
      const out = join(ws.dir, "results");
      const f = await collectB(byId("b-plain"), ws, { run, motif, judge: noJudge }, out);
      expect(f).toMatchObject({ route: "/history.html", pageExists: true, render: { route: "/history.html", status: 200, pageErrors: 0 }, newComponents: ["MonthGroup"], recorded: ["MonthGroup"] });
      expect(f.build).toBeUndefined();
      expect(commands.slice(before).some((c) => c.includes("build") || c.includes("tsc") || c[0] === "npm")).toBe(false);
      expect(existsSync(join(out, "shot.json"))).toBe(true);
    } finally {
      outputs.shot = saved;
    }
  });
});

describe("test C on the plain seeded site", () => {
  test("is graded against the site's own list", async () => {
    const seededSite: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/plain-seeded-site/seeded-issues.json"), "utf8")).issues;
    const ws = await prepareWorkspace(byId("c-plain"), join(tempDir("motif-col-"), "cp"), run);
    const p01 = seededSite.find((i) => i.id === "P-01")!;
    mkdirSync(join(ws.app, "design/reviews"), { recursive: true });
    writeFileSync(join(ws.app, "design/reviews/2026-10-15-whole-site.json"), JSON.stringify({ motifReview: 1, scope: "whole site", date: "2026-10-15", findings: [
      { id: "F-001", severity: "major", category: "raw-value", source: "exact", location: p01.location, summary: p01.summary, fix: "Use the border role." },
    ] }));
    const f = await collectC(byId("c-plain"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.exact.found).toEqual(["P-01"]);
    expect(f.exact.missed).toHaveLength(seededSite.filter((i) => i.kind === "exact").length - 1);
    expect(f.judgement.missed).toHaveLength(seededSite.filter((i) => i.kind === "judgement").length);
  });
});
