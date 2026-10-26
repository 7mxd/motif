import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EvalCase } from "../../tests/evals/cases";
import type { Grade } from "../../tests/evals/grade";
import {
  briefParts, judgeAPrompt, JUDGE_A_EXPECTED_TOOLS, JUDGE_A_SCHEMA, judgementsFile, pairResult, readBriefParts, readJudgements, RUBRIC_A, type JudgePick,
} from "../../tests/evals/judge-a";
import { pairsFile, type Pair } from "../../tests/evals/pairs";
import { runEvals, type RunDeps } from "../../tests/evals/run";
import type { SessionOutcome, SessionSpec } from "../../tests/evals/session";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const BRIEFS = join(import.meta.dir, "..", "..", "tests", "fixtures", "briefs");
const briefNames = readdirSync(BRIEFS).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));

describe("pairResult: a side wins only when both judgements pick it", () => {
  // The first judgement has Motif on the left, the second on the right.
  const table: [JudgePick, JudgePick, "motif" | "baseline" | "tie"][] = [
    ["left", "right", "motif"],
    ["right", "left", "baseline"],
    ["left", "left", "tie"],
    ["right", "right", "tie"],
    ["tie", "tie", "tie"],
    ["left", "tie", "tie"],
    ["tie", "right", "tie"],
    ["right", "tie", "tie"],
    ["tie", "left", "tie"],
  ];
  for (const [first, second, want] of table) test(`${first}, then ${second}: ${want}`, () => expect(pairResult(first, second)).toBe(want));
});

describe("the judge's question", () => {
  const bloom = readBriefParts("bloom");

  test("answers left, right or tie, and one sentence why", () => {
    const schema = JSON.parse(JSON.stringify(JUDGE_A_SCHEMA));
    expect(schema.required).toEqual(["pick", "why"]);
    expect(schema.properties.pick.enum).toEqual(["left", "right", "tie"]);
    expect(schema.additionalProperties).toBe(false);
  });

  test("every brief has the three sections the judge sees", () => {
    for (const b of briefNames) {
      const p = readBriefParts(b);
      for (const s of [p.whatItIs, p.whoItsFor, p.feel]) expect(s.length).toBeGreaterThan(10);
    }
    expect(bloom.feel).toBe("Playful, fresh, gentle, reassuring.");
  });

  test("a brief missing a section is an error, not a silent blank", () => {
    expect(() => briefParts("# X\n\n## What it is\nA thing.\n\n## Feel\nCalm.\n")).toThrow("Who it's for");
  });

  test("the prompt holds the brief's three sections and the rubric, and no other brief text", () => {
    const md = readFileSync(join(BRIEFS, "bloom.md"), "utf8");
    const p = judgeAPrompt(bloom, "RUBRIC TEXT");
    for (const s of [bloom.whatItIs, bloom.whoItsFor, bloom.feel, "RUBRIC TEXT"]) expect(p).toContain(s);
    // Platform, Brand, Apps they like and First screens are left out, and so is the brief's title.
    for (const s of ["A React web app, phone first.", "Greens are welcome", "Duolingo", "A welcome page, sign-in", "# Bloom", "## Platform"]) {
      expect(md).toContain(s);
      expect(p).not.toContain(s);
    }
  });

  test("it names the two images only as Left (left.png) and Right (right.png) in its own folder", () => {
    const p = judgeAPrompt(bloom, "R");
    expect(p).toContain('"Left" is left.png');
    expect(p).toContain('"Right" is right.png');
    expect(p).not.toMatch(/[0-9a-f]{12}\.png|img\//);
  });

  test("nothing it says, outside the brief's own words, names a side: no motif, baseline, d-/a-, with or without", () => {
    for (const b of briefNames) {
      const parts = readBriefParts(b);
      let p = judgeAPrompt(parts, readFileSync(RUBRIC_A, "utf8"));
      for (const s of [parts.whatItIs, parts.whoItsFor, parts.feel]) p = p.replace(s, "");
      expect(p).not.toMatch(/motif|baseline|\bd-|\ba-|\bwith\b|\bwithout\b/i);
      expect(`${parts.whatItIs} ${parts.whoItsFor} ${parts.feel}`).not.toMatch(/motif|baseline/i);
    }
  });
});

describe("rubric-a.md", () => {
  const r = existsSync(RUBRIC_A) ? readFileSync(RUBRIC_A, "utf8") : "";
  test("has the six criteria of spec §6", () => {
    for (const s of ["hierarchy", "Consistency", "Typography", "Colour and contrast", "Polish", "Fit to the brief"]) expect(r).toContain(s);
  });
  test("a screen that fails to render or shows an error loses; a tie only when genuinely equal; placeholder data is ignored; one sentence why", () => {
    for (const s of ["loses", "genuinely", "placeholder", "one sentence"]) expect(r.toLowerCase()).toContain(s);
  });
});

// The runner: each `both` pair judged twice, sides swapped, saved as it goes, resumable.

const RUN = "20261014-120000";
const PASS: Grade = { pass: true, criteria: [], metrics: {} };
const init = (tools = ["Read"]) => ({ model: "m", permissionMode: "auto", apiKeySource: "none", mcpServers: [], plugins: [], tools, skills: [], agents: [], version: "x" });
const finished = (structured?: unknown): SessionOutcome => ({
  end: "finished", init: init(),
  result: { subtype: "success", isError: false, turns: 2, costUsd: 0.1, durationMs: 1, denials: [], text: "", apiErrorStatus: null, ...(structured !== undefined ? { structured } : {}) },
  problems: [], minutes: 1,
});
const isJudge = (s: SessionSpec) => s.args.includes("--json-schema");

/** Four stride pairs: two with both apps' screens, one with only Motif's, one with neither. Images hold their name as bytes. */
function writePairs(out: string): Pair[] {
  mkdirSync(join(out, "a", "img"), { recursive: true });
  const img = (id: string) => (writeFileSync(join(out, "a", "img", `${id}.png`), `bytes of ${id}`), `a/img/${id}.png`);
  const pairs: Pair[] = [
    { id: "aaaaaaaaaaa1", brief: "stride", screen: "/", size: 390, motif: img("111111111111"), baseline: img("222222222222"), outcome: "both" },
    { id: "aaaaaaaaaaa2", brief: "stride", screen: "/", size: 1440, motif: img("333333333333"), baseline: img("444444444444"), outcome: "both" },
    { id: "aaaaaaaaaaa3", brief: "stride", screen: "/sign-in", size: 390, motif: img("555555555555"), outcome: "motif-only", why: "x" },
    { id: "aaaaaaaaaaa4", brief: "stride", screen: "/sign-in", size: 1440, outcome: "neither", why: "y" },
  ];
  writeFileSync(join(out, pairsFile), JSON.stringify(pairs));
  return pairs;
}

interface Seen { cwd: string; files: string[]; left: string; right: string; mcp: string; spec: SessionSpec }

function harness(over: Partial<RunDeps> = {}, judgeAnswer: (n: number, seen: Seen) => SessionOutcome = (_n, s) => finished({ pick: s.left.includes("1111") || s.left.includes("3333") ? "left" : "right", why: "Clearer." })) {
  const root = tempDir("evals-judge-a-");
  const seen: Seen[] = [];
  const agents: SessionSpec[] = [];
  const lines: string[] = [];
  const removed: string[] = [];
  const purged: string[] = [];
  let n = 0;
  const deps: RunDeps = {
    preflight: async () => ({ claude: "claude-exe", claudeVersion: "2.1.301 (Claude Code)", browser: true, purge: true }),
    prepare: async (_c: EvalCase, dir: string) => (mkdirSync(join(dir, "app"), { recursive: true }), { dir, app: join(dir, "app"), gitDir: join(dir, "baseline.git") }),
    session: async (s) => {
      if (!isJudge(s)) return (agents.push(s), finished());
      const files = readdirSync(s.cwd).sort();
      const read = (f: string) => (existsSync(join(s.cwd, f)) ? readFileSync(join(s.cwd, f), "utf8") : "");
      const mcpFile = s.args[s.args.indexOf("--mcp-config") + 1]!;
      const x: Seen = { cwd: s.cwd, files, left: read("left.png"), right: read("right.png"), mcp: existsSync(mcpFile) ? readFileSync(mcpFile, "utf8") : "", spec: s };
      seen.push(x);
      return judgeAnswer(++n, x);
    },
    collect: async () => PASS,
    purge: async (_claude, cwd) => void purged.push(cwd),
    removeData: () => {},
    removeDir: (dir) => void removed.push(dir),
    git: () => ({ commit: "abc1234567890", dirty: false }),
    now: () => new Date(2026, 9, 14, 12, 0, 0),
    log: (l) => lines.push(l),
    env: { PATH: "/bin", MOTIF_BIN: "/x/motif", MOTIF_NO_CONNECT: "1" },
    instructionFiles: () => [],
    personal: () => ["apple-design"],
    agentSettings: () => ({ "~/.claude.json": "{}" }),
    afterBriefPair: async (brief, _d, _a, out) => (writePairs(out), `${brief}: 4 pairs for Test A.`),
    ...over,
  };
  const where = { repo: join(root, "repo"), results: join(root, "results"), work: join(root, "work") };
  return { deps, seen, agents, lines, removed, purged, root, where, out: join(where.results, RUN) };
}

describe("the runner's AI judges (Test A, Part 4 §6)", () => {
  test("only the pairs with both apps' screens are judged, each twice: Motif's on the left, then on the right", async () => {
    const h = harness();
    expect(await runEvals(["--cases", "d-stride,a-stride", "--work", join(h.root, "cases")], h.deps, h.where)).toBe(0);
    expect(h.seen.map((s) => [s.left, s.right])).toEqual([
      ["bytes of 111111111111", "bytes of 222222222222"],
      ["bytes of 222222222222", "bytes of 111111111111"],
      ["bytes of 333333333333", "bytes of 444444444444"],
      ["bytes of 444444444444", "bytes of 333333333333"],
    ]);
    expect(readJudgements(h.out)).toEqual([
      { pairId: "aaaaaaaaaaa1", order: "motif-left", pick: "left", why: "Clearer." },
      { pairId: "aaaaaaaaaaa1", order: "motif-right", pick: "right", why: "Clearer." },
      { pairId: "aaaaaaaaaaa2", order: "motif-left", pick: "left", why: "Clearer." },
      { pairId: "aaaaaaaaaaa2", order: "motif-right", pick: "right", why: "Clearer." },
    ]);
    expect(existsSync(join(h.out, judgementsFile))).toBe(true);
  });

  test("each judge sees only left.png and right.png in a folder of its own, outside the run's folder, and it's gone after", async () => {
    const h = harness();
    await runEvals(["--cases", "d-stride,a-stride", "--work", join(h.root, "cases")], h.deps, h.where);
    expect(h.seen).toHaveLength(4);
    for (const s of h.seen) {
      expect(s.mcp).toBe('{"mcpServers":{}}');
      expect(s.files.filter((f) => f !== "tmp")).toEqual(["left.png", "right.png"]);
      // Not in the run's results, nor beside the case folders.
      expect(resolve(s.cwd).startsWith(resolve(h.root))).toBe(false);
      expect(s.cwd).not.toMatch(/motif|baseline|pairs|\bd-|\ba-/i);
      expect(existsSync(s.cwd)).toBe(false);
    }
    expect(h.purged).toEqual(expect.arrayContaining(h.seen.map((s) => s.cwd)));
  });

  test("the judge is read-only and isolated: Read alone, no folder added, no Motif in its arguments, environment or prompt", async () => {
    const h = harness();
    await runEvals(["--cases", "d-stride,a-stride", "--judge-model", "judge-x", "--work", join(h.root, "cases")], h.deps, h.where);
    expect(h.seen).toHaveLength(4);
    for (const { spec } of h.seen) {
      const flag = (f: string) => spec.args[spec.args.indexOf(f) + 1];
      expect(flag("--tools")).toBe("Read");
      expect(flag("--model")).toBe("judge-x");
      expect(flag("--setting-sources")).toBe("local");
      expect(spec.args).toContain("--strict-mcp-config");
      expect(spec.args).toContain("--no-session-persistence");
      expect(spec.args).not.toContain("--add-dir");
      expect(spec.args).not.toContain("--plugin-dir");
      expect(JSON.parse(flag("--json-schema")!)).toEqual(JSON.parse(JSON.stringify(JUDGE_A_SCHEMA)));
      expect(spec.args.filter((a) => a === "--mcp-config")).toHaveLength(1);
      expect(spec.args.join(" ")).not.toMatch(/motif|baseline/i);
      expect(JSON.stringify(spec.env)).not.toMatch(/motif/i);
      expect(spec.prompt).not.toMatch(/motif|baseline|aaaaaaaaaaa|1111|2222/i);
      expect(spec.prompt).toContain(readBriefParts("stride").feel);
      expect(spec.expect).toEqual({ auto: false, tools: JUDGE_A_EXPECTED_TOOLS, personal: ["apple-design"] });
      // Its transcript is kept in the run's results.
      expect(spec.transcript.startsWith(join(h.out, "a"))).toBe(true);
    }
    expect(JUDGE_A_EXPECTED_TOOLS).toEqual(["Read", "StructuredOutput"]);
  });

  test("a usage limit after N judgements pauses the run; --resume judges only what's left, and the finished judgements stand", async () => {
    const h = harness({}, (n, s) => (n === 3 ? { ...finished(), end: "usage-limit", resetsAt: 1792000800 } : finished({ pick: "tie", why: `call ${n} ${s.left}` })));
    expect(await runEvals(["--cases", "d-stride,a-stride", "--work", join(h.root, "cases")], h.deps, h.where)).toBe(3);
    expect(h.lines.join("\n")).toContain(`Paused: your Claude plan's usage limit was reached`);
    const before = readJudgements(h.out);
    expect(before.map((j) => [j.pairId, j.order])).toEqual([["aaaaaaaaaaa1", "motif-left"], ["aaaaaaaaaaa1", "motif-right"]]);
    const agentSessions = h.agents.length;
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    // Calls 4 and 5: the third pair's two judgements, nothing else; no app is built or shot again.
    expect(h.seen).toHaveLength(5);
    expect(h.seen.slice(3).map((s) => [s.left, s.right])).toEqual([["bytes of 333333333333", "bytes of 444444444444"], ["bytes of 444444444444", "bytes of 333333333333"]]);
    expect(h.agents.length).toBe(agentSessions);
    const after = readJudgements(h.out);
    expect(after.slice(0, 2)).toEqual(before);
    expect(after.map((j) => [j.pairId, j.order])).toEqual([
      ["aaaaaaaaaaa1", "motif-left"], ["aaaaaaaaaaa1", "motif-right"], ["aaaaaaaaaaa2", "motif-left"], ["aaaaaaaaaaa2", "motif-right"],
    ]);
    // A later --resume judges nothing more.
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(h.seen).toHaveLength(5);
  });

  test("off a Mac, with Masar skipped, --resume still judges what's left before saying nothing is left to run", async () => {
    const h = harness({ platform: "linux" }, (n) => (n === 2 ? { ...finished(), end: "usage-limit" } : finished({ pick: "left", why: "w" })));
    expect(await runEvals(["--cases", "d-stride,a-stride,d-masar,a-masar", "--work", join(h.root, "cases")], h.deps, h.where)).toBe(3);
    expect(readJudgements(h.out)).toHaveLength(1);
    await runEvals(["--resume", RUN], h.deps, h.where);
    expect(readJudgements(h.out)).toHaveLength(4);
  });

  test("a judge that gives no usable answer is said, the run goes on, and --resume asks again", async () => {
    let bad = true;
    const h = harness({}, (n) => (bad && n === 1 ? finished({ pick: "both", why: "?" }) : finished({ pick: "left", why: "w" })));
    expect(await runEvals(["--cases", "d-stride,a-stride", "--work", join(h.root, "cases")], h.deps, h.where)).toBe(0);
    expect(h.seen).toHaveLength(4);
    expect(readJudgements(h.out)).toHaveLength(3);
    expect(h.lines.some((l) => /couldn't be judged/.test(l) && l.includes("--resume"))).toBe(true);
    bad = false;
    await runEvals(["--resume", RUN], h.deps, h.where);
    expect(h.seen).toHaveLength(5);
    expect(readJudgements(h.out).map((j) => [j.pairId, j.order]).sort()).toEqual([
      ["aaaaaaaaaaa1", "motif-left"], ["aaaaaaaaaaa1", "motif-right"], ["aaaaaaaaaaa2", "motif-left"], ["aaaaaaaaaaa2", "motif-right"],
    ]);
  });

  test("a judge session that isn't isolated stops the run", async () => {
    const h = harness({}, () => ({ ...finished(), end: "not-isolated", problems: ["MCP servers were loaded (x)."] }));
    expect(await runEvals(["--cases", "d-stride,a-stride", "--work", join(h.root, "cases")], h.deps, h.where)).toBe(2);
    expect(h.lines).toContain("\nStopped: MCP servers were loaded (x).");
    expect(h.seen).toHaveLength(1);
    expect(readJudgements(h.out)).toEqual([]);
  });

  test("a run without Test A's pairs starts no judge", async () => {
    const h = harness();
    await runEvals(["--cases", "d-stride", "--work", join(h.root, "cases")], h.deps, h.where);
    expect(h.seen).toEqual([]);
    expect(existsSync(join(h.out, judgementsFile))).toBe(false);
  });
});
