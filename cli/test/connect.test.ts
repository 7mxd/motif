import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { genericConfig, runCommand, runConnect, selfCommand, spawnArgs, type ConnectDeps } from "../src/commands/connect";
import type { ConfiguredSource } from "../src/detect/sources";
import { sourceById } from "../src/sources/catalog";
import { tempDir } from "./tmp";

function fakes(over: Partial<ConnectDeps> & { connected?: ConfiguredSource[]; claudeExit?: number; gitTracked?: boolean; key?: string } = {}) {
  const calls = { runs: [] as { exe: string; args: string[] }[], prompts: 0 };
  const { connected = [], claudeExit = 0, gitTracked = false, key = "secret-key", ...rest } = over;
  const deps: ConnectDeps = {
    which: (cmd) => (cmd === "claude" ? "/usr/bin/claude" : cmd === "git" ? "/usr/bin/git" : null),
    run: async (exe, args) => {
      calls.runs.push({ exe, args });
      if (exe.endsWith("git")) return { code: gitTracked ? 0 : 1, output: "" };
      return { code: claudeExit, output: claudeExit === 0 ? "Added HTTP MCP server" : "MCP server 21st already exists in user config" };
    },
    interactive: true,
    readSecret: async () => {
      calls.prompts++;
      return key;
    },
    configured: () => connected,
    home: "/home/dev",
    self: "motif",
    ...rest,
  };
  return { deps, calls };
}
const ctx = (...positionals: string[]) => ({ positionals });
const claudeRuns = (runs: { exe: string; args: string[] }[]) => runs.filter((r) => r.exe.endsWith("claude"));

describe("motif connect (no source)", () => {
  test("lists every source with what it adds, its cost, and how to connect it", async () => {
    const { deps } = fakes({ connected: [{ id: "motion", agent: "claude", server: "motion", where: ".mcp.json" }] });
    const r = await runConnect(".", ctx(), deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("✓ Motion");
    expect(r.text).toContain("motif connect refero");
    expect(r.text).toContain("Supahero");
    expect((r.data.sources as { id: string; connected: boolean }[]).map((s) => [s.id, s.connected])).toEqual([
      ["motion", true], ["refero", false], ["21st", false], ["60fps", false],
    ]);
    expect(r.text).toContain("In: Claude Code");
    expect((r.data.sources as { id: string; agents: string[] }[]).find((s) => s.id === "motion")!.agents).toEqual(["claude"]);
  });
});

describe("motif connect <source>", () => {
  test("an unknown source lists the real ones", async () => {
    const r = await runConnect(".", ctx("dribbble"), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("motion, refero, 21st, 60fps");
  });

  test("without Claude Code, it shows the settings to paste into another agent", async () => {
    const { deps, calls } = fakes({ which: () => null });
    const r = await runConnect(".", ctx("refero"), deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("https://api.refero.design/mcp");
    expect(calls.runs).toEqual([]);
  });

  test("an already connected source is left alone", async () => {
    const { deps, calls } = fakes({ connected: [{ id: "refero", agent: "claude", server: "refero", where: "~/.claude.json" }] });
    const r = await runConnect(".", ctx("refero"), deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("~/.claude.json");
    expect(calls.runs).toEqual([]);
  });

  test("Motion needs no account", async () => {
    const { deps, calls } = fakes();
    const r = await runConnect(".", ctx("motion"), deps);
    expect(r.exitCode).toBe(0);
    expect(claudeRuns(calls.runs)[0]!.args).toEqual(["mcp", "add", "--transport", "http", "--scope", "user", "motion", "https://mcp.motion.dev"]);
    expect(r.text).not.toContain("/mcp");
    expect(calls.prompts).toBe(0);
  });

  test("Refero and 60fps sign in inside Claude Code", async () => {
    const { deps, calls } = fakes();
    const r = await runConnect(".", ctx("60fps"), deps);
    expect(r.exitCode).toBe(0);
    expect(claudeRuns(calls.runs)[0]!.args).toEqual(["mcp", "add", "--transport", "http", "--scope", "user", "60fps", "https://mcp.60fps.design/mcp"]);
    expect(r.text).toContain("/mcp");
    expect(calls.prompts).toBe(0);
  });

  test("a key is never read without the developer's own terminal", async () => {
    const { deps, calls } = fakes({ interactive: false });
    const r = await runConnect(".", ctx("21st"), deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("your own terminal");
    expect(calls.prompts).toBe(0);
    expect(calls.runs).toEqual([]);
  });

  test("a key is read hidden and stored in Claude Code's user settings", async () => {
    const { deps, calls } = fakes();
    const r = await runConnect(".", ctx("21st"), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.prompts).toBe(1);
    expect(claudeRuns(calls.runs)[0]!.args).toEqual([
      "mcp", "add", "--header", "x-api-key: secret-key", "--transport", "http", "--scope", "user", "21st", "https://21st.dev/api/mcp",
    ]);
    expect(r.text).not.toContain("secret-key");
    expect(JSON.stringify(r.data)).not.toContain("secret-key");
    expect(r.text).not.toContain("tracked by git");
  });

  test("warns when the settings file holding the key is tracked by git", async () => {
    const r = await runConnect(".", ctx("21st"), fakes({ gitTracked: true }).deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("tracked by git");
  });

  test("an empty key changes nothing", async () => {
    const { deps, calls } = fakes({ key: "" });
    const r = await runConnect(".", ctx("21st"), deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Nothing changed");
    expect(claudeRuns(calls.runs)).toEqual([]);
  });

  test("when Claude Code refuses, its message and the manual settings are shown", async () => {
    const r = await runConnect(".", ctx("refero"), fakes({ claudeExit: 1 }).deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("already exists");
    expect(r.text).toContain("https://api.refero.design/mcp");
  });
});

describe("running claude", () => {
  test("npm's .cmd shims on Windows go through cmd.exe with every argument quoted", () => {
    expect(spawnArgs("C:\\Users\\me\\npm\\claude.cmd", ["mcp", "add", "--header", "x-api-key: a&b"], "win32")).toEqual({
      cmd: ["cmd.exe", "/d", "/s", "/c", '""C:\\Users\\me\\npm\\claude.cmd" "mcp" "add" "--header" "x-api-key: a&b""'],
      verbatim: true,
    });
    expect(spawnArgs("C:\\tools\\claude.exe", ["mcp"], "win32")).toEqual({ cmd: ["C:\\tools\\claude.exe", "mcp"], verbatim: false });
    expect(spawnArgs("/usr/bin/claude", ["mcp"], "linux")).toEqual({ cmd: ["/usr/bin/claude", "mcp"], verbatim: false });
  });

  test.skipIf(process.platform !== "win32")("arguments reach a .cmd file intact, even in a folder with spaces", async () => {
    const dir = tempDir("motif cmd ");
    const shim = join(dir, "echoargs.cmd");
    // %1 keeps each argument's quotes, so the echo itself can't misread & or |.
    writeFileSync(shim, "@echo off\r\necho [%1] [%2]\r\n");
    const r = await runCommand(shim, ["--header", "x-api-key: ab&c|d^e"]);
    expect(r).toEqual({ code: 0, output: '["--header"] ["x-api-key: ab&c|d^e"]' });
  });

  test("genericConfig is the JSON other agents take, with a key placeholder where one is needed", () => {
    expect(JSON.parse(genericConfig(sourceById("21st")!))).toEqual({
      mcpServers: { "21st": { type: "http", url: "https://21st.dev/api/mcp", headers: { "x-api-key": "<your 21st.dev key>" } } },
    });
    expect(JSON.parse(genericConfig(sourceById("motion")!))).toEqual({ mcpServers: { motion: { type: "http", url: "https://mcp.motion.dev" } } });
  });
});

describe("motif connect: from the final review", () => {
  test("the refusal gives the developer a command they can run, also in --json", async () => {
    const r = await runConnect(".", ctx("21st"), fakes({ interactive: false, self: "C:/Users/me/.motif/bin/0.1.0/motif.exe" }).deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("C:/Users/me/.motif/bin/0.1.0/motif.exe connect 21st");
    expect(r.data.run).toBe("C:/Users/me/.motif/bin/0.1.0/motif.exe connect 21st");
  });

  test("when Claude Code refuses, --json carries its message and the manual settings", async () => {
    const r = await runConnect(".", ctx("refero"), fakes({ claudeExit: 1 }).deps);
    expect(r.data.output).toContain("already exists");
    expect(r.data.config).toEqual({ mcpServers: { refero: { type: "http", url: "https://api.refero.design/mcp" } } });
  });

  test("a key echoed back by a failing claude never reaches the output", async () => {
    const run = async (_exe: string, args: string[]) => ({ code: 1, output: `error: invalid header ${args[3]}` });
    const r = await runConnect(".", ctx("21st"), fakes({ run, key: "abcd1234efgh" }).deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("<your key>");
    expect(r.text + JSON.stringify(r.data)).not.toContain("abcd1234efgh");
  });

  test("something that isn't a key is refused before anything runs", async () => {
    for (const key of ["ab%PATH%cd1234", "tr\\ail\\key\\", "x-api-key: abcdef123", '"abcdefgh123"', "abc[Adefgh123", "short"]) {
      const { deps, calls } = fakes({ key });
      const r = await runConnect(".", ctx("21st"), deps);
      expect(r.exitCode).toBe(2);
      expect(r.text).toContain("doesn't look like a 21st.dev key");
      expect(r.text).toContain("Nothing changed");
      expect(r.text).not.toContain(key);
      expect(claudeRuns(calls.runs)).toEqual([]);
    }
    const ok = fakes({ key: "an_api-KEY.123+/=" });
    expect((await runConnect(".", ctx("21st"), ok.deps)).exitCode).toBe(0);
  });

  test("a source that is set up but not signed in says how to sign in", async () => {
    const r = await runConnect(".", ctx("refero"), fakes({ connected: [{ id: "refero", agent: "claude", server: "refero", where: "~/.claude.json" }] }).deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("/mcp");
    const motion = await runConnect(".", ctx("motion"), fakes({ connected: [{ id: "motion", agent: "claude", server: "motion", where: "~/.claude.json" }] }).deps);
    expect(motion.text).not.toContain("/mcp");
  });
});

describe("selfCommand", () => {
  test("the compiled tool names itself by a path every shell can run", () => {
    expect(selfCommand("C:\\Users\\PC\\.motif\\bin\\0.1.0\\motif.exe", "win32")).toBe("C:/Users/PC/.motif/bin/0.1.0/motif.exe");
    expect(selfCommand("C:\\Users\\Jo Smith\\.motif\\bin\\0.1.0\\motif.exe", "win32")).toBe('"C:/Users/Jo Smith/.motif/bin/0.1.0/motif.exe"');
    expect(selfCommand("/home/jo/.motif/bin/0.1.0/motif", "linux")).toBe("/home/jo/.motif/bin/0.1.0/motif");
    expect(selfCommand("/Users/Jo Smith/.motif/bin/0.1.0/motif", "darwin")).toBe("'/Users/Jo Smith/.motif/bin/0.1.0/motif'");
  });
  test("when run from source (by bun), it's just motif", () => {
    expect(selfCommand("C:\\Users\\PC\\.bun\\bin\\bun.exe", "win32")).toBe("motif");
    expect(selfCommand("/usr/local/bin/bun", "linux")).toBe("motif");
  });
});
