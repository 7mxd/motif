import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { genericConfig, readLine, runCommand, runConnect, selfCommand, spawnArgs, type ConnectDeps } from "../src/commands/connect";
import type { ConfiguredSource } from "../src/detect/sources";
import { sourceById } from "../src/sources/catalog";
import { tempDir } from "./tmp";

/** Whether this machine lets a test make a file link (Windows needs Developer Mode or an admin). */
const canSymlink = (() => {
  try {
    const d = tempDir("motif-link-");
    writeFileSync(join(d, "a"), "");
    symlinkSync(join(d, "a"), join(d, "b"), "file");
    return true;
  } catch {
    return false;
  }
})();

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
    ask: async () => "",
    configured: () => connected,
    home: "/home/dev",
    platform: "linux",
    vars: {},
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

describe("motif connect: every agent (Part 3)", () => {
  /** A temp home where the given agents are installed: by command, or Cursor and VS Code by their settings folder. */
  function setup(agents: string[], over: Partial<ConnectDeps> & { answer?: string; key?: string; tracked?: (args: string[]) => boolean } = {}) {
    const home = tempDir("motif-connect-home-");
    if (agents.includes("cursor")) mkdirSync(join(home, ".cursor"));
    if (agents.includes("vscode")) mkdirSync(join(home, ".config", "Code", "User"), { recursive: true });
    const clis = agents.filter((a) => a !== "cursor" && a !== "vscode");
    const calls = { runs: [] as { cli: string; args: string[] }[], asked: [] as string[], prompts: 0 };
    const { answer = "", key = "secret-key-1", tracked = () => false, ...rest } = over;
    const deps: ConnectDeps = {
      which: (c) => (clis.includes(c) || c === "git" ? `/bin/${c}` : null),
      run: async (exe, args) => {
        const cli = exe.split("/").pop()!;
        calls.runs.push({ cli, args });
        if (cli === "git") return { code: tracked(args) ? 0 : 1, output: "" };
        return { code: 0, output: "added" };
      },
      interactive: true,
      readSecret: async () => {
        calls.prompts++;
        return key;
      },
      ask: async (q) => {
        calls.asked.push(q);
        return answer;
      },
      configured: () => [],
      home,
      platform: "linux",
      vars: {},
      self: "motif",
      ...rest,
    };
    return { home, deps, calls, agentRuns: () => calls.runs.filter((r) => r.cli !== "git") };
  }
  const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));

  test("asks which agents, all by default, and adds the source to each its own way", async () => {
    const { home, deps, calls, agentRuns } = setup(["claude", "cursor", "gemini"]);
    const r = await runConnect(".", ctx("motion"), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.asked[0]).toContain("1 Claude Code, 2 Cursor, 3 Gemini CLI");
    expect(agentRuns()).toEqual([
      { cli: "claude", args: ["mcp", "add", "--transport", "http", "--scope", "user", "motion", "https://mcp.motion.dev"] },
      { cli: "gemini", args: ["mcp", "add", "--scope", "user", "--transport", "http", "motion", "https://mcp.motion.dev"] },
    ]);
    expect(json(join(home, ".cursor", "mcp.json"))).toEqual({ mcpServers: { motion: { url: "https://mcp.motion.dev" } } });
    for (const a of ["Claude Code", "Cursor", "Gemini CLI"]) expect(r.text).toContain(`✓ ${a}: added Motion`);
  });

  test("numbers pick some agents; anything else changes nothing", async () => {
    const some = setup(["claude", "cursor", "gemini"], { answer: "1, 3" });
    expect((await runConnect(".", ctx("motion"), some.deps)).exitCode).toBe(0);
    expect(some.agentRuns().map((x) => x.cli)).toEqual(["claude", "gemini"]);
    expect(existsSync(join(some.home, ".cursor", "mcp.json"))).toBe(false);
    const bad = setup(["claude", "cursor"], { answer: "7" });
    const r = await runConnect(".", ctx("motion"), bad.deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Nothing changed");
    expect(bad.agentRuns()).toEqual([]);
  });

  test("--agent picks without asking, and an agent Motif doesn't know is refused", async () => {
    const s = setup(["claude", "cursor", "gemini"]);
    const r = await runConnect(".", { positionals: ["motion"], flags: { agent: "cursor" } }, s.deps);
    expect(r.exitCode).toBe(0);
    expect(s.calls.asked).toEqual([]);
    expect(s.agentRuns()).toEqual([]);
    expect(existsSync(join(s.home, ".cursor", "mcp.json"))).toBe(true);
    const bad = await runConnect(".", { positionals: ["motion"], flags: { agent: "windsurf" } }, setup(["claude"]).deps);
    expect(bad.exitCode).toBe(2);
    expect(bad.text).toContain("claude, codex, cursor, copilot, vscode, gemini, opencode");
  });

  test("run by an agent, not in a terminal: no key goes to every agent found; a key waits for the developer (review focus)", async () => {
    const s = setup(["claude", "gemini"], { interactive: false });
    const r = await runConnect(".", ctx("motion"), s.deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("every agent found");
    expect(s.agentRuns().map((x) => x.cli)).toEqual(["claude", "gemini"]);
    const k = setup(["claude", "gemini"], { interactive: false });
    const kr = await runConnect(".", ctx("21st"), k.deps);
    expect(kr.exitCode).toBe(2);
    expect(kr.text).toContain("your own terminal");
    expect(k.agentRuns()).toEqual([]);
    expect(k.calls.prompts).toBe(0);
  });

  test("a key is asked once and reaches every agent its own way, and never the output", async () => {
    const s = setup(["claude", "codex", "cursor", "copilot", "vscode", "gemini", "opencode"], { key: "abcd1234efgh" });
    const r = await runConnect(".", ctx("21st"), s.deps);
    expect(r.exitCode).toBe(0);
    expect(s.calls.prompts).toBe(1);
    const header = "x-api-key: abcd1234efgh";
    const url = "https://21st.dev/api/mcp";
    expect(s.agentRuns()).toEqual([
      { cli: "claude", args: ["mcp", "add", "--header", header, "--transport", "http", "--scope", "user", "21st", url] },
      { cli: "copilot", args: ["mcp", "add", "--transport", "http", "--header", header, "21st", url] },
      { cli: "gemini", args: ["mcp", "add", "--scope", "user", "--transport", "http", "--header", header, "21st", url] },
      { cli: "opencode", args: ["mcp", "add", "21st", "--url", url, "--header", "x-api-key=abcd1234efgh"] },
    ]);
    expect(Bun.TOML.parse(readFileSync(join(s.home, ".codex", "config.toml"), "utf8"))).toEqual({ mcp_servers: { "21st": { url, http_headers: { "x-api-key": "abcd1234efgh" } } } });
    expect(json(join(s.home, ".cursor", "mcp.json"))).toEqual({ mcpServers: { "21st": { url, headers: { "x-api-key": "abcd1234efgh" } } } });
    expect(json(join(s.home, ".config", "Code", "User", "mcp.json"))).toEqual({ servers: { "21st": { type: "http", url, headers: { "x-api-key": "abcd1234efgh" } } } });
    expect(r.text + JSON.stringify(r.data)).not.toContain("abcd1234efgh");
  });

  test("Codex's settings go into config.toml, never through codex mcp add, which starts a sign-in and waits", async () => {
    const s = setup(["codex"]);
    expect((await runConnect(".", ctx("refero"), s.deps)).exitCode).toBe(0);
    expect(s.agentRuns()).toEqual([]);
    expect(readFileSync(join(s.home, ".codex", "config.toml"), "utf8")).toContain('[mcp_servers.refero]\nurl = "https://api.refero.design/mcp"');
  });

  test("one agent failing doesn't stop the others; the result says which, with the settings to add by hand", async () => {
    const s = setup(["claude", "cursor", "gemini"], {
      run: async (exe) => (exe.endsWith("gemini") ? { code: 1, output: "settings are locked" } : { code: 0, output: "" }),
    });
    const r = await runConnect(".", ctx("motion"), s.deps);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("✓ Claude Code: added Motion");
    expect(r.text).toContain("✓ Cursor: added Motion");
    expect(r.text).toContain("✗ Gemini CLI: couldn't add it: settings are locked");
    expect(r.text).toContain("https://mcp.motion.dev");
    expect((r.data.agents as { agent: string; status: string }[]).map((a) => `${a.agent}:${a.status}`)).toEqual(["claude:added", "cursor:added", "gemini:failed"]);
  });

  test("an agent that already has the source, even under another name, is left alone; the others get it (review focus)", async () => {
    const s = setup(["claude", "cursor"], { configured: () => [{ id: "refero", agent: "cursor", server: "refero-design", where: "~/.cursor/mcp.json" }] });
    const r = await runConnect(".", ctx("refero"), s.deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain('✓ Cursor: already connected (server "refero-design" in ~/.cursor/mcp.json)');
    expect(existsSync(join(s.home, ".cursor", "mcp.json"))).toBe(false);
    expect(s.agentRuns().map((x) => x.cli)).toEqual(["claude"]);
  });

  test("Refero says how to sign in, in each agent", async () => {
    const r = await runConnect(".", ctx("refero"), setup(["claude", "codex", "gemini", "opencode"]).deps);
    for (const s of ['type /mcp, choose "refero"', 'run "codex mcp login refero"', "type /mcp auth refero", 'run "opencode mcp auth refero"']) {
      expect(r.text).toContain(s);
    }
  });

  test("a key source every chosen agent already has needs no key, in a terminal or not (final review)", async () => {
    const has21st = () => [{ id: "21st" as const, agent: "claude" as const, server: "21st", where: "~/.claude.json" }];
    for (const interactive of [false, true]) {
      const s = setup(["claude"], { interactive, configured: has21st });
      const r = await runConnect(".", ctx("21st"), s.deps);
      expect([interactive, r.exitCode, s.calls.prompts]).toEqual([interactive, 0, 0]);
      expect(r.text).toContain("✓ Claude Code: already connected");
    }
    const both = setup(["claude", "gemini"], {
      interactive: false,
      configured: () => [...has21st(), { id: "21st", agent: "gemini", server: "21st", where: "~/.gemini/settings.json" }],
    });
    const r = await runConnect(".", ctx("21st"), both.deps);
    expect(r.exitCode).toBe(0);
    expect(both.agentRuns()).toEqual([]);
  });

  test("runs each agent's own command from the home folder, so it can't write the key into the project (final review)", async () => {
    const cwds: (string | undefined)[] = [];
    const s = setup(["claude", "copilot", "gemini", "opencode"], {
      run: async (exe, _args, cwd) => {
        if (!exe.endsWith("git")) cwds.push(cwd);
        return { code: 0, output: "" };
      },
    });
    expect((await runConnect(".", ctx("21st"), s.deps)).exitCode).toBe(0);
    expect(cwds).toEqual([s.home, s.home, s.home, s.home]);
  });

  test("warns about each settings file that now holds the key and is tracked by git", async () => {
    const s = setup(["cursor", "gemini"], { tracked: (args) => args.includes("mcp.json") });
    const r = await runConnect(".", ctx("21st"), s.deps);
    expect(r.text).toContain("~/.cursor/mcp.json, which now holds your key, is tracked by git");
    expect(r.text).not.toContain("settings.json, which now holds your key");
  });

  test("--agent is read without spaces or capitals, and the command it prints is the one it read (v0.2.0 review minor)", async () => {
    const s = setup(["claude", "cursor"], { interactive: false });
    const r = await runConnect(".", { positionals: ["21st"], flags: { agent: "Claude, Cursor" } }, s.deps);
    expect(r.exitCode).toBe(2);
    expect(r.data.run).toBe("motif connect 21st --agent claude,cursor");
    expect(r.text).toContain("  motif connect 21st --agent claude,cursor");
  });

  test("--agent naming an agent that isn't on this computer writes nothing for it, file agents too (v0.2.0 review minor)", async () => {
    const s = setup(["claude"]);
    const r = await runConnect(".", { positionals: ["motion"], flags: { agent: "claude,cursor,gemini" } }, s.deps);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("✓ Claude Code: added Motion");
    expect(r.text).toContain(`✗ Cursor: couldn't add it: Motif didn't find it on this computer (no ~/.cursor folder, and no "cursor" or "cursor-agent" command on PATH)`);
    expect(r.text).toContain(`✗ Gemini CLI: couldn't add it: Motif didn't find it on this computer (no "gemini" command on PATH)`);
    expect(existsSync(join(s.home, ".cursor"))).toBe(false);
    expect(s.agentRuns().map((x) => x.cli)).toEqual(["claude"]);
    const k = setup(["claude"]);
    const kr = await runConnect(".", { positionals: ["21st"], flags: { agent: "cursor" } }, k.deps);
    expect(kr.exitCode).toBe(2);
    expect(k.calls.prompts).toBe(0);
    expect(existsSync(join(k.home, ".cursor"))).toBe(false);
  });

  test("Codex counts as installed when its settings folder is there, as Cursor and VS Code do (v0.2.0 review minor)", async () => {
    const s = setup([]);
    mkdirSync(join(s.home, ".codex"));
    const r = await runConnect(".", { positionals: ["motion"], flags: { agent: "codex" } }, s.deps);
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(s.home, ".codex", "config.toml"), "utf8")).toContain("[mcp_servers.motion]");
  });

  test("when the input ends at the agent question (Ctrl+D, Ctrl+Z), nothing changes and it says so (v0.2.0 review minor)", async () => {
    const s = setup(["claude", "cursor"], { ask: async () => null });
    const r = await runConnect(".", ctx("motion"), s.deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toBe("No answer. Nothing changed.");
    expect(s.agentRuns()).toEqual([]);
  });

  test.skipIf(!canSymlink)("a key written through a settings link into a git-tracked dotfiles file gets the warning, naming that file (final review)", async () => {
    const s = setup(["cursor"], { tracked: (args) => args[1]!.replace(/\\/g, "/").endsWith("/dotfiles/cursor") });
    const dotfiles = join(s.home, "dotfiles", "cursor");
    mkdirSync(dotfiles, { recursive: true });
    writeFileSync(join(dotfiles, "mcp.json"), '{\n  "mcpServers": {}\n}\n');
    symlinkSync(join(dotfiles, "mcp.json"), join(s.home, ".cursor", "mcp.json"), "file");
    const r = await runConnect(".", { positionals: ["21st"], flags: { agent: "cursor" } }, s.deps);
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(dotfiles, "mcp.json"), "utf8")).toContain("secret-key-1");
    expect(r.text).toMatch(/dotfiles[\\/]cursor[\\/]mcp\.json, which now holds your key, is tracked by git/);
  });

  test("an agent whose command can't be started is reported, and the others are still set up (final review)", async () => {
    const s = setup(["claude", "cursor", "gemini"]);
    const run = s.deps.run;
    s.deps.run = async (exe, args, cwd) => {
      if (exe.endsWith("/gemini")) throw new Error("spawn EACCES");
      return run(exe, args, cwd);
    };
    const r = await runConnect(".", ctx("motion"), s.deps);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("✓ Claude Code: added Motion");
    expect(r.text).toContain("✓ Cursor: added Motion");
    expect(r.text).toContain("✗ Gemini CLI: couldn't add it: spawn EACCES");
  });
});

describe("readLine (v0.2.0 review minor)", () => {
  const ended = (text: string) => {
    const input = new PassThrough();
    input.end(text);
    return input;
  };
  const quiet = () => new PassThrough();

  test("returns the line typed, without its line ending", async () => {
    expect(await readLine("Which? ", ended("1,3\r\nmore"), quiet())).toBe("1,3");
    expect(await readLine("Which? ", ended("2\n"), quiet())).toBe("2");
  });

  test("returns null when the input ends before a line does", async () => {
    expect(await readLine("Which? ", ended(""), quiet())).toBeNull();
    expect(await readLine("Which? ", ended("1, 2"), quiet())).toBeNull();
  });
});
