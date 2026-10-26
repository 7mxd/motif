import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const calls = { prepare: [] as string[], session: [] as SessionSpec[], collect: [] as string[], purge: [] as string[], removed: [] as string[], own: [] as string[], preflight: 0 };
  const lines: string[] = [];
  const deps: RunDeps = {
    preflight: async () => {
      calls.preflight++;
      return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true, purge: true };
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
    removeData: (cwd) => {
      calls.own.push(cwd);
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
          return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true, purge: true };
        },
      });
      await runEvals(["--cases", id], h.deps, h.where);
      expect(seen).toEqual([needs]);
    }
  });

  test("Node.js is required only when a chosen case installs or builds with npm", async () => {
    const cases: [string, boolean][] = [
      ["b-search", true], ["c-review", true], ["c-rn", true], ["d-stride", true], ["d-rihla", true], ["b-vue-history", true], ["c-vue", true], ["d-darb", true], ["b-svelte-history", true], ["c-svelte", true], ["d-nuzha", true], ["b-angular-history", true], ["c-angular", true], ["d-sanad", true],
      ["b-plain", false], ["c-plain", false], ["b-flutter-search", false], ["c-compose", false], ["d-sahm", false], ["d-nabta", false],
      ["b-search,b-flutter-search", true],
    ];
    for (const [ids, needs] of cases) {
      const seen: (boolean | undefined)[] = [];
      const h = harness({
        platform: "darwin",
        preflight: async (_b, _c, _f, _a, _x, node) => {
          seen.push(node);
          return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true, purge: true };
        },
      });
      await runEvals(["--cases", ids], h.deps, h.where);
      expect([ids, seen]).toEqual([ids, [needs]]);
    }
    const h = harness({
      platform: "darwin",
      preflight: async (_b, _c, _f, _a, _x, node) => {
        expect(node).toBe(false);
        return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true, purge: true };
      },
    });
    await runEvals(["--cases", "c-swiftui,b-swiftui-orders"], h.deps, h.where);
  });

  test("preflight is told which Node.js floors the chosen cases need: Vite 8 (Vue, Svelte), SvelteKit 3 (d-nuzha), Angular 21 (Ataa) and Angular 22 (d-sanad)", async () => {
    const wanted: [string, { vite8: boolean; svelteKit3: boolean; angular21: boolean; angular22: boolean }][] = [
      ["b-vue-history", { vite8: true, svelteKit3: false, angular21: false, angular22: false }], ["b-search,c-vue", { vite8: true, svelteKit3: false, angular21: false, angular22: false }],
      ["c-svelte", { vite8: true, svelteKit3: false, angular21: false, angular22: false }], ["d-nuzha", { vite8: false, svelteKit3: true, angular21: false, angular22: false }],
      ["b-svelte-history,d-nuzha", { vite8: true, svelteKit3: true, angular21: false, angular22: false }], ["b-search,b-rn-orders", { vite8: false, svelteKit3: false, angular21: false, angular22: false }],
      ["b-angular-history,c-angular", { vite8: false, svelteKit3: false, angular21: true, angular22: false }], ["d-sanad", { vite8: false, svelteKit3: false, angular21: false, angular22: true }],
    ];
    for (const [ids, needs] of wanted) {
      const seen: unknown[] = [];
      const h = harness({
        preflight: async (_b, _c, _f, _a, _x, _n, nodeNeeds) => {
          seen.push(nodeNeeds);
          return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true, purge: true };
        },
      });
      await runEvals(["--cases", ids], h.deps, h.where);
      expect([ids, seen]).toEqual([ids, [needs]]);
    }
  });

  test("with claude purge, it clears each folder with it and says nothing about transcripts", async () => {
    const h = harness();
    await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where);
    expect(h.calls.purge.length).toBeGreaterThan(0);
    expect(h.calls.own).toEqual([]);
    expect(h.lines.join("\n")).not.toContain("no `claude purge`");
  });

  test("without claude purge, it removes each folder's transcripts itself, and says so once at the start", async () => {
    const h = harness({ preflight: async () => ({ claude: "claude-exe", claudeVersion: "2.1.283 (Claude Code)", browser: true, purge: false }) });
    await runEvals(["--cases", "b-search,b-settings", "--work", h.work], h.deps, h.where);
    expect(h.calls.purge).toEqual([]);
    expect(h.calls.own).toContain(join(h.work, RUN, "b-settings", "app"));
    expect(h.calls.own.length).toBeGreaterThanOrEqual(2);
    const said = h.lines.filter((l) => l.includes("no `claude purge`"));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("Update Claude Code");
    expect(h.lines.findIndex((l) => l.includes("no `claude purge`"))).toBeLessThan(h.lines.findIndex((l) => l.includes("Claude Code is working")));
  });

  test("its own removal that fails is reported like purge's", async () => {
    const h = harness({
      preflight: async () => ({ claude: "claude-exe", claudeVersion: "2.1.283 (Claude Code)", browser: true, purge: false }),
      removeData: () => "the folder was in use",
    });
    await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where);
    expect(h.lines.join("\n")).toContain("Couldn't clear Claude Code's saved data for");
  });

  test("Flutter is required only when a chosen case is a Flutter one", async () => {
    for (const [cases, needs] of [["b-search,c-plain", false], ["b-flutter-search", true], ["c-review,d-sahm", true]] as const) {
      const seen: (boolean | undefined)[] = [];
      const h = harness({
        preflight: async (_browser, _claude, flutter) => {
          seen.push(flutter);
          return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true, purge: true };
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

  test("the grader is told what kind of app was reviewed", async () => {
    for (const [id, kind] of [["c-review", "web app"], ["c-flutter", "Flutter app"]] as const) {
      const h = harness({
        collect: async (_c, ws, _out, judge) => {
          await judge({ issues: [], unmatched: [] }, ws.app);
          return PASS;
        },
      });
      await runEvals(["--cases", id, "--work", h.work], h.deps, h.where);
      const judgeSpec = h.calls.session.find((s) => s.args.includes("--json-schema"))!;
      expect(judgeSpec.prompt).toContain(`a design review of the ${kind} in `);
    }
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

describe("the eval runner and the Mac-only cases (spec §9)", () => {
  const reason =
    "Skipping b-swiftui-orders and c-swiftui: they need a Mac with Xcode, since SwiftUI apps build and draw only on macOS. Run them on a Mac: bun tests/evals/run.ts --cases b-swiftui-orders,c-swiftui";
  const SKIP_NOTE = `It needs a Mac with Xcode, since SwiftUI apps build and draw only on macOS. Resume this run on a Mac to run it: bun tests/evals/run.ts --resume ${RUN}`;

  test("off a Mac, they're skipped with the reason and the others run; nothing is prepared for them", async () => {
    for (const platform of ["win32", "linux"] as const) {
      const seen: (boolean | undefined)[] = [];
      const h = harness({
        platform,
        preflight: async (_b, _c, _f, _a, xcode) => {
          seen.push(xcode);
          return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true, purge: true };
        },
      });
      expect(await runEvals(["--cases", "b-search,b-swiftui-orders,c-swiftui", "--work", h.work], h.deps, h.where)).toBe(0);
      expect(h.lines).toContain(reason);
      expect(seen).toEqual([false]);
      expect(h.calls.prepare).toEqual(["b-search"]);
      // Recorded as skipped, with the reason, so the report says why and a Mac can finish the run.
      const cases = (loadRun(h.where.results, RUN) as RunState).cases;
      expect(Object.keys(cases)).toEqual(["b-search", "b-swiftui-orders", "c-swiftui"]);
      for (const id of ["b-swiftui-orders", "c-swiftui"]) expect(cases[id]).toEqual({ status: "skipped", attempts: 0, note: SKIP_NOTE });
      const md = readFileSync(join(h.where.results, RUN, "report.md"), "utf8");
      expect(md).toContain(`## c-swiftui: Review of the seeded SwiftUI app\n\nSkipped: ${SKIP_NOTE}`);
      expect(md).toContain("1 of 19 cases graded; b-swiftui-orders was skipped (it needs a Mac).");
    }
  });

  test("off a Mac, a whole run passes when every case it can run passes: verdicts and exit code agree", async () => {
    const h = harness({ platform: "win32" });
    expect(await runEvals(["--work", h.work], h.deps, h.where)).toBe(0);
    expect(h.calls.prepare).toHaveLength(44);
    const { verdicts } = JSON.parse(readFileSync(join(h.where.results, RUN, "report.json"), "utf8"));
    expect(verdicts).toEqual([
      { test: "B", status: "pass", detail: "All 18 cases run passed; b-swiftui-orders and b-swiftui-rewards were skipped (they need a Mac)." },
      { test: "C", status: "pass", detail: "All 8 cases run passed; c-swiftui was skipped (it needs a Mac)." },
      { test: "D", status: "pass", detail: "The new apps passed, and B and C passed with no design sources connected; d-masar was skipped (it needs a Mac)." },
    ]);
    // A failing case that ran still fails it.
    const f = harness({ platform: "win32", collect: async (c) => (c.id === "c-review" ? { pass: false, criteria: [], metrics: {} } : PASS) });
    expect(await runEvals(["--work", f.work], f.deps, f.where)).toBe(1);
  });

  test("a run started off a Mac is finished on one: its skipped cases run there", async () => {
    const pc = harness({ platform: "win32" });
    expect(await runEvals(["--cases", "b-search,b-swiftui-orders", "--work", pc.work], pc.deps, pc.where)).toBe(0);
    const mac = harness({ platform: "darwin" });
    mac.where.results = pc.where.results;
    expect(await runEvals(["--resume", RUN], mac.deps, mac.where)).toBe(0);
    expect(mac.calls.prepare).toEqual(["b-swiftui-orders"]);
    const state = loadRun(pc.where.results, RUN) as RunState;
    expect(state.cases["b-swiftui-orders"]).toMatchObject({ status: "graded", attempts: 1 });
    expect(state.cases["b-swiftui-orders"]!.note).toBeUndefined();
  });

  test("a case whose session finished on a Mac keeps its session and folder off a Mac, and is graded, not run again, back on one", async () => {
    // On the Mac the session finishes, then grading fails: the folder is kept for --resume to grade again.
    let grading = 0;
    const collect: RunDeps["collect"] = async (c) => {
      if (c.id === "c-swiftui" && grading++ === 0) throw new Error("the simulator didn't start");
      return PASS;
    };
    const mac = harness({ platform: "darwin", collect });
    expect(await runEvals(["--cases", "b-search,c-swiftui", "--work", mac.work], mac.deps, mac.where)).toBe(1);
    const before = (loadRun(mac.where.results, RUN) as RunState).cases["c-swiftui"]!;
    expect(before).toMatchObject({ status: "session-done", attempts: 1, note: expect.stringContaining("Grading failed: the simulator didn't start") });
    expect(before.workspace).toBeDefined();
    expect(mac.calls.removed).not.toContain(before.workspace!.dir);

    // Resumed off a Mac: skipped, but nothing is lost, and it isn't counted as a failure.
    const pc = harness({ platform: "win32", collect });
    pc.where.results = mac.where.results;
    expect(await runEvals(["--resume", RUN], pc.deps, pc.where)).toBe(0);
    expect(pc.calls.prepare.length + pc.calls.removed.length).toBe(0);
    expect(grading).toBe(1);
    const off = (loadRun(mac.where.results, RUN) as RunState).cases["c-swiftui"]!;
    expect(off).toEqual({
      ...before, status: "skipped", skippedFrom: "session-done", noteBefore: before.note,
      note: `Its session finished; grading it needs a Mac with Xcode, since SwiftUI apps build and draw only on macOS. Resume this run on a Mac to grade it from the folder kept: bun tests/evals/run.ts --resume ${RUN}`,
    });
    const { verdicts } = JSON.parse(readFileSync(join(mac.where.results, RUN, "report.json"), "utf8"));
    expect(verdicts[1].detail).toContain("c-swiftui was skipped (it needs a Mac)");
    expect(readFileSync(join(mac.where.results, RUN, "report.md"), "utf8")).toContain(`Skipped: ${off.note}`);

    // Back on the Mac: graded from the kept folder; the session isn't run again.
    const again = harness({ platform: "darwin", collect });
    again.where.results = mac.where.results;
    expect(await runEvals(["--resume", RUN], again.deps, again.where)).toBe(0);
    expect(again.calls.prepare).toEqual([]);
    expect(again.calls.session).toEqual([]);
    // Graded once on the first Mac leg (it failed), not off the Mac, and once again here.
    expect(grading).toBe(2);
    const done = (loadRun(mac.where.results, RUN) as RunState).cases["c-swiftui"]!;
    expect(done).toMatchObject({ status: "graded", attempts: 1, session: before.session });
    expect(done.skippedFrom).toBeUndefined();
    expect(done.noteBefore).toBeUndefined();
  });

  test("resuming off a Mac with only skipped cases left writes the report without running anything", async () => {
    const pc = harness({ platform: "win32" });
    await runEvals(["--cases", "b-search,b-swiftui-orders", "--work", pc.work], pc.deps, pc.where);
    const again = harness({ platform: "linux" });
    again.where.results = pc.where.results;
    expect(await runEvals(["--resume", RUN], again.deps, again.where)).toBe(0);
    expect(again.calls.preflight + again.calls.prepare.length).toBe(0);
    expect(again.lines.join("\n")).toContain("Skipping b-swiftui-orders: it needs a Mac with Xcode");
  });

  test("off a Mac, a run of Mac-only cases alone doesn't start", async () => {
    const h = harness({ platform: "win32" });
    expect(await runEvals(["--cases", "d-masar", "--work", h.work], h.deps, h.where)).toBe(2);
    expect(h.lines.join("\n")).toContain("Skipping d-masar: it needs a Mac with Xcode");
    expect(h.lines.join("\n")).toContain("Nothing is left to run here.");
    expect(h.calls.preflight + h.calls.prepare.length).toBe(0);
    expect(existsSync(h.where.results)).toBe(false);
  });

  test("a dry run off a Mac says which it skips and shows only the others", async () => {
    const h = harness({ platform: "linux" });
    expect(await runEvals(["--dry-run", "--cases", "b-search,b-swiftui-orders,c-swiftui"], h.deps, h.where)).toBe(0);
    const text = h.lines.join("\n");
    expect(text).toContain(reason);
    expect(text).toContain("b-search: ");
    expect(text).not.toContain("b-swiftui-orders: ");
  });

  test("on a Mac they run, and preflight is asked for Xcode", async () => {
    const seen: (boolean | undefined)[] = [];
    const h = harness({
      platform: "darwin",
      preflight: async (_b, _c, _f, _a, xcode) => {
        seen.push(xcode);
        return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true, purge: true };
      },
    });
    expect(await runEvals(["--cases", "b-search,b-swiftui-orders", "--work", h.work], h.deps, h.where)).toBe(0);
    expect(seen).toEqual([true]);
    expect(h.calls.prepare).toEqual(["b-search", "b-swiftui-orders"]);
    expect(h.lines.join("\n")).not.toContain("Skipping");
  });

  test("a run started on a Mac and resumed elsewhere skips them there, recording why", async () => {
    let n = 0;
    const mac = harness({ platform: "darwin", session: async () => (++n === 1 ? { ...finished(), end: "usage-limit" } : finished()) });
    expect(await runEvals(["--cases", "b-settings,b-search,b-swiftui-orders", "--work", mac.work], mac.deps, mac.where)).toBe(3);
    const pc = harness({ platform: "win32" });
    pc.where.results = mac.where.results;
    expect(await runEvals(["--resume", RUN], pc.deps, pc.where)).toBe(0);
    expect(pc.lines.join("\n")).toContain("Skipping b-swiftui-orders: it needs a Mac with Xcode");
    expect(pc.calls.prepare).toEqual(["b-settings", "b-search"]);
    const state = loadRun(mac.where.results, RUN) as RunState;
    expect(state.cases["b-swiftui-orders"]).toEqual({ status: "skipped", attempts: 0, note: SKIP_NOTE });
    expect(state.cases["b-search"]!.status).toBe("graded");
  });

  test("the grader is told it's reviewing a SwiftUI app", async () => {
    const h = harness({
      platform: "darwin",
      collect: async (_c, ws, _out, judge) => {
        await judge({ issues: [], unmatched: [] }, ws.app);
        return PASS;
      },
    });
    await runEvals(["--cases", "c-swiftui", "--work", h.work], h.deps, h.where);
    expect(h.calls.session.find((s) => s.args.includes("--json-schema"))!.prompt).toContain("design review of the SwiftUI app in");
  });
});

describe("the eval runner and Test A (Part 4 §4)", () => {
  /** A harness that records afterBriefPair's calls, and the folders removed so far at each. */
  function paired(over: Partial<RunDeps> = {}) {
    const pairs: { brief: string; d: string; a: string; removedBefore: string[] }[] = [];
    const h = harness({
      afterBriefPair: async (brief, d, a) => {
        pairs.push({ brief, d: d.dir, a: a.dir, removedBefore: [...h.calls.removed] });
      },
      ...over,
    });
    return { ...h, pairs };
  }

  test("--list shows all 49 cases", async () => {
    const h = harness();
    expect(await runEvals(["--list"], h.deps, h.where)).toBe(0);
    expect(h.lines).toHaveLength(49);
    expect(h.lines.filter((l) => /^a-\S+\s+A\s/.test(l))).toHaveLength(10);
  });

  test("--tests A runs the a-* cases with no plugin: no --plugin-dir, nothing of Motif's in the prompt or the environment", async () => {
    const h = paired({ platform: "darwin" });
    expect(await runEvals(["--tests", "A", "--work", h.work], h.deps, h.where)).toBe(0);
    expect(h.calls.prepare).toEqual(["a-stride", "a-ledgerly", "a-bloom", "a-sahm", "a-nabta", "a-rihla", "a-darb", "a-nuzha", "a-sanad", "a-masar"]);
    for (const s of h.calls.session) {
      expect(s.args).not.toContain("--plugin-dir");
      expect(s.args).not.toContain("--add-dir");
      expect(s.expect).toEqual({ auto: true, tools: AGENT_TOOLS, personal: ["apple-design"] });
      expect("pluginDir" in s.expect).toBe(false);
      expect(s.prompt.toLowerCase()).not.toContain("motif");
      expect(Object.keys(s.env).filter((k) => /motif/i.test(k))).toEqual([]);
    }
  });

  test("nothing an a-* session is given names Motif: not its arguments, its environment or its MCP list (on a --work folder that doesn't)", async () => {
    const root = tempDir("evals-a-");
    const mcp: string[] = [];
    const h = harness({
      env: { PATH: "/bin", MOTIF_BIN: "/x/motif", MOTIF_NO_CONNECT: "1", Motif_Other: "y", HOME: "/home/me" },
      session: async (s) => {
        h.calls.session.push(s);
        mcp.push(readFileSync(s.args[s.args.indexOf("--mcp-config") + 1]!, "utf8"));
        return finished();
      },
    });
    const where = { repo: join(root, "repo"), results: join(root, "results"), work: join(root, "work") };
    expect(await runEvals(["--cases", "d-stride,a-stride", "--work", join(root, "cases")], h.deps, where)).toBe(0);
    const [d, a] = h.calls.session;
    expect(a!.args.join(" ").toLowerCase()).not.toContain("motif");
    // The MOTIF_ variables (the runner's own and the developer's) are left out; the rest of the environment is kept.
    expect(JSON.stringify(a!.env).toLowerCase()).not.toContain("motif");
    expect(a!.env.HOME).toBe("/home/me");
    // Its empty MCP list is in its own case folder; d-* keeps the run's.
    expect(a!.args[a!.args.indexOf("--mcp-config") + 1]).toBe(join(root, "cases", RUN, "a-stride", "no-mcp.json"));
    expect(d!.args[d!.args.indexOf("--mcp-config") + 1]).toBe(join(where.results, RUN, "no-mcp.json"));
    expect(mcp).toEqual(['{"mcpServers":{}}', '{"mcpServers":{}}']);
    // The d-* session keeps Motif's: its plugin, motif connect denied, and its environment.
    expect(d!.args.join(" ")).toContain("Bash(motif connect *)");
    expect(d!.env).toMatchObject({ MOTIF_NO_CONNECT: "1", Motif_Other: "y" });
    expect(d!.env.MOTIF_BIN).toBeDefined();
  });

  test("an a-* session has its d-* session's caps, tools and auto mode", async () => {
    const h = harness();
    await runEvals(["--cases", "d-stride,a-stride", "--work", h.work], h.deps, h.where);
    const [d, a] = h.calls.session;
    const flag = (s: SessionSpec, f: string) => s.args[s.args.indexOf(f) + 1];
    for (const f of ["--max-turns", "--max-budget-usd", "--tools", "--permission-mode", "--permission-prompts", "--setting-sources"]) expect(flag(a!, f)).toBe(flag(d!, f)!);
    expect(a!.timeoutMs).toBe(d!.timeoutMs);
    expect(d!.args).toContain("--plugin-dir");
    expect(d!.expect.pluginDir).toBe(join(h.root, "dist", "claude-code"));
    expect(d!.env.MOTIF_BIN).toBeDefined();
  });

  test("each a-* runs right after its d-*, whatever order they're named in", async () => {
    const h = harness();
    await runEvals(["--cases", "a-bloom,a-stride,d-bloom,d-stride", "--work", h.work], h.deps, h.where);
    expect(h.calls.prepare).toEqual(["d-stride", "a-stride", "d-bloom", "a-bloom"]);
  });

  test("with A chosen, a brief's d-* and a-* folders are kept after grading until both are graded, then the pair step runs, then they go", async () => {
    const h = paired();
    expect(await runEvals(["--cases", "d-stride,a-stride,d-bloom,a-bloom", "--work", h.work], h.deps, h.where)).toBe(0);
    const dir = (id: string) => join(h.work, RUN, id);
    expect(h.pairs).toEqual([
      { brief: "stride", d: dir("d-stride"), a: dir("a-stride"), removedBefore: [] },
      { brief: "bloom", d: dir("d-bloom"), a: dir("a-bloom"), removedBefore: [dir("d-stride"), dir("a-stride")] },
    ]);
    expect(h.calls.removed).toEqual([dir("d-stride"), dir("a-stride"), dir("d-bloom"), dir("a-bloom")]);
    expect(h.lines).toContain(
      `d-stride: keeping its folder (${dir("d-stride")}) for Test A until a-stride is graded too; then both are compared and removed. If a-stride never is, --resume this run to finish it, or delete the folder yourself.`,
    );
  });

  test("--keep keeps them after the pair step too", async () => {
    const h = paired();
    await runEvals(["--cases", "d-stride,a-stride", "--keep", "--work", h.work], h.deps, h.where);
    expect(h.pairs.map((p) => p.brief)).toEqual(["stride"]);
    expect(h.calls.removed).toEqual([]);
  });

  test("a pair cut by a usage limit keeps the graded side's folder; --resume finishes the other, then the pair step runs", async () => {
    let n = 0;
    const h = paired({ session: async (s) => (h.calls.session.push(s), ++n === 2 ? { ...finished(), end: "usage-limit" } : finished()) });
    expect(await runEvals(["--cases", "d-stride,a-stride", "--work", h.work], h.deps, h.where)).toBe(3);
    expect(h.calls.removed).toEqual([]);
    expect(h.pairs).toEqual([]);
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(h.pairs.map((p) => [p.brief, p.d, p.a])).toEqual([["stride", join(h.work, RUN, "d-stride"), join(h.work, RUN, "a-stride")]]);
    expect(h.calls.removed).toEqual([join(h.work, RUN, "d-stride"), join(h.work, RUN, "a-stride")]);
  });

  test("with only D chosen, nothing changes: each folder goes once it's graded, and there's no pair step", async () => {
    const h = paired();
    await runEvals(["--cases", "d-stride,d-bloom", "--work", h.work], h.deps, h.where);
    expect(h.calls.removed).toEqual([join(h.work, RUN, "d-stride"), join(h.work, RUN, "d-bloom")]);
    expect(h.pairs).toEqual([]);
  });

  test("an a-* app that doesn't build doesn't stop the run or fail its exit code: Test A scores it later", async () => {
    const h = paired({ collect: async (c) => (h.calls.collect.push(c.id), c.id === "a-stride" ? { pass: false, criteria: [{ id: "build", label: "The app builds", pass: false, detail: "The build failed (exit code 1)." }], metrics: {} } : PASS) });
    expect(await runEvals(["--cases", "d-stride,a-stride,d-bloom,a-bloom", "--work", h.work], h.deps, h.where)).toBe(0);
    expect(h.calls.collect).toEqual(["d-stride", "a-stride", "d-bloom", "a-bloom"]);
    expect(h.pairs.map((p) => p.brief)).toEqual(["stride", "bloom"]);
    const s = loadRun(h.where.results, RUN) as RunState;
    expect(s.cases["a-stride"]).toMatchObject({ status: "graded", grade: { pass: false } });
    // A d-* that fails still fails the run.
    const f = paired({ collect: async (c) => (c.id === "d-stride" ? { pass: false, criteria: [], metrics: {} } : PASS) });
    expect(await runEvals(["--cases", "d-stride,a-stride", "--work", f.work], f.deps, f.where)).toBe(1);
  });

  test("the pair step gets the run's folder, its line is logged, and the run records the brief's pairs as done", async () => {
    const seen: string[] = [];
    const h = paired({ afterBriefPair: async (brief, _d, _a, out) => (seen.push(out), `${brief}: 6 pairs for Test A, all with both apps' screens.`) });
    expect(await runEvals(["--cases", "d-stride,a-stride", "--work", h.work], h.deps, h.where)).toBe(0);
    expect(seen).toEqual([join(h.where.results, RUN)]);
    expect(h.lines).toContain("stride: 6 pairs for Test A, all with both apps' screens.");
    expect((loadRun(h.where.results, RUN) as RunState).pairs).toEqual({ stride: { done: true } });
  });

  test("a pair step that fails keeps both folders and says so; --resume runs only the step again, then removes them; a later --resume doesn't", async () => {
    let fail = true;
    const steps: string[] = [];
    const h = paired({
      afterBriefPair: async (brief) => {
        steps.push(brief);
        if (fail) throw new Error("the browser crashed");
      },
    });
    expect(await runEvals(["--cases", "d-stride,a-stride", "--work", h.work], h.deps, h.where)).toBe(0);
    expect(h.calls.removed).toEqual([]);
    expect(h.lines).toContain("d-stride and a-stride: Test A's step after both were graded failed (the browser crashed); both folders are kept. --resume runs it again.");
    expect((loadRun(h.where.results, RUN) as RunState).pairs).toEqual({ stride: { done: false, note: "the browser crashed" } });
    // The folders are still there to shoot.
    for (const id of ["d-stride", "a-stride"]) mkdirSync(join(h.work, RUN, id, "app"), { recursive: true });
    fail = false;
    const sessions = h.calls.session.length;
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(steps).toEqual(["stride", "stride"]);
    expect(h.calls.session.length).toBe(sessions);
    expect(h.calls.removed).toEqual([join(h.work, RUN, "d-stride"), join(h.work, RUN, "a-stride")]);
    expect((loadRun(h.where.results, RUN) as RunState).pairs).toEqual({ stride: { done: true } });
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(steps).toEqual(["stride", "stride"]);
  });

  test("--resume takes the pair steps of only the briefs whose two cases the run chose", async () => {
    const steps: string[] = [];
    let fail = true;
    const h = paired({
      afterBriefPair: async (brief) => {
        steps.push(brief);
        if (fail) throw new Error("no browser");
      },
    });
    // bloom's a-* isn't in this run; and a d-bloom/a-bloom pair graded in the record by hand, but not chosen, is left alone.
    await runEvals(["--cases", "d-stride,a-stride,d-bloom", "--work", h.work], h.deps, h.where);
    const s = loadRun(h.where.results, RUN) as RunState;
    s.pairs = { ...s.pairs, ledgerly: { done: false, note: "x" } };
    writeFileSync(join(h.where.results, RUN, "run.json"), JSON.stringify(s));
    fail = false;
    await runEvals(["--resume", RUN], h.deps, h.where);
    expect(steps).toEqual(["stride", "stride"]);
  });

  test("--resume doesn't run the pair step again for a brief whose pairs are done, even with its folders kept", async () => {
    const steps: string[] = [];
    const h = paired({ afterBriefPair: async (brief) => void steps.push(brief) });
    await runEvals(["--cases", "d-stride,a-stride", "--keep", "--work", h.work], h.deps, h.where);
    for (const id of ["d-stride", "a-stride"]) mkdirSync(join(h.work, RUN, id, "app"), { recursive: true });
    await runEvals(["--resume", RUN], h.deps, h.where);
    expect(steps).toEqual(["stride"]);
  });

  test("a pair step left undone whose folders are gone is said, not run", async () => {
    const h = paired({ afterBriefPair: async () => { throw new Error("no browser"); } });
    await runEvals(["--cases", "d-stride,a-stride", "--work", h.work], h.deps, h.where);
    for (const id of ["d-stride", "a-stride"]) rmSync(join(h.work, RUN, id), { recursive: true, force: true });
    const steps: string[] = [];
    h.deps.afterBriefPair = async (brief) => void steps.push(brief);
    await runEvals(["--resume", RUN], h.deps, h.where);
    expect(steps).toEqual([]);
    expect(h.lines).toContain(`stride: Test A's screenshots weren't taken, and the folders of d-stride and a-stride are gone, so they can't be now.`);
  });

  test("the dry run's a-* command has no plugin", async () => {
    const h = harness();
    await runEvals(["--dry-run", "--cases", "a-stride"], h.deps, h.where);
    const text = h.lines.join("\n");
    expect(text).toContain("a-stride: ");
    expect(text).not.toContain("--plugin-dir");
    expect(text).not.toContain("/motif:");
  });
});
