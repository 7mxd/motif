import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_TOOLS, agentArgs } from "../../tests/evals/claude";
import { runSession, type SessionSpec } from "../../tests/evals/session";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const FAKE = join(import.meta.dir, "fixtures", "evals", "fake-claude.ts");

function spec(scenario: object, over: Partial<SessionSpec> = {}): SessionSpec & { record: string } {
  const dir = tempDir("motif-session-");
  const pluginDir = join(dir, "plugin");
  writeFileSync(join(dir, "scenario.json"), JSON.stringify(scenario));
  const record = join(dir, "record.json");
  return {
    command: [process.execPath, FAKE],
    args: agentArgs({ pluginDir, mcpConfigFile: join(dir, "no-mcp.json"), maxTurns: 5, maxBudgetUsd: 1 }),
    cwd: dir,
    env: { ...(process.env as Record<string, string>), FAKE_CLAUDE_SCENARIO: join(dir, "scenario.json"), FAKE_CLAUDE_RECORD: record },
    prompt: "/motif:feature Add a settings screen.",
    transcript: join(dir, "out", "session.jsonl"),
    timeoutMs: 60_000,
    expect: { pluginDir, auto: true, tools: AGENT_TOOLS },
    record,
    ...over,
  };
}

describe("a session", () => {
  test("finishes: the prompt arrives on standard input and every event is saved", async () => {
    const s = spec({});
    const o = await runSession(s);
    expect(o.end).toBe("finished");
    expect(o.init?.model).toBe("fake-model");
    expect(o.result?.turns).toBe(3);
    expect(o.problems).toEqual([]);
    expect(JSON.parse(readFileSync(s.record, "utf8")).prompt).toBe("/motif:feature Add a settings screen.");
    expect(readFileSync(s.transcript, "utf8").trim().split("\n")).toHaveLength(2);
  });

  test("is stopped at once when it isn't isolated", async () => {
    const started = Date.now();
    const o = await runSession(spec({ init: { mcp_servers: [{ name: "refero" }] }, hangMs: 30_000 }));
    expect(o.end).toBe("not-isolated");
    expect(o.problems.join(" ")).toContain("refero");
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  test("is stopped at once when its first event doesn't describe the session (a renamed or missing init event)", async () => {
    const started = Date.now();
    const o = await runSession(spec({ init: { subtype: "started" }, hangMs: 30_000 }));
    expect(o.end).toBe("not-isolated");
    expect(o.problems.join(" ")).toContain("first event");
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  test("pauses on the developer's usage limit", async () => {
    const o = await runSession(spec({
      events: [{ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1792000800 } }],
      result: { is_error: true, result: "You've hit your limit" },
    }));
    expect(o.end).toBe("usage-limit");
    expect(o.resetsAt).toBe(1792000800);
  });

  test("is stopped, with everything it started, at its time limit", async () => {
    const started = Date.now();
    const o = await runSession(spec({ hangMs: 60_000 }, { timeoutMs: 1500 }));
    expect(o.end).toBe("time-limit");
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  test("reports its caps", async () => {
    expect((await runSession(spec({ result: { subtype: "error_max_turns", is_error: true } }))).end).toBe("turn-cap");
    expect((await runSession(spec({ result: { subtype: "error_max_budget_usd", is_error: true } }))).end).toBe("budget-cap");
  });

  test("says why when Claude Code stops unexpectedly", async () => {
    const o = await runSession(spec({ result: null, exitCode: 1, stderr: "Invalid API key" }));
    expect(o.end).toBe("failed");
    expect(o.problems.join(" ")).toContain("Invalid API key");
  });

  test("a program that doesn't exist fails without throwing", async () => {
    const o = await runSession(spec({}, { command: [join(tempDir("motif-none-"), "no-such-claude")] }));
    expect(o.end).toBe("failed");
    expect(o.init).toBeUndefined();
  });
});

describe("a session's processes and output (backlog)", () => {
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const childPid = async (file: string) => {
    for (let i = 0; i < 50 && !existsSync(file); i++) await Bun.sleep(100);
    return Number(readFileSync(file, "utf8"));
  };

  test("at its time limit, what it started is stopped too", async () => {
    const s = spec({ hangMs: 60_000 }, { timeoutMs: 3000 });
    const pidFile = join(s.cwd, "child.pid");
    writeFileSync(join(s.cwd, "scenario.json"), JSON.stringify({ hangMs: 60_000, child: pidFile }));
    const o = await runSession(s);
    expect(o.end).toBe("time-limit");
    const pid = await childPid(pidFile);
    await Bun.sleep(500);
    expect(alive(pid)).toBe(false);
  });

  test.skipIf(process.platform === "win32")("it's asked to stop before it's made to, and what it left running after a normal end is stopped", async () => {
    const s = spec({}, { timeoutMs: 3000 });
    const termFile = join(s.cwd, "term.txt");
    writeFileSync(join(s.cwd, "scenario.json"), JSON.stringify({ hangMs: 60_000, onTerm: termFile }));
    expect((await runSession(s)).end).toBe("time-limit");
    expect(existsSync(termFile)).toBe(true);

    const t = spec({});
    const pidFile = join(t.cwd, "child.pid");
    writeFileSync(join(t.cwd, "scenario.json"), JSON.stringify({ child: pidFile }));
    expect((await runSession(t)).end).toBe("finished");
    const pid = await childPid(pidFile);
    await Bun.sleep(500);
    expect(alive(pid)).toBe(false);
  });

  test("a character split across two pieces of output is saved whole", async () => {
    const s = spec({ split: "café" });
    expect((await runSession(s)).end).toBe("finished");
    expect(readFileSync(s.transcript, "utf8")).toContain("café");
  });
});
