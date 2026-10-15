// Runs Motif's agent evals (tests B, C and D, spec §13.2) through your signed-in Claude Code, one case at a time, and grades them.
// Never an API key; never in CI. See tests/evals/README.md.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CASES, needsBrowser, selectCases, type EvalCase } from "./cases";
import { AGENT_TOOLS, agentArgs, JUDGE_TOOLS, judgeArgs, memoryFiles, personalNames, sessionEnv } from "./claude";
import { collectAndGrade } from "./collect";
import type { Grade } from "./grade";
import { JUDGE_SCHEMA, judgePrompt, Paused, readVerdict, Stopped, type JudgeFn } from "./judge";
import { paths, preflight, type Ready } from "./preflight";
import { renderReport, testVerdicts } from "./report";
import { runSession, type SessionOutcome, type SessionSpec } from "./session";
import { gitState, loadRun, newRunId, remaining, runDir, saveRun, type RunState, type SessionSummary } from "./state";
import { motifRunner, runCmd } from "./tools";
import { prepareWorkspace, removeDir, type Workspace } from "./workspace";

export const USAGE = `Usage: bun tests/evals/run.ts [options]

Runs Motif's agent evals through your signed-in Claude Code (never an API key), one case at a time.

  --list                 List the cases
  --tests B,C,D          Run only these tests
  --cases <id,...>       Run only these cases
  --dry-run              Show each case's prompt and the Claude Code command, without running anything
  --resume <run>         Continue a run that stopped (a usage limit, Ctrl+C)
  --keep                 Keep each case's folder after grading
  --model <name>         The model for the eval sessions (default: your account's)
  --judge-model <name>   The model for test C's grader (default: your account's)
  --max-turns <n>        Cap every case at n turns (for a quick check of the runner)
  --work <folder>        Where case folders go (default: your temp folder)
  --claude <path>        The Claude Code program to use`;

export interface RunDeps {
  preflight(needsBrowser: boolean, claude?: string): Promise<Ready | { error: string }>;
  prepare(c: EvalCase, dir: string): Promise<Workspace>;
  session(spec: SessionSpec): Promise<SessionOutcome>;
  collect(c: EvalCase, ws: Workspace, out: string, judge: JudgeFn): Promise<Grade>;
  purge(claude: string, cwd: string): Promise<void>;
  removeDir(dir: string): void;
  git(): { commit: string; dirty: boolean };
  now(): Date;
  log(line: string): void;
  env: Record<string, string | undefined>;
  /** Instruction files (CLAUDE.md) Claude Code would read in a session below this folder. */
  instructionFiles(dir: string): string[];
  /** The developer's own skills and agents, which no session may load. */
  personal(): string[];
}

const summary = (o: SessionOutcome): SessionSummary => ({
  end: o.end, model: o.init?.model ?? "", turns: o.result?.turns ?? 0, minutes: o.minutes, costUsd: o.result?.costUsd ?? 0, denials: o.result?.denials ?? [], problems: o.problems,
});
const resets = (at?: number) => (at ? ` (it resets ${new Date(at * 1000).toLocaleString()})` : "");
const list = (v: unknown) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

export async function runEvals(argv: string[], deps: RunDeps, where: { repo: string; results: string }): Promise<number> {
  let o: Record<string, string | boolean | undefined>;
  try {
    o = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        list: { type: "boolean" }, tests: { type: "string" }, cases: { type: "string" }, "dry-run": { type: "boolean" }, resume: { type: "string" },
        keep: { type: "boolean" }, model: { type: "string" }, "judge-model": { type: "string" }, "max-turns": { type: "string" },
        work: { type: "string" }, claude: { type: "string" }, help: { type: "boolean" },
      },
    }).values;
  } catch (e) {
    deps.log(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    deps.log(USAGE);
    return 0;
  }
  if (o.list) {
    for (const c of CASES) deps.log(`${c.id.padEnd(16)} ${c.test}  ${c.title}`);
    return 0;
  }
  const p = paths(where.repo);

  let state: RunState;
  if (typeof o.resume === "string") {
    const loaded = loadRun(where.results, o.resume);
    if ("error" in loaded) {
      deps.log(loaded.error);
      return 2;
    }
    state = loaded;
  } else {
    const picked = selectCases(CASES, { tests: list(o.tests), ids: list(o.cases) });
    if ("error" in picked) {
      deps.log(picked.error);
      return 2;
    }
    const maxTurns = o["max-turns"] === undefined ? undefined : Number(o["max-turns"]);
    if (maxTurns !== undefined && !(Number.isInteger(maxTurns) && maxTurns > 0)) {
      deps.log("--max-turns needs a whole number above 0.");
      return 2;
    }
    const id = newRunId(deps.now());
    const git = deps.git();
    state = {
      motifEvalRun: 1, id, commit: git.commit, dirty: git.dirty, started: deps.now().toISOString(), claudeVersion: "", resumes: [],
      options: {
        keep: o.keep === true,
        work: join(typeof o.work === "string" ? resolve(o.work) : join(tmpdir(), "motif-evals"), id),
        ...(typeof o.model === "string" ? { model: o.model } : {}),
        ...(typeof o["judge-model"] === "string" ? { judgeModel: o["judge-model"] } : {}),
        ...(maxTurns ? { maxTurns } : {}),
      },
      cases: Object.fromEntries(picked.map((c) => [c.id, { status: "pending" as const, attempts: 0 }])),
    };
  }

  const todo = remaining(state).map((id) => CASES.find((c) => c.id === id)).filter((c): c is EvalCase => Boolean(c));
  const dir = runDir(where.results, state.id);
  const mcpConfigFile = join(dir, "no-mcp.json");
  const caseArgs = (c: EvalCase) =>
    agentArgs({ pluginDir: p.pluginDir, mcpConfigFile, maxTurns: state.options.maxTurns ?? c.maxTurns, maxBudgetUsd: c.maxBudgetUsd, model: state.options.model });

  if (o["dry-run"]) {
    for (const c of todo) {
      deps.log([
        `\n${c.id}: ${c.title}`,
        `  Folder: ${join(state.options.work, c.id, "app")}`,
        `  Limits: ${state.options.maxTurns ?? c.maxTurns} turns, ${c.minutes} minutes`,
        `  Command: claude ${caseArgs(c).join(" ")}`,
        "  Prompt (on standard input):",
        ...c.prompt.split("\n").map((l) => `    ${l}`),
      ].join("\n"));
    }
    return 0;
  }

  const ready = await deps.preflight(todo.some(needsBrowser), typeof o.claude === "string" ? o.claude : undefined);
  if ("error" in ready) {
    deps.log(ready.error);
    return 2;
  }
  const instructions = deps.instructionFiles(state.options.work);
  if (instructions.length > 0) {
    deps.log(
      `Claude Code would read these instruction files in every eval session: ${instructions.join(", ")}. Move them aside while the evals run, or choose a --work folder outside their reach, then run this again.`,
    );
    return 2;
  }
  const personal = deps.personal();
  const { env, dropped } = sessionEnv(deps.env, p.motifBin);
  if (dropped.length) deps.log(`Leaving these out of the eval sessions' environment: ${dropped.join(", ")}.`);
  if (typeof o.resume === "string") {
    const git = deps.git();
    if (git.commit !== state.commit || git.dirty !== state.dirty) state.resumes.push({ at: deps.now().toISOString(), commit: git.commit, dirty: git.dirty });
  }
  state.claudeVersion = ready.claudeVersion;
  mkdirSync(dir, { recursive: true });
  writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: {} }));
  const save = () => saveRun(where.results, state);
  save();

  const finish = (): number => {
    const verdicts = testVerdicts(state, CASES);
    writeFileSync(join(dir, "report.md"), renderReport(state, CASES, verdicts));
    writeFileSync(join(dir, "report.json"), JSON.stringify({ run: state, verdicts }, null, 2));
    deps.log(`\n${verdicts.map((v) => `${v.test}: ${v.status} — ${v.detail}`).join("\n")}\nReport: ${join(dir, "report.md")}`);
    return Object.values(state.cases).every((c) => c.status === "graded" && c.grade?.pass) ? 0 : 1;
  };
  const pause = (at?: number): number => {
    finish();
    deps.log(`\nPaused: your Claude plan's usage limit was reached${resets(at)}. Continue with: bun tests/evals/run.ts --resume ${state.id}`);
    return 3;
  };

  deps.log(`Run ${state.id}: ${todo.length} cases. Each starts a fresh Claude Code session on your plan. Stop any time with Ctrl+C, then continue with --resume ${state.id}.`);
  for (const c of todo) {
    const cs = state.cases[c.id]!;
    const out = join(dir, c.id);
    mkdirSync(out, { recursive: true });

    if (!(cs.status === "session-done" && cs.workspace && existsSync(cs.workspace.app))) {
      deps.log(`\n${c.id} (${c.title}): preparing its folder…`);
      try {
        cs.workspace = await deps.prepare(c, join(state.options.work, c.id));
      } catch (e) {
        cs.status = "error";
        cs.note = `Couldn't prepare the folder: ${(e as Error).message}`;
        save();
        deps.log(`${c.id}: ${cs.note}`);
        continue;
      }
      cs.attempts += 1;
      delete cs.note;
      save();
      deps.log(`${c.id}: Claude Code is working (up to ${c.minutes} minutes). Everything it does goes to ${join(out, "session.jsonl")}.`);
      const outcome = await deps.session({
        command: [ready.claude], args: caseArgs(c), cwd: cs.workspace.app, env, prompt: c.prompt,
        transcript: join(out, "session.jsonl"), timeoutMs: c.minutes * 60_000, expect: { pluginDir: p.pluginDir, auto: true, tools: AGENT_TOOLS, personal },
      });
      cs.session = summary(outcome);
      await deps.purge(ready.claude, cs.workspace.app);
      if (outcome.end === "not-isolated") {
        cs.status = "error";
        cs.note = outcome.problems.join(" ");
        save();
        deps.log(`\nStopped: ${cs.note}`);
        finish();
        return 2;
      }
      if (outcome.end === "usage-limit") {
        cs.status = "interrupted";
        cs.note = `Usage limit reached${resets(outcome.resetsAt)}.`;
        save();
        return pause(outcome.resetsAt);
      }
      if (!outcome.init) {
        // Claude Code never described the session; every other case would go the same way.
        cs.status = "error";
        cs.note = outcome.problems.join(" ") || "Claude Code didn't start.";
        save();
        deps.log(`\nStopped: ${cs.note}`);
        finish();
        return 2;
      }
      if (outcome.end === "failed") {
        // An API error or a crash part-way says nothing about Motif: not graded, and --resume runs it again.
        cs.status = "error";
        cs.note = `${outcome.problems.join(" ")} Not graded; --resume runs it again.`;
        save();
        deps.log(`${c.id}: ${cs.note}`);
        continue;
      }
      cs.status = "session-done";
      save();
    }

    deps.log(`${c.id}: grading…`);
    const ws = cs.workspace!;
    const judge: JudgeFn = async (input, cwd) => {
      const r = await deps.session({
        command: [ready.claude], args: judgeArgs({ mcpConfigFile, schema: JUDGE_SCHEMA, maxTurns: 40, model: state.options.judgeModel }), cwd, env,
        prompt: judgePrompt(input), transcript: join(out, "judge.jsonl"), timeoutMs: 30 * 60_000, expect: { auto: false, tools: JUDGE_TOOLS, personal },
      });
      await deps.purge(ready.claude, cwd);
      if (r.end === "not-isolated" || !r.init) throw new Stopped(r.problems.join(" ") || "The grader's session didn't start.");
      if (r.end === "usage-limit") return { paused: r.resetsAt ? { resetsAt: r.resetsAt } : {} };
      if (r.end === "finished" && r.result?.structured !== undefined) return { verdict: readVerdict(r.result.structured, input) };
      return { error: r.problems.join(" ") || `the grader's session ended with "${r.end}"` };
    };
    try {
      cs.grade = await deps.collect(c, ws, out, judge);
    } catch (e) {
      if (e instanceof Paused) {
        cs.note = `Grading paused: usage limit reached${resets(e.resetsAt)}.`;
        save();
        return pause(e.resetsAt);
      }
      if (e instanceof Stopped) {
        cs.note = `Grading stopped: ${e.message} The folder is kept; --resume grades it again.`;
        save();
        deps.log(`\nStopped: ${e.message}`);
        finish();
        return 2;
      }
      cs.note = `Grading failed: ${(e as Error).message} The folder is kept; --resume grades it again.`;
      save();
      deps.log(`${c.id}: ${cs.note}`);
      continue;
    }
    cs.status = "graded";
    delete cs.note;
    save();
    if (!state.options.keep) {
      try {
        deps.removeDir(ws.dir);
      } catch (e) {
        deps.log(`${c.id}: Couldn't delete ${ws.dir} (${(e as Error).message}); delete it yourself when nothing is using it.`);
      }
    }
    const failed = cs.grade.criteria.filter((k) => !k.pass).map((k) => k.label);
    deps.log(`${c.id}: ${cs.grade.pass ? "PASS" : `FAIL (${failed.join("; ")})`}`);
  }
  return finish();
}

if (import.meta.main) {
  const repo = resolve(import.meta.dir, "..", "..");
  const p = paths(repo);
  const motif = motifRunner([p.motifBin]);
  const code = await runEvals(
    process.argv.slice(2),
    {
      preflight: (needsBrowser, claude) =>
        preflight(p, needsBrowser, { which: (cmd) => Bun.which(cmd), run: runCmd, env: process.env, bun: process.execPath, ...(claude ? { claudeOverride: resolve(claude) } : {}) }),
      prepare: (c, dir) => prepareWorkspace(c, dir, runCmd),
      session: runSession,
      collect: (c, ws, out, judge) => collectAndGrade(c, ws, out, { run: runCmd, motif, judge }),
      purge: async (claude, cwd) => {
        await runCmd([claude, "purge", "-y", cwd], repo, 60_000);
      },
      removeDir,
      git: () => gitState(repo),
      now: () => new Date(),
      log: (line) => console.log(line),
      env: process.env,
      instructionFiles: (dir) => memoryFiles(dir, homedir()),
      personal: () => personalNames(homedir()),
    },
    { repo, results: join(repo, "tests", "evals", "results") },
  );
  process.exit(code);
}
