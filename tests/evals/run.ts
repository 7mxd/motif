// Runs Motif's agent evals (tests B, C and D, spec §13.2, and Test A's builds without Motif, Part 4 §4) through your signed-in
// Claude Code, one case at a time, and grades them. Never an API key; never in CI. See tests/evals/README.md.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { agentSettings, changedSettings } from "./agents";
import { CASES, isAngular, isBaseline, isCompose, isFlutter, isReactNative, isSvelte, isSwiftUI, isVue, macOnly, macOnlyNote, needsAngular21, needsAngular22, needsBrowser, needsNode, needsSvelteKit3, needsVite8, pairedCase, selectCases, type EvalCase } from "./cases";
import { AGENT_TOOLS, agentArgs, JUDGE_EXPECTED_TOOLS, judgeArgs, memoryFiles, personalNames, sessionEnv, withTempFolder } from "./claude";
import { collectAndGrade, componentFacts } from "./collect";
import { componentsCriterion, type Grade } from "./grade";
import { JUDGE_SCHEMA, judgePrompt, Paused, readVerdict, Stopped, type JudgeFn } from "./judge";
import { JUDGE_A_EXPECTED_TOOLS, JUDGE_A_SCHEMA, JUDGE_A_TOOLS, judgeAPrompt, judgePairs, missingJudgements, readPick, type BriefParts, type JudgeAOutcome } from "./judge-a";
import { pairBrief } from "./pairs";
import { paths, preflight, type NodeNeeds, type Ready } from "./preflight";
import { NO_PURGE_NOTE, removeProjectData } from "./purge";
import { renderReport, testVerdicts } from "./report";
import { runSession, type SessionOutcome, type SessionSpec } from "./session";
import { gitState, loadRun, newRunId, remaining, reserveRunId, runDir, saveRun, type RunState, type SessionSummary } from "./state";
import { motifRunner, runCmd } from "./tools";
import { prepareWorkspace, removeDir, type Workspace } from "./workspace";

export const USAGE = `Usage: bun tests/evals/run.ts [options]

Runs Motif's agent evals through your signed-in Claude Code (never an API key), one case at a time.

  --list                 List the cases
  --tests A,B,C,D        Run only these tests (A: each D brief built without Motif)
  --cases <id,...>       Run only these cases
  --dry-run              Show each case's prompt and the Claude Code command, without running anything
  --resume <run>         Continue a run that stopped (a usage limit, Ctrl+C)
  --regrade <run>        Grade a run's B cases again with this checkout's new-component rule, from their saved
                         diffs; nothing else is run or changed (use it once the run has finished)
  --keep                 Keep each case's folder after grading
  --model <name>         The model for the eval sessions (default: your account's)
  --judge-model <name>   The model for test C's grader and Test A's judges (default: your account's)
  --max-turns <n>        Cap every case at n turns (for a quick check of the runner)
  --work <folder>        Where case folders go (default: ~/.motif-evals)
  --claude <path>        The Claude Code program to use`;

export interface RunDeps {
  preflight(needsBrowser: boolean, claude?: string, needsFlutter?: boolean, needsAndroid?: boolean, needsXcode?: boolean, needsNode?: boolean, nodeNeeds?: NodeNeeds): Promise<Ready | { error: string }>;
  prepare(c: EvalCase, dir: string): Promise<Workspace>;
  session(spec: SessionSpec): Promise<SessionOutcome>;
  collect(c: EvalCase, ws: Workspace, out: string, judge: JudgeFn): Promise<Grade>;
  /** Clears Claude Code's saved data for a folder; says why when it couldn't. */
  purge(claude: string, cwd: string): Promise<string | void>;
  /** For a Claude Code without `claude purge`: removes that folder's saved transcripts itself; says why when it couldn't. */
  removeData(cwd: string): string | void;
  removeDir(dir: string): void;
  git(): { commit: string; dirty: boolean };
  now(): Date;
  log(line: string): void;
  env: Record<string, string | undefined>;
  /** Instruction files (CLAUDE.md) Claude Code would read in a session below this folder. */
  instructionFiles(dir: string): string[];
  /** The developer's own skills and agents, which no session may load. */
  personal(): string[];
  /** The MCP servers in the developer's coding agents' user settings, which no session may change. */
  agentSettings(): Record<string, string | null>;
  /** The platform the evals run on (this one when not given): off macOS, the Mac-only cases are skipped. */
  platform?: NodeJS.Platform;
  /**
   * Test A: runs once a brief's d-* and a-* cases are both graded, with both apps' folders still there; they're removed
   * after it (unless --keep). Test A's screenshots of both apps are taken here, into the run's folder (`out`). A line it
   * returns is logged.
   */
  afterBriefPair?(brief: string, withMotif: Workspace, without: Workspace, out: string): Promise<string | void>;
}

/** An argument as a shell reads it: quoted when it holds spaces, brackets, commas or wildcards. */
const shellWord = (a: string) => (/[\s()*,"']/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

const summary = (o: SessionOutcome): SessionSummary => ({
  end: o.end, model: o.init?.model ?? "", turns: o.result?.turns ?? 0, minutes: o.minutes, costUsd: o.result?.costUsd ?? 0, denials: o.result?.denials ?? [], problems: o.problems,
});
const resets = (at?: number) => (at ? ` (it resets ${new Date(at * 1000).toLocaleString()})` : "");
const list = (v: unknown) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

export async function runEvals(argv: string[], deps: RunDeps, where: { repo: string; results: string; /** Where case folders go without --work. */ work: string }): Promise<number> {
  let o: Record<string, string | boolean | undefined>;
  try {
    o = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        list: { type: "boolean" }, tests: { type: "string" }, cases: { type: "string" }, "dry-run": { type: "boolean" }, resume: { type: "string" }, regrade: { type: "string" },
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
    for (const c of CASES) deps.log(`${c.id.padEnd(18)} ${c.test}  ${c.title}`);
    return 0;
  }
  if (typeof o.regrade === "string") return regrade(o.regrade, deps, where);
  const p = paths(where.repo);

  let state: RunState;
  /** A new run's id without its "-2" (null when resuming). */
  let idBase: string | null = null;
  if (typeof o.resume === "string") {
    const loaded = loadRun(where.results, o.resume);
    if ("error" in loaded) {
      deps.log(loaded.error);
      return 2;
    }
    state = loaded;
    const options = ["--keep", "--model", "--judge-model", "--max-turns", "--tests", "--cases", "--work"];
    const ignored = [...new Set(argv.map((a) => a.split("=")[0]!).filter((a) => options.includes(a)))];
    if (ignored.length) {
      deps.log(`--resume uses the options the run started with, so it leaves out ${ignored.length === 1 ? ignored[0] : `${ignored.slice(0, -1).join(", ")} and ${ignored.at(-1)}`}.`);
    }
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
    // Two runs started in the same second each get their own id (one started at the same moment is settled when its
    // folder is made, below).
    idBase = newRunId(deps.now());
    let id = idBase;
    for (let n = 2; existsSync(runDir(where.results, id)); n++) id = `${idBase}-${n}`;
    const git = deps.git();
    state = {
      motifEvalRun: 1, id, commit: git.commit, dirty: git.dirty, started: deps.now().toISOString(), claudeVersion: "", resumes: [],
      options: {
        keep: o.keep === true,
        work: join(typeof o.work === "string" ? resolve(o.work) : where.work, id),
        ...(typeof o.model === "string" ? { model: o.model } : {}),
        ...(typeof o["judge-model"] === "string" ? { judgeModel: o["judge-model"] } : {}),
        ...(maxTurns ? { maxTurns } : {}),
      },
      cases: Object.fromEntries(picked.map((c) => [c.id, { status: "pending" as const, attempts: 0 }])),
    };
  }

  // Off macOS the Mac-only cases (SwiftUI) are skipped with the reason (spec §9) and recorded as skipped, so the
  // verdicts leave them out and name them; on a Mac, resuming the run gives each back what it was (a finished session
  // is graded from its kept folder, not run again).
  const platform = deps.platform ?? process.platform;
  if (platform === "darwin") {
    for (const cs of Object.values(state.cases)) {
      if (cs.status !== "skipped") continue;
      cs.status = cs.skippedFrom ?? "pending";
      if (cs.noteBefore === undefined) delete cs.note;
      else cs.note = cs.noteBefore;
      delete cs.skippedFrom;
      delete cs.noteBefore;
    }
  }
  const here = macOnly(remaining(state).map((id) => CASES.find((c) => c.id === id)).filter((c): c is EvalCase => Boolean(c)), platform);
  const todo = here.run;
  // Test A: briefs whose two apps were both graded but whose screenshots weren't taken (the step failed, or was cut off):
  // --resume takes them, from the folders kept for it: only briefs whose two cases this run chose, and not a Mac-only
  // brief off a Mac.
  const unpaired = CASES.filter((d) => d.test === "D" && d.brief && d.id in state.cases && (platform === "darwin" || !d.mac)).flatMap((d) => {
    const a = pairedCase(d);
    const ds = state.cases[d.id];
    const as = a ? state.cases[a.id] : undefined;
    return a && ds?.status === "graded" && as?.status === "graded" && !state.pairs?.[d.brief!]?.done ? [{ d, a }] : [];
  });
  /**
   * Records the skipped cases with why, under the run's settled id (the note says how to resume it on a Mac), keeping
   * everything they had: a finished session's folder and summary, and the status and note to give back on a Mac.
   */
  const markSkipped = () => {
    for (const c of here.skipped) {
      const prev = state.cases[c.id] ?? { status: "pending" as const, attempts: 0 };
      if (prev.status === "skipped") continue;
      const { note, ...rest } = prev;
      state.cases[c.id] = {
        ...rest, status: "skipped", note: macOnlyNote(state.id, prev.status === "session-done"),
        ...(prev.status !== "pending" ? { skippedFrom: prev.status } : {}), ...(note !== undefined ? { noteBefore: note } : {}),
      };
    }
  };
  // Test A: judgements a paused run hadn't made yet (a new run has none).
  const unjudged = typeof o.resume === "string" ? missingJudgements(runDir(where.results, state.id)).length : 0;
  if (here.skipped.length > 0) {
    deps.log(here.reason);
    if (todo.length === 0 && unpaired.length === 0 && unjudged === 0) {
      deps.log("Nothing is left to run here.");
      // A new run doesn't start; a resumed one is done here, and its report says what's left for a Mac.
      if (idBase !== null || o["dry-run"]) return 2;
      markSkipped();
      saveRun(where.results, state);
      return writeReport(state, runDir(where.results, state.id), deps);
    }
  }
  let dir = runDir(where.results, state.id);
  let mcpConfigFile = join(dir, "no-mcp.json");
  // Test A's sessions load no plugin at all: not Motif's, and (as in every session) not the developer's. Their empty MCP
  // list is in their own case folder, not in this checkout's results, so no path in their arguments is Motif's.
  const caseMcpConfig = (c: EvalCase) => (isBaseline(c) ? join(state.options.work, c.id, "no-mcp.json") : mcpConfigFile);
  const caseArgs = (c: EvalCase) =>
    agentArgs({ ...(isBaseline(c) ? {} : { pluginDir: p.pluginDir }), mcpConfigFile: caseMcpConfig(c), maxTurns: state.options.maxTurns ?? c.maxTurns, maxBudgetUsd: c.maxBudgetUsd, model: state.options.model });

  if (o["dry-run"]) {
    for (const c of todo) {
      deps.log([
        `\n${c.id}: ${c.title}`,
        `  Folder: ${join(state.options.work, c.id, "app")}`,
        `  Limits: ${state.options.maxTurns ?? c.maxTurns} turns, ${c.minutes} minutes`,
        `  Command: claude ${caseArgs(c).map(shellWord).join(" ")}`,
        "  Prompt (on standard input):",
        ...c.prompt.split("\n").map((l) => `    ${l}`),
      ].join("\n"));
    }
    return 0;
  }

  // What the pair steps left to take need too: they draw both apps.
  const needs = [...todo, ...unpaired.flatMap((u) => [u.d, u.a])];
  const ready = await deps.preflight(needs.some(needsBrowser), typeof o.claude === "string" ? o.claude : undefined, needs.some(isFlutter), needs.some(isCompose), needs.some(isSwiftUI), needs.some(needsNode), { vite8: needs.some(needsVite8), svelteKit3: needs.some(needsSvelteKit3), angular21: needs.some(needsAngular21), angular22: needs.some(needsAngular22) });
  if ("error" in ready) {
    deps.log(ready.error);
    return 2;
  }
  // For Test A's judges, declared below.
  const claude = ready.claude;
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
  // A Test A session has no Motif to point at, nor to keep from connecting anything: nothing in its environment names Motif.
  const baselineEnv = Object.fromEntries(Object.entries(env).filter(([k]) => !/^MOTIF_/i.test(k)));
  if (typeof o.resume === "string") {
    const git = deps.git();
    if (git.commit !== state.commit || git.dirty !== state.dirty) state.resumes.push({ at: deps.now().toISOString(), commit: git.commit, dirty: git.dirty });
  }
  state.claudeVersion = ready.claudeVersion;
  if (idBase !== null) {
    // Another run started at the same moment can have found the same id free: the first to make its folder keeps it.
    const id = reserveRunId(where.results, idBase);
    if (id !== state.id) {
      state.options.work = join(dirname(state.options.work), id);
      state.id = id;
      dir = runDir(where.results, id);
      mcpConfigFile = join(dir, "no-mcp.json");
    }
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: {} }));
  markSkipped();
  const save = () => saveRun(where.results, state);
  save();

  const finish = (): number => writeReport(state, dir, deps);
  const purge = async (cwd: string) => {
    const why = ready.purge ? await deps.purge(ready.claude, cwd) : deps.removeData(cwd);
    if (why) deps.log(`Couldn't clear Claude Code's saved data for ${cwd}: ${why}`);
  };
  const pause = (at?: number): number => {
    finish();
    deps.log(`\nPaused: your Claude plan's usage limit was reached${resets(at)}. Continue with: bun tests/evals/run.ts --resume ${state.id}`);
    return 3;
  };

  deps.log(`Run ${state.id}: ${todo.length} cases. Each starts a fresh Claude Code session on your plan. Stop any time with Ctrl+C, then continue with --resume ${state.id}.`);
  if (!ready.purge) deps.log(NO_PURGE_NOTE);
  for (const { d, a } of unpaired) {
    const dWs = state.cases[d.id]!.workspace;
    const aWs = state.cases[a.id]!.workspace;
    if (!dWs || !aWs || !existsSync(dWs.dir) || !existsSync(aWs.dir)) {
      deps.log(`${d.brief}: Test A's screenshots weren't taken, and the folders of ${d.id} and ${a.id} are gone, so they can't be now.`);
      continue;
    }
    deps.log(`\n${d.brief}: taking Test A's screenshots of ${d.id} and ${a.id}, which weren't taken before…`);
    if (await pairStep(d, a, dWs, aWs)) {
      removeCase(d.id, dWs);
      removeCase(a.id, aWs);
    }
  }
  // Test A's pairs left unjudged (a usage limit paused the run part-way), and those of the briefs just paired.
  const judgeFailed = new Set<string>();
  const stoppedJudging = await judgeStep();
  if (stoppedJudging !== undefined) return stoppedJudging;
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
      if (isBaseline(c)) writeFileSync(caseMcpConfig(c), JSON.stringify({ mcpServers: {} }));
      const before = deps.agentSettings();
      const outcome = await deps.session({
        command: [ready.claude], args: caseArgs(c), cwd: cs.workspace.app, env: withTempFolder(isBaseline(c) ? baselineEnv : env, join(cs.workspace.dir, "tmp")), prompt: c.prompt,
        transcript: join(out, "session.jsonl"), timeoutMs: c.minutes * 60_000,
        expect: { ...(isBaseline(c) ? {} : { pluginDir: p.pluginDir }), auto: true, tools: AGENT_TOOLS, personal },
      });
      cs.session = summary(outcome);
      await purge(cs.workspace.app);
      // A file mid-write can't be read: look again a moment later before comparing.
      let after = deps.agentSettings();
      if (Object.values(after).includes(null)) {
        await Bun.sleep(500);
        after = deps.agentSettings();
      }
      const changed = changedSettings(before, after);
      if (changed.length) {
        cs.status = "error";
        cs.note = `The session changed your coding agents' settings: ${changed.join(", ")}. An eval session must never do that. Check their MCP servers (motif doctor lists the design sources), then run this again.`;
        save();
        deps.log(`\nStopped: ${cs.note}`);
        finish();
        return 2;
      }
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
    // The grader works from a folder of its own and reads the app from there: nothing the session left in the app (a
    // CLAUDE.md, .claude/ settings) reaches it.
    const judge: JudgeFn = async (input, app) => {
      // Inside the case's folder, so it goes when the case does.
      const own = join(ws.dir, "grader");
      mkdirSync(own, { recursive: true });
      // A session may have written a CLAUDE.md above it: the grader would read it.
      const instructions = deps.instructionFiles(own);
      if (instructions.length > 0) throw new Stopped(`The grader would read these instruction files: ${instructions.join(", ")}. Move them aside, then --resume.`);
      const r = await deps.session({
        command: [ready.claude], args: judgeArgs({ mcpConfigFile, schema: JUDGE_SCHEMA, maxTurns: 40, model: state.options.judgeModel, appDir: app }), cwd: own, env: withTempFolder(env, join(own, "tmp")),
        prompt: judgePrompt(input, undefined, app, isCompose(c) ? "Jetpack Compose app" : isFlutter(c) ? "Flutter app" : isReactNative(c) ? "Expo (React Native) app" : isVue(c) ? "Vue app" : isSvelte(c) ? "Svelte app" : isAngular(c) ? "Angular app" : isSwiftUI(c) ? "SwiftUI app" : "web app"), transcript: join(out, "judge.jsonl"), timeoutMs: 30 * 60_000, expect: { auto: false, tools: JUDGE_EXPECTED_TOOLS, personal },
      });
      await purge(own);
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
    await settleFolder(c, ws);
    const failed = cs.grade.criteria.filter((k) => !k.pass).map((k) => k.label);
    deps.log(`${c.id}: ${cs.grade.pass ? "PASS" : `FAIL (${failed.join("; ")})`}`);
    // Once a brief is paired, its pairs are judged.
    const stopped = await judgeStep();
    if (stopped !== undefined) return stopped;
  }
  return finish();

  /**
   * Test A's AI judges: every pair still missing a judgement is judged, each saved as it's made. Returns the exit code
   * when the run must stop here: a usage limit pauses it (--resume judges only what's left), and a judge that wasn't
   * isolated stops it. A judgement that couldn't be made is said and left for --resume.
   */
  async function judgeStep(): Promise<number | undefined> {
    const left = missingJudgements(dir).filter(({ pair, order }) => !judgeFailed.has(`${pair.id} ${order}`)).length;
    if (left === 0) return undefined;
    deps.log(`\nTest A: ${left} ${left === 1 ? "judgement" : "judgements"} to make, each a read-only Claude Code session comparing two screenshots…`);
    try {
      const r = await judgePairs(dir, judgeA, { skip: judgeFailed, log: deps.log });
      deps.log(`Test A: ${r.judged} of ${left} ${left === 1 ? "judgement" : "judgements"} made.`);
    } catch (e) {
      if (e instanceof Paused) return pause(e.resetsAt);
      if (e instanceof Stopped) {
        deps.log(`\nStopped: ${e.message}`);
        finish();
        return 2;
      }
      throw e;
    }
    return undefined;
  }

  /**
   * One of Test A's judgements, in a folder of its own outside the run's and the cases' folders, holding nothing but the
   * two images as left.png and right.png: no name, path or file the judge can reach says which app either came from. Its
   * empty MCP list and its temp folder sit beside it, out of its reach; it goes once the judge is done.
   */
  async function judgeA(images: { left: string; right: string }, brief: BriefParts, name: string): Promise<JudgeAOutcome> {
    let root = mkdtempSync(join(tmpdir(), "judge-"));
    // Its random part never happens to spell a side.
    while (/motif|base/i.test(basename(root))) {
      rmSync(root, { recursive: true, force: true });
      root = mkdtempSync(join(tmpdir(), "judge-"));
    }
    try {
      const own = join(root, "screens");
      mkdirSync(own);
      writeFileSync(join(own, "left.png"), readFileSync(images.left));
      writeFileSync(join(own, "right.png"), readFileSync(images.right));
      const mcp = join(root, "no-mcp.json");
      writeFileSync(mcp, JSON.stringify({ mcpServers: {} }));
      const instructions = deps.instructionFiles(own);
      if (instructions.length > 0) throw new Stopped(`A judge would read these instruction files: ${instructions.join(", ")}. Move them aside, then --resume.`);
      const r = await deps.session({
        command: [claude], args: judgeArgs({ mcpConfigFile: mcp, schema: JUDGE_A_SCHEMA, maxTurns: 10, model: state.options.judgeModel, tools: JUDGE_A_TOOLS }),
        cwd: own, env: withTempFolder(baselineEnv, join(root, "tmp")), prompt: judgeAPrompt(brief), transcript: join(dir, "a", "judges", `${name}.jsonl`),
        timeoutMs: 10 * 60_000, expect: { auto: false, tools: JUDGE_A_EXPECTED_TOOLS, personal },
      });
      await purge(own);
      if (r.end === "not-isolated" || !r.init) throw new Stopped(r.problems.join(" ") || "A judge's session didn't start.");
      if (r.end === "usage-limit") return { paused: r.resetsAt ? { resetsAt: r.resetsAt } : {} };
      const answer = r.end === "finished" ? readPick(r.result?.structured) : null;
      if (answer) return answer;
      return { error: r.end === "finished" ? "it didn't answer left, right or tie." : `${r.problems.join(" ") || `its session ended with "${r.end}"`}.` };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  /** A graded case's folder, removed unless --keep. */
  function removeCase(id: string, ws: Workspace): void {
    if (state.options.keep) return;
    try {
      deps.removeDir(ws.dir);
    } catch (e) {
      deps.log(`${id}: Couldn't delete ${ws.dir} (${(e as Error).message}); delete it yourself when nothing is using it.`);
    }
  }

  /**
   * After a case is graded: its folder goes, unless this run has its brief's other side (Test A compares a brief's two
   * apps). Then it stays until the other is graded too; once both are, Test A's step runs with both, and both go.
   */
  async function settleFolder(c: EvalCase, ws: Workspace): Promise<void> {
    const partner = pairedCase(c);
    const ps = partner ? state.cases[partner.id] : undefined;
    if (!partner || !ps) return removeCase(c.id, ws);
    if (ps.status !== "graded" || !ps.workspace) {
      deps.log(
        `${c.id}: keeping its folder (${ws.dir}) for Test A until ${partner.id} is graded too; then both are compared${state.options.keep ? "" : " and removed"}. If ${partner.id} never is, --resume this run to finish it, or delete the folder yourself.`,
      );
      return;
    }
    const [d, a] = isBaseline(c) ? [partner, c] : [c, partner];
    const [dWs, aWs] = isBaseline(c) ? [ps.workspace, ws] : [ws, ps.workspace];
    if (!(await pairStep(d, a, dWs, aWs))) return;
    removeCase(d.id, dWs);
    removeCase(a.id, aWs);
  }

  /** Test A's step for a brief's two graded apps, recorded in the run: whether it went through (else both folders stay). */
  async function pairStep(d: EvalCase, a: EvalCase, dWs: Workspace, aWs: Workspace): Promise<boolean> {
    const brief = d.brief!;
    state.pairs ??= {};
    try {
      const said = await deps.afterBriefPair?.(brief, dWs, aWs, dir);
      if (said) deps.log(said);
    } catch (e) {
      const why = (e as Error).message;
      state.pairs[brief] = { done: false, note: why };
      save();
      deps.log(`${d.id} and ${a.id}: Test A's step after both were graded failed (${why}); both folders are kept. --resume runs it again.`);
      return false;
    }
    state.pairs[brief] = { done: true };
    save();
    return true;
  }
}

/**
 * report.md and report.json for the run as it stands; the exit code is 0 only when every case passed, leaving out the
 * Mac-only ones skipped here, as the verdicts do. A Test A case only needs to be graded: an app built without Motif
 * that doesn't build or render isn't a failure of the run, and Test A counts its screens as lost pairs.
 */
function writeReport(state: RunState, dir: string, deps: RunDeps): number {
  const verdicts = testVerdicts(state, CASES);
  writeFileSync(join(dir, "report.md"), renderReport(state, CASES, verdicts));
  writeFileSync(join(dir, "report.json"), JSON.stringify({ run: state, verdicts }, null, 2));
  deps.log(`\n${verdicts.map((v) => `${v.test}: ${v.status} — ${v.detail}`).join("\n")}\nReport: ${join(dir, "report.md")}`);
  const baseline = (id: string) => CASES.some((c) => c.id === id && isBaseline(c));
  return Object.entries(state.cases).filter(([, c]) => c.status !== "skipped").every(([id, c]) => c.status === "graded" && (c.grade?.pass || baseline(id))) ? 0 : 1;
}

/** --regrade: each graded B case's new-component criterion again, from its saved diff; every other criterion stands. */
function regrade(id: string, deps: RunDeps, where: { repo: string; results: string }): number {
  const state = loadRun(where.results, id);
  if ("error" in state) {
    deps.log(state.error);
    return 2;
  }
  const dir = runDir(where.results, id);
  for (const c of CASES.filter((x) => x.test === "B")) {
    const cs = state.cases[c.id];
    if (cs?.status !== "graded" || !cs.grade) continue;
    const file = join(dir, c.id, "diff.patch");
    if (!existsSync(file)) {
      deps.log(`${c.id}: no saved diff, so it keeps its grade.`);
      continue;
    }
    const facts = componentFacts(c, readFileSync(file, "utf8"));
    const k = componentsCriterion(facts);
    const criteria = cs.grade.criteria.some((x) => x.id === k.id) ? cs.grade.criteria.map((x) => (x.id === k.id ? k : x)) : [...cs.grade.criteria, k];
    cs.grade = { pass: criteria.every((x) => x.pass), criteria, metrics: { ...cs.grade.metrics, newComponents: facts.newComponents.length } };
    deps.log(`${c.id}: ${cs.grade.pass ? "PASS" : "FAIL"} — ${k.detail}`);
  }
  const git = deps.git();
  state.regrades = [...(state.regrades ?? []), { at: deps.now().toISOString(), commit: git.commit, dirty: git.dirty }];
  saveRun(where.results, state);
  return writeReport(state, dir, deps);
}

if (import.meta.main) {
  const repo = resolve(import.meta.dir, "..", "..");
  const p = paths(repo);
  const motif = motifRunner([p.motifBin]);
  const code = await runEvals(
    process.argv.slice(2),
    {
      preflight: (needsBrowser, claude, needsFlutter, needsAndroid, needsXcode, needsNode, nodeNeeds) =>
        preflight(
          p, needsBrowser, { which: (cmd) => Bun.which(cmd), run: runCmd, env: process.env, bun: process.execPath, ...(claude ? { claudeOverride: resolve(claude) } : {}) },
          needsFlutter, needsAndroid, needsXcode, needsNode, nodeNeeds,
        ),
      prepare: (c, dir) => prepareWorkspace(c, dir, runCmd),
      session: runSession,
      collect: (c, ws, out, judge) => collectAndGrade(c, ws, out, { run: runCmd, motif, judge }),
      purge: async (claude, cwd) => {
        const r = await runCmd([claude, "purge", "-y", cwd], repo, 60_000);
        if (r.code !== 0 || r.timedOut) return r.timedOut ? "it didn't finish within a minute" : r.stderr.trim().split("\n").pop() || `exit code ${r.code}`;
      },
      removeData: (cwd) => removeProjectData(homedir(), cwd),
      removeDir,
      git: () => gitState(repo),
      now: () => new Date(),
      log: (line) => console.log(line),
      env: process.env,
      instructionFiles: (dir) => memoryFiles(dir, homedir()),
      personal: () => personalNames(homedir()),
      agentSettings: () => agentSettings(),
      // Test A: both apps of a brief shot the same way into anonymous pairs (a/pairs.json, a/img/).
      afterBriefPair: (brief, withMotif, without, out) => pairBrief(brief, withMotif, without, out, { motif, run: runCmd }),
    },
    // Case folders live in the home folder by default: macOS empties the temp folder of files untouched for 3 days,
    // which would take a paused run's folders before --resume.
    { repo, results: join(repo, "tests", "evals", "results"), work: join(homedir(), ".motif-evals") },
  );
  process.exit(code);
}
