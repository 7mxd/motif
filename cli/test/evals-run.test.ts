import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalCase } from "../../tests/evals/cases";
import { AGENT_TOOLS, JUDGE_EXPECTED_TOOLS } from "../../tests/evals/claude";
import type { Grade } from "../../tests/evals/grade";
import { Paused } from "../../tests/evals/judge";
import { runEvals, USAGE, type RunDeps } from "../../tests/evals/run";
import type { SessionOutcome, SessionSpec } from "../../tests/evals/session";
import { loadRun, type RunState } from "../../tests/evals/state";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const RUN = "20261014-120000";
const PASS: Grade = { pass: true, criteria: [], metrics: {} };
const finished = (): SessionOutcome => ({
  end: "finished",
  init: { model: "m", permissionMode: "auto", apiKeySource: "none", mcpServers: [], plugins: [], tools: ["Read"], skills: [], agents: [], version: "x" },
  result: { subtype: "success", isError: false, turns: 5, costUsd: 1, durationMs: 1, denials: [], text: "", apiErrorStatus: null },
  problems: [], minutes: 1,
});

function harness(over: Partial<RunDeps> = {}) {
  const root = tempDir("motif-evalrun-");
  const calls = { prepare: [] as string[], session: [] as SessionSpec[], collect: [] as string[], purge: [] as string[], removed: [] as string[], preflight: 0 };
  const lines: string[] = [];
  const deps: RunDeps = {
    preflight: async () => {
      calls.preflight++;
      return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true };
    },
    prepare: async (c: EvalCase, dir: string) => {
      calls.prepare.push(c.id);
      mkdirSync(join(dir, "app"), { recursive: true });
      return { dir, app: join(dir, "app"), gitDir: join(dir, "baseline.git") };
    },
    session: async (s) => {
      calls.session.push(s);
      return finished();
    },
    collect: async (c) => {
      calls.collect.push(c.id);
      return PASS;
    },
    purge: async (_claude, cwd) => {
      calls.purge.push(cwd);
    },
    removeDir: (dir) => {
      calls.removed.push(dir);
    },
    git: () => ({ commit: "abc1234567890", dirty: false }),
    now: () => new Date(2026, 9, 14, 12, 0, 0),
    log: (l) => lines.push(l),
    env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-x" },
    instructionFiles: () => [],
    personal: () => ["apple-design"],
    agentSettings: () => ({ "~/.claude.json": "{}" }),
    ...over,
  };
  return { deps, calls, lines, root, where: { repo: root, results: join(root, "results"), work: join(root, "default-work") }, work: join(root, "work") };
}

const newFile = (path: string, text: string) => {
  const lines = text.split("\n");
  return [`diff --git a/${path} b/${path}`, "new file mode 100644", "index 0000000..1111111", "--- /dev/null", `+++ b/${path}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join("\n");
};
const edit = (path: string, added: string[]) =>
  [`diff --git a/${path} b/${path}`, "index 1111111..2222222 100644", `--- a/${path}`, `+++ b/${path}`, "@@ -1 +1 @@", ...added.map((l) => `+${l}`)].join("\n");

describe("the eval runner", () => {
  test("a browser is required only when a chosen case needs one", async () => {
    for (const [id, needs] of [["b-search", false], ["b-plain", true], ["c-plain", true]] as const) {
      const seen: boolean[] = [];
      const h = harness({
        preflight: async (n) => {
          seen.push(n);
          return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true };
        },
      });
      await runEvals(["--cases", id], h.deps, h.where);
      expect(seen).toEqual([needs]);
    }
  });

  test("Flutter is required only when a chosen case is a Flutter one", async () => {
    for (const [cases, needs] of [["b-search,c-plain", false], ["b-flutter-search", true], ["c-review,d-sahm", true]] as const) {
      const seen: (boolean | undefined)[] = [];
      const h = harness({
        preflight: async (_browser, _claude, flutter) => {
          seen.push(flutter);
          return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true };
        },
      });
      await runEvals(["--cases", cases], h.deps, h.where);
      expect(seen).toEqual([needs]);
    }
  });

  test("--list names every case without starting anything", async () => {
    const h = harness();
    expect(await runEvals(["--list"], h.deps, h.where)).toBe(0);
    expect(h.lines.join("\n")).toContain("c-review");
    expect(h.calls.preflight).toBe(0);
  });

  test("--dry-run shows each prompt and the Claude Code command, and writes nothing", async () => {
    const h = harness();
    expect(await runEvals(["--dry-run", "--cases", "c-review"], h.deps, h.where)).toBe(0);
    const text = h.lines.join("\n");
    expect(text).toContain("/motif:review");
    expect(text).toContain("--permission-mode auto");
    expect(h.calls.preflight + h.calls.session.length).toBe(0);
    expect(existsSync(h.where.results)).toBe(false);
  });

  test("unknown options and cases can't run", async () => {
    const h = harness();
    expect(await runEvals(["--bogus"], h.deps, h.where)).toBe(2);
    expect(await runEvals(["--cases", "b-nope"], h.deps, h.where)).toBe(2);
    expect(await runEvals(["--cases", "b-search", "--max-turns", "0"], h.deps, h.where)).toBe(2);
  });

  test("a run: each case prepared, run in its folder with its prompt and caps, graded, cleaned up, reported", async () => {
    const h = harness();
    expect(await runEvals(["--cases", "b-settings,c-review", "--work", h.work], h.deps, h.where)).toBe(0);
    expect(h.calls.prepare).toEqual(["b-settings", "c-review"]);
    const s = h.calls.session[0]!;
    expect(s.prompt).toStartWith("/motif:feature");
    expect(s.cwd).toBe(join(h.work, RUN, "b-settings", "app"));
    expect(s.args[s.args.indexOf("--max-turns") + 1]).toBe("200");
    expect(s.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(s.env.MOTIF_BIN).toBe(join(h.root, "dist", process.platform === "win32" ? "motif.exe" : "motif"));
    expect(s.expect).toEqual({ pluginDir: join(h.root, "dist", "claude-code"), auto: true, tools: AGENT_TOOLS, personal: ["apple-design"] });
    expect(h.calls.collect).toEqual(["b-settings", "c-review"]);
    expect(h.calls.purge).toContain(join(h.work, RUN, "b-settings", "app"));
    expect(h.calls.removed).toEqual([join(h.work, RUN, "b-settings"), join(h.work, RUN, "c-review")]);
    expect(h.lines.join("\n")).toContain("ANTHROPIC_API_KEY");
    expect(readFileSync(join(h.where.results, RUN, "report.md"), "utf8")).toContain("PASS");
    expect(existsSync(join(h.where.results, RUN, "report.json"))).toBe(true);
    expect(readFileSync(join(h.where.results, RUN, "no-mcp.json"), "utf8")).toBe('{"mcpServers":{}}');
  });

  test("--keep keeps the folders; --max-turns caps every case", async () => {
    const h = harness();
    await runEvals(["--cases", "b-search", "--keep", "--max-turns", "4", "--work", h.work], h.deps, h.where);
    expect(h.calls.removed).toEqual([]);
    const a = h.calls.session[0]!.args;
    expect(a[a.indexOf("--max-turns") + 1]).toBe("4");
  });

  test("a failing case makes the exit code 1", async () => {
    const h = harness({ collect: async () => ({ pass: false, criteria: [], metrics: {} }) });
    expect(await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where)).toBe(1);
  });

  test("a usage limit pauses the run; --resume continues with what's left", async () => {
    let n = 0;
    const h = harness({ session: async () => (++n === 2 ? { ...finished(), end: "usage-limit", resetsAt: 1792000800 } : finished()) });
    expect(await runEvals(["--cases", "b-settings,b-search,b-profile", "--work", h.work], h.deps, h.where)).toBe(3);
    expect(h.lines.join("\n")).toContain(`--resume ${RUN}`);
    const s = loadRun(h.where.results, RUN) as RunState;
    expect(Object.fromEntries(Object.entries(s.cases).map(([k, v]) => [k, v.status]))).toEqual({ "b-settings": "graded", "b-search": "interrupted", "b-profile": "pending" });
    h.calls.prepare.length = 0;
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(h.calls.prepare).toEqual(["b-search", "b-profile"]);
  });

  test("grading paused by the usage limit is picked up again without a new session", async () => {
    let first = true;
    const h = harness({
      collect: async () => {
        if (first) {
          first = false;
          throw new Paused();
        }
        return PASS;
      },
    });
    expect(await runEvals(["--cases", "c-review", "--work", h.work], h.deps, h.where)).toBe(3);
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(h.calls.session).toHaveLength(1);
    expect(h.calls.prepare).toEqual(["c-review"]);
  });

  test("grading that fails keeps the folder for the next --resume", async () => {
    let first = true;
    const h = harness({
      collect: async () => {
        if (first) {
          first = false;
          throw new Error("the grader's session ended with \"time-limit\"");
        }
        return PASS;
      },
    });
    expect(await runEvals(["--cases", "c-review", "--work", h.work], h.deps, h.where)).toBe(1);
    expect(h.calls.removed).toEqual([]);
    expect((loadRun(h.where.results, RUN) as RunState).cases["c-review"]!.status).toBe("session-done");
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(h.calls.session).toHaveLength(1);
  });

  test("a session that isn't isolated stops the whole run", async () => {
    const h = harness({ session: async () => ({ ...finished(), end: "not-isolated", problems: ["MCP servers were loaded (refero)."] }) });
    expect(await runEvals(["--cases", "b-settings,b-search", "--work", h.work], h.deps, h.where)).toBe(2);
    expect(h.calls.prepare).toEqual(["b-settings"]);
    expect(h.lines.join("\n")).toContain("refero");
  });

  test("a session that never described itself stops the whole run", async () => {
    const h = harness({ session: async () => ({ end: "failed", problems: ["Claude Code stopped unexpectedly: not logged in"], minutes: 0 }) });
    expect(await runEvals(["--cases", "b-settings,b-search", "--work", h.work], h.deps, h.where)).toBe(2);
    expect(h.calls.prepare).toEqual(["b-settings"]);
    expect(h.lines.join("\n")).toContain("not logged in");
  });

  test("a grader's session that isn't isolated stops the run and keeps the case for --resume", async () => {
    const h = harness({
      session: async (s) => {
        h.calls.session.push(s);
        return s.args.includes("--json-schema") ? { ...finished(), end: "not-isolated", problems: ["Other plugins were loaded (superpowers)."] } : finished();
      },
      collect: async (_c, ws, _out, judge) => {
        await judge({ issues: [], unmatched: [] }, ws.app);
        return PASS;
      },
    });
    expect(await runEvals(["--cases", "c-review,d-stride", "--work", h.work], h.deps, h.where)).toBe(2);
    const judgeSpec = h.calls.session.find((s) => s.args.includes("--json-schema"))!;
    expect(judgeSpec.expect).toEqual({ auto: false, tools: JUDGE_EXPECTED_TOOLS, personal: ["apple-design"] });
    expect(h.calls.prepare).toEqual(["c-review"]);
    expect((loadRun(h.where.results, RUN) as RunState).cases["c-review"]!.status).toBe("session-done");
    expect(h.lines.join("\n")).toContain("superpowers");
  });

  test("a session that failed part-way (an API error) isn't graded, and --resume runs it again", async () => {
    let n = 0;
    const h = harness({
      session: async (s) => {
        h.calls.session.push(s);
        return ++n === 1 ? { ...finished(), end: "failed", problems: ["Claude Code stopped unexpectedly: API Error: 500"] } : finished();
      },
    });
    expect(await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where)).toBe(1);
    expect(h.calls.collect).toEqual([]);
    expect((loadRun(h.where.results, RUN) as RunState).cases["b-search"]).toMatchObject({ status: "error", note: expect.stringContaining("API Error: 500") });
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(h.calls.collect).toEqual(["b-search"]);
  });

  test("instruction files Claude Code would read in every session stop the run before it starts", async () => {
    const h = harness({ instructionFiles: (dir) => [join(dir, "..", "CLAUDE.md")] });
    expect(await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where)).toBe(2);
    expect(h.lines.join("\n")).toContain("CLAUDE.md");
    expect(h.calls.prepare).toEqual([]);
  });

  test("each run keeps its folders apart under --work, so a new run never deletes another's", async () => {
    const h = harness();
    await runEvals(["--cases", "b-search", "--keep", "--work", h.work], h.deps, h.where);
    expect(h.calls.session[0]!.cwd).toBe(join(h.work, RUN, "b-search", "app"));
  });

  test("a folder that can't be deleted after grading is reported, and the run goes on", async () => {
    const h = harness({
      removeDir: () => {
        throw new Error("EBUSY: resource busy or locked");
      },
    });
    expect(await runEvals(["--cases", "b-search,b-profile", "--work", h.work], h.deps, h.where)).toBe(0);
    expect(h.calls.collect).toEqual(["b-search", "b-profile"]);
    expect(h.lines.join("\n")).toContain("Couldn't delete");
  });

  test("a folder that can't be prepared is an error for that case only", async () => {
    const h = harness();
    const prepare = h.deps.prepare;
    let n = 0;
    h.deps.prepare = async (c, dir) => {
      if (++n === 1) throw new Error("npm ci failed: network unreachable");
      return prepare(c, dir);
    };
    expect(await runEvals(["--cases", "b-settings,b-search", "--work", h.work], h.deps, h.where)).toBe(1);
    const s = loadRun(h.where.results, RUN) as RunState;
    expect(s.cases["b-settings"]).toMatchObject({ status: "error", note: expect.stringContaining("network unreachable") });
    expect(s.cases["b-search"]!.status).toBe("graded");
  });

  test("a run can't start when preflight fails, and leaves nothing behind", async () => {
    const h = harness({ preflight: async () => ({ error: "Sign in with your Claude account." }) });
    expect(await runEvals(["--cases", "b-search"], h.deps, h.where)).toBe(2);
    expect(h.lines.join("\n")).toContain("Sign in");
    expect(existsSync(h.where.results)).toBe(false);
  });

  test("--regrade recomputes only the new-component rule from each B case's saved diff, and the report says so (fourth eval run)", async () => {
    const h = harness();
    const dir = join(h.where.results, RUN);
    const crit = (id: string, pass: boolean, detail: string) => ({ id, label: id, pass, detail });
    const state: RunState = {
      motifEvalRun: 1, id: RUN, commit: "old0000000000", dirty: false, started: "2026-10-14T08:00:00.000Z", claudeVersion: "2.1.301 (Claude Code)", resumes: [],
      options: { keep: false, work: h.work },
      cases: {
        "b-settings": { status: "graded", attempts: 1, grade: { pass: false, metrics: { newComponents: 3 }, criteria: [
          crit("check", true, "0 problems, 0 warnings."), crit("components", false, "New: AddressSheet, SettingsScreen, RadioGroup (recorded in DESIGN.md: RadioGroup)."),
        ] } },
        "b-search": { status: "graded", attempts: 1, grade: { pass: false, metrics: { newComponents: 1 }, criteria: [
          crit("build", false, "The build failed (exit code 1)."), crit("components", true, "New: ProductSearch."),
        ] } },
        "b-notifications": { status: "graded", attempts: 1, grade: { pass: false, metrics: {}, criteria: [crit("components", false, "New: A, B, C.")] } },
        "b-plain": { status: "graded", attempts: 1, grade: { pass: true, metrics: { newComponents: 1 }, criteria: [crit("components", true, "New: MonthGroup.")] } },
        "c-review": { status: "graded", attempts: 1, grade: { pass: true, metrics: {}, criteria: [crit("exact", true, "13 of 13 (100%).")] } },
        "b-profile": { status: "pending", attempts: 0 },
      },
    };
    for (const c of ["b-settings", "b-search", "b-plain"]) mkdirSync(join(dir, c), { recursive: true });
    writeFileSync(join(dir, "run.json"), JSON.stringify(state));
    writeFileSync(join(dir, "b-settings", "diff.patch"), [
      newFile("src/app/settings/SettingsScreen.tsx", 'import { RadioGroup } from "@/components/RadioGroup";\nimport { Switch } from "@/components/Switch";\nexport function SettingsScreen() {\n  return <div><Switch /><RadioGroup /></div>;\n}'),
      newFile("src/app/settings/AddressSheet.tsx", 'import { Sheet } from "@/components/Sheet";\nexport function AddressSheet() {\n  return <Sheet />;\n}'),
      newFile("src/components/RadioGroup.tsx", "export function RadioGroup() {\n  return <div role=\"radiogroup\" />;\n}"),
      edit("DESIGN.md", ["| RadioGroup | One choice from a few options | — | default, selected |"]),
    ].join("\n"));
    writeFileSync(join(dir, "b-search", "diff.patch"), newFile("src/app/search/ProductSearch.tsx", 'import { Input } from "@/components/Input";\nexport function ProductSearch() {\n  return <Input />;\n}'));
    writeFileSync(join(dir, "b-plain", "diff.patch"), [
      edit("components.css", ["/* Component: MonthGroup — a month's heading and its rows */"]),
      edit("DESIGN.md", ["| MonthGroup | A month's heading and its rows | — | — |"]),
    ].join("\n"));

    expect(await runEvals(["--regrade", RUN], h.deps, h.where)).toBe(1);
    const after = loadRun(h.where.results, RUN) as RunState;
    const settings = after.cases["b-settings"]!.grade!;
    expect(settings.pass).toBe(true);
    expect(settings.criteria.find((k) => k.id === "components")).toMatchObject({
      pass: true, detail: "New: RadioGroup (recorded in DESIGN.md: RadioGroup). Part of a screen, not counted: SettingsScreen, AddressSheet.",
    });
    expect(settings.metrics.newComponents).toBe(1);
    // Every other criterion stands as graded: b-search still fails on its build.
    expect(settings.criteria.find((k) => k.id === "check")!.detail).toBe("0 problems, 0 warnings.");
    expect(after.cases["b-search"]!.grade!.pass).toBe(false);
    expect(after.cases["b-search"]!.grade!.criteria.find((k) => k.id === "components")!.detail).toBe("No new components. Part of a screen, not counted: ProductSearch.");
    expect(after.cases["b-plain"]!.grade!.criteria.find((k) => k.id === "components")!.detail).toBe("New: MonthGroup (recorded in DESIGN.md: MonthGroup).");
    // No saved diff: left as graded, and said so. Other tests and unfinished cases are untouched.
    expect(after.cases["b-notifications"]).toEqual(state.cases["b-notifications"]!);
    expect(h.lines.join("\n")).toContain("b-notifications: no saved diff");
    expect(after.cases["c-review"]).toEqual(state.cases["c-review"]!);
    expect(after.cases["b-profile"]).toEqual(state.cases["b-profile"]!);
    expect(after.regrades).toEqual([{ at: h.deps.now().toISOString(), commit: "abc1234567890", dirty: false }]);
    const report = readFileSync(join(dir, "report.md"), "utf8");
    expect(report).toContain(`- Re-graded ${h.deps.now().toISOString()} on commit abc123456789: the new-component rule, from each B case's saved diff`);
    expect(report).toContain("Part of a screen, not counted: SettingsScreen, AddressSheet.");
    // Nothing was run: no Claude Code, no browser, no sessions.
    expect(h.calls.preflight).toBe(0);
    expect(h.calls.session).toEqual([]);
    expect(await runEvals(["--regrade", "20990101-000000"], h.deps, h.where)).toBe(2);
  });

  test("resuming on another commit is allowed and noted in the report", async () => {
    let n = 0;
    const h = harness({ session: async () => (++n === 1 ? { ...finished(), end: "usage-limit" } : finished()) });
    await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where);
    h.deps.git = () => ({ commit: "def4567890abcdef", dirty: true });
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(readFileSync(join(h.where.results, RUN, "report.md"), "utf8")).toContain("def4567890ab");
  });
});

describe("the eval runner (backlog)", () => {
  test("--resume keeps the run's own options and says which ones it leaves out", async () => {
    let n = 0;
    const h = harness({
      session: async (s) => {
        h.calls.session.push(s);
        n++;
        return n === 1 ? { ...finished(), end: "usage-limit" } : finished();
      },
    });
    expect(await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where)).toBe(3);
    await runEvals(["--resume", RUN, "--model", "other", "--keep"], h.deps, h.where);
    expect(h.lines.join("\n")).toContain("--resume uses the options the run started with, so it leaves out --model and --keep.");
  });

  test("two runs started in the same second get their own ids", async () => {
    const h = harness();
    await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where);
    await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where);
    expect(existsSync(join(h.where.results, RUN, "run.json"))).toBe(true);
    expect(existsSync(join(h.where.results, `${RUN}-2`, "run.json"))).toBe(true);
  });

  test("two runs started at once, in the same second, get their own ids (backlog)", async () => {
    const h = harness();
    await Promise.all([
      runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where),
      runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where),
    ]);
    const ids = [RUN, `${RUN}-2`].map((id) => (loadRun(h.where.results, id) as RunState | null)?.id);
    expect(ids).toEqual([RUN, `${RUN}-2`]);
    expect((loadRun(h.where.results, `${RUN}-2`) as RunState).options.work).toBe(join(h.work, `${RUN}-2`));
  });

  test("a session's temp folder is inside its case's folder, so what it writes there goes with the case (evals 2026-10-19)", async () => {
    // c-review sessions wrote helper scripts to the system's temp folder, which nothing cleared.
    const seen: { tmp: string; exists: boolean; vars: string[] }[] = [];
    const h = harness({
      session: async (s) => {
        h.calls.session.push(s);
        seen.push({ tmp: s.env.TMP!, exists: existsSync(s.env.TMP!), vars: [s.env.TEMP!, s.env.TMPDIR!] });
        return finished();
      },
      collect: async (_c, ws, _out, judge) => {
        await judge({ issues: [], unmatched: [] }, ws.app);
        return PASS;
      },
    });
    await runEvals(["--cases", "c-review", "--work", h.work], h.deps, h.where);
    const caseDir = join(h.work, RUN, "c-review");
    expect(seen.map((s) => s.tmp)).toEqual([join(caseDir, "tmp"), join(caseDir, "grader", "tmp")]);
    for (const s of seen) expect([s.exists, ...s.vars]).toEqual([true, s.tmp, s.tmp]);
  });

  test("a dry run writes nothing, not even its run's folder", async () => {
    const h = harness();
    await runEvals(["--cases", "b-search", "--dry-run", "--work", h.work], h.deps, h.where);
    expect(existsSync(join(h.where.results, RUN))).toBe(false);
  });

  test("without --work, case folders go to the runner's own folder, not the temp folder the system empties", async () => {
    const h = harness();
    await runEvals(["--cases", "b-search"], h.deps, h.where);
    expect((loadRun(h.where.results, RUN) as RunState).options.work).toBe(join(h.where.work, RUN));
  });

  test("Claude Code's saved data that can't be cleared is reported", async () => {
    const h = harness({ purge: async () => "the folder was in use" });
    await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where);
    expect(h.lines.join("\n")).toContain("Couldn't clear Claude Code's saved data for");
  });

  test("a session that changed the developer's agent settings stops the run", async () => {
    let n = 0;
    const h = harness({ agentSettings: () => ({ "~/.claude.json": n++ === 0 ? "{}" : '{"figma":{}}' }) });
    // (agentSettings is read before and after each session.)
    expect(await runEvals(["--cases", "b-search,b-settings", "--work", h.work], h.deps, h.where)).toBe(2);
    expect(h.lines.join("\n")).toContain("changed your coding agents' settings: ~/.claude.json (added figma)");
    expect(h.calls.session).toHaveLength(1);
  });

  test("the grader works from a folder of its own, reading the app from outside it", async () => {
    const h = harness({
      collect: async (_c, ws, _out, judge) => {
        await judge({ issues: [], unmatched: [] }, ws.app);
        return PASS;
      },
    });
    await runEvals(["--cases", "c-review", "--work", h.work], h.deps, h.where);
    const app = h.calls.session[0]!.cwd;
    const judgeSpec = h.calls.session.find((s) => s.args.includes("--json-schema"))!;
    expect(judgeSpec.cwd).not.toBe(app);
    expect(judgeSpec.args[judgeSpec.args.indexOf("--add-dir") + 1]).toBe(app);
    expect(judgeSpec.prompt).toContain(app);
  });
});

describe("the eval runner (review of batch F)", () => {
  test("the grader's folder is inside the case folder, so it goes when the case does", async () => {
    const h = harness({
      collect: async (_c, ws, _out, judge) => {
        await judge({ issues: [], unmatched: [] }, ws.app);
        return PASS;
      },
    });
    await runEvals(["--cases", "c-review", "--work", h.work], h.deps, h.where);
    const judgeSpec = h.calls.session.find((s) => s.args.includes("--json-schema"))!;
    expect(judgeSpec.cwd).toBe(join(h.calls.removed[0]!, "grader"));
  });

  test("a CLAUDE.md that appeared above the grader's folder stops the run before the grader starts", async () => {
    const h = harness({
      instructionFiles: (dir) => (dir.endsWith("grader") ? [join(dir, "..", "CLAUDE.md")] : []),
      collect: async (_c, ws, _out, judge) => {
        await judge({ issues: [], unmatched: [] }, ws.app);
        return PASS;
      },
    });
    expect(await runEvals(["--cases", "c-review", "--work", h.work], h.deps, h.where)).toBe(2);
    expect(h.calls.session.some((s) => s.args.includes("--json-schema"))).toBe(false);
    expect(h.lines.join("\n")).toContain("CLAUDE.md");
  });

  test("the dry run's command can be pasted into a shell, and the usage names the default folder", async () => {
    const h = harness();
    await runEvals(["--cases", "b-search", "--dry-run"], h.deps, h.where);
    expect(h.lines.join("\n")).toContain('--disallowedTools "Bash(claude mcp *),');
    expect(USAGE).toContain("~/.motif-evals");
  });
});
