import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { genericConfig, readLine, runCommand, runConnect, selfCommand, spawnArgs, type ConnectDeps } from "../src/commands/connect";
import type { ConfiguredSource } from "../src/detect/sources";
import { sourceById } from "../src/sources/catalog";
import { tempDir } from "./tmp";

function fakes(over: Partial<ConnectDeps> & { connected?: ConfiguredSource[]; claudeExit?: number } = {}) {
  const calls = { runs: [] as { exe: string; args: string[] }[] };
  const { connected = [], claudeExit = 0, ...rest } = over;
  const deps: ConnectDeps = {
    which: (cmd) => (cmd === "claude" ? "/usr/bin/claude" : null),
    run: async (exe, args) => {
      calls.runs.push({ exe, args });
      return { code: claudeExit, output: claudeExit === 0 ? "Added HTTP MCP server" : "MCP server motion already exists in user config" };
    },
    interactive: true,
    ask: async () => "",
    configured: () => connected,
    servers: () => [],
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
    expect(r.text).toContain("Supahero needs nothing");
    expect(r.text).not.toContain("Refero");
    expect((r.data.sources as { id: string; connected: boolean }[]).map((s) => [s.id, s.connected])).toEqual([["motion", true]]);
    expect(r.text).toContain("In: Claude Code");
    expect((r.data.sources as { id: string; agents: string[] }[]).find((s) => s.id === "motion")!.agents).toEqual(["claude"]);
  });
});

describe("motif connect <source>", () => {
  test("an unknown source lists the real ones", async () => {
    const r = await runConnect(".", ctx("dribbble"), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Choose one of: motion.");
    expect(r.data.error).toBe("no-such-source");
  });

  test("without Claude Code, it shows the settings to paste into another agent", async () => {
    const { deps, calls } = fakes({ which: () => null });
    const r = await runConnect(".", ctx("motion"), deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("https://mcp.motion.dev");
    expect(calls.runs).toEqual([]);
  });

  test("an already connected source is left alone", async () => {
    const { deps, calls } = fakes({ connected: [{ id: "motion", agent: "claude", server: "motion", where: "~/.claude.json" }] });
    const r = await runConnect(".", ctx("motion"), deps);
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
  });

  test("when Claude Code refuses, its message and the manual settings are shown", async () => {
    const r = await runConnect(".", ctx("motion"), fakes({ claudeExit: 1 }).deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("already exists");
    expect(r.text).toContain("https://mcp.motion.dev");
  });
});

describe("running claude", () => {
  test("cmd.exe is started by its full path (%ComSpec%), so no other cmd.exe can stand in for it (backlog)", () => {
    expect(spawnArgs("C:\\npm\\claude.cmd", ["mcp"], "win32", { ComSpec: "C:\\WINDOWS\\system32\\cmd.exe" }).cmd[0]).toBe("C:\\WINDOWS\\system32\\cmd.exe");
    expect(spawnArgs("C:\\npm\\claude.cmd", ["mcp"], "win32", { SystemRoot: "D:\\Win" }).cmd[0]).toBe("D:\\Win\\System32\\cmd.exe");
  });

  test("npm's .cmd shims on Windows go through cmd.exe with every argument quoted", () => {
    expect(spawnArgs("C:\\Users\\me\\npm\\claude.cmd", ["mcp", "add", "--header", "x-api-key: a&b"], "win32", {})).toEqual({
      cmd: ["C:\\Windows\\System32\\cmd.exe", "/d", "/s", "/c", '""C:\\Users\\me\\npm\\claude.cmd" "mcp" "add" "--header" "x-api-key: a&b""'],
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

  test("a program can be given its own environment (deferred minor)", async () => {
    const r = await runCommand(process.execPath, ["-e", "console.log(process.env.MOTIF_PROBE)"], undefined, { ...process.env, MOTIF_PROBE: "given" });
    expect(r).toEqual({ code: 0, output: "given" });
  });

  test("genericConfig is the JSON other agents take", () => {
    expect(JSON.parse(genericConfig(sourceById("motion")!))).toEqual({ mcpServers: { motion: { type: "http", url: "https://mcp.motion.dev" } } });
  });
});

describe("motif connect: from the final review", () => {
  test("when Claude Code refuses, --json carries its message and the manual settings", async () => {
    const r = await runConnect(".", ctx("motion"), fakes({ claudeExit: 1 }).deps);
    expect(r.data.output).toContain("already exists");
    expect(r.data.config).toEqual({ mcpServers: { motion: { type: "http", url: "https://mcp.motion.dev" } } });
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
  function setup(agents: string[], over: Partial<ConnectDeps> & { answer?: string } = {}) {
    const home = tempDir("motif-connect-home-");
    if (agents.includes("cursor")) mkdirSync(join(home, ".cursor"));
    if (agents.includes("vscode")) mkdirSync(join(home, ".config", "Code", "User"), { recursive: true });
    const clis = agents.filter((a) => a !== "cursor" && a !== "vscode");
    const calls = { runs: [] as { cli: string; args: string[] }[], asked: [] as string[] };
    const { answer = "", ...rest } = over;
    const deps: ConnectDeps = {
      which: (c) => (clis.includes(c) ? `/bin/${c}` : null),
      run: async (exe, args) => {
        const cli = exe.split("/").pop()!;
        calls.runs.push({ cli, args });
        return { code: 0, output: "added" };
      },
      interactive: true,
      ask: async (q) => {
        calls.asked.push(q);
        return answer;
      },
      configured: () => [],
      servers: () => [],
      home,
      platform: "linux",
      vars: {},
      self: "motif",
      ...rest,
    };
    return { home, deps, calls, agentRuns: () => calls.runs };
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

  test("run by an agent, not in a terminal: the source goes to every agent found (review focus)", async () => {
    const s = setup(["claude", "gemini"], { interactive: false });
    const r = await runConnect(".", ctx("motion"), s.deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("every agent found");
    expect(s.agentRuns().map((x) => x.cli)).toEqual(["claude", "gemini"]);
  });

  test("Codex's settings go into config.toml, never through codex mcp add, which starts a sign-in and waits", async () => {
    const s = setup(["codex"]);
    expect((await runConnect(".", ctx("motion"), s.deps)).exitCode).toBe(0);
    expect(s.agentRuns()).toEqual([]);
    expect(readFileSync(join(s.home, ".codex", "config.toml"), "utf8")).toContain('[mcp_servers.motion]\nurl = "https://mcp.motion.dev"');
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
    const s = setup(["claude", "cursor"], { configured: () => [{ id: "motion", agent: "cursor", server: "motion-docs", where: "~/.cursor/mcp.json" }] });
    const r = await runConnect(".", ctx("motion"), s.deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain('✓ Cursor: already connected (server "motion-docs" in ~/.cursor/mcp.json)');
    expect(existsSync(join(s.home, ".cursor", "mcp.json"))).toBe(false);
    expect(s.agentRuns().map((x) => x.cli)).toEqual(["claude"]);
  });

  test("runs each agent's own command from the home folder, so it can't write into the project (final review)", async () => {
    const cwds: (string | undefined)[] = [];
    const s = setup(["claude", "copilot", "gemini", "opencode"], {
      run: async (exe, _args, cwd) => {
        cwds.push(cwd);
        return { code: 0, output: "" };
      },
    });
    expect((await runConnect(".", ctx("motion"), s.deps)).exitCode).toBe(0);
    expect(cwds).toEqual([s.home, s.home, s.home, s.home]);
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

  test("Claude Code installed but not on PATH is set up by its own path (backlog)", async () => {
    const exes: string[] = [];
    const s = setup([], {
      run: async (exe) => {
        exes.push(exe);
        return { code: 0, output: "added" };
      },
    });
    const local = join(s.home, ".local", "bin", "claude");
    mkdirSync(dirname(local), { recursive: true });
    writeFileSync(local, "");
    const cfg = join(s.home, "cfg");
    mkdirSync(cfg);
    const r = await runConnect(".", ctx("motion"), { ...s.deps, vars: { CLAUDE_CONFIG_DIR: cfg } });
    expect(r.exitCode).toBe(0);
    expect(exes).toContain(local);
  });

  test("another product's server already named motion is kept, and Motion is added under its second name (deferred minor)", async () => {
    // usemotion.com's server, also called "motion", in Claude Code's and Cursor's settings; Gemini has none.
    const theirs = { type: "http", url: "https://mcp.usemotion.com/mcp" };
    const s = setup(["claude", "cursor", "gemini"], {
      servers: () => [
        { agent: "claude", name: "motion", def: theirs, where: "~/.claude.json" },
        { agent: "cursor", name: "motion", def: theirs, where: "~/.cursor/mcp.json" },
      ],
    });
    writeFileSync(join(s.home, ".cursor", "mcp.json"), `{\n  "mcpServers": {\n    "motion": ${JSON.stringify(theirs)}\n  }\n}\n`);
    const r = await runConnect(".", ctx("motion"), s.deps);
    expect(r.exitCode).toBe(0);
    expect(s.agentRuns()).toEqual([
      { cli: "claude", args: ["mcp", "add", "--transport", "http", "--scope", "user", "motion-dev", "https://mcp.motion.dev"] },
      { cli: "gemini", args: ["mcp", "add", "--scope", "user", "--transport", "http", "motion", "https://mcp.motion.dev"] },
    ]);
    expect(json(join(s.home, ".cursor", "mcp.json"))).toEqual({ mcpServers: { motion: theirs, "motion-dev": { url: "https://mcp.motion.dev" } } });
    expect(r.text).toContain(`✓ Claude Code: added Motion for all your projects, as "motion-dev" (you already have a server called "motion" that isn't Motion's).`);
    expect(r.text).toContain(`✓ Cursor: added Motion for all your projects, as "motion-dev"`);
    expect(r.text).toContain("✓ Gemini CLI: added Motion for all your projects.");
    expect((r.data.agents as { agent: string; server?: string }[]).map((a) => `${a.agent}:${a.server}`)).toEqual(["claude:motion-dev", "cursor:motion-dev", "gemini:motion"]);
  });

  test("every source has a second server name, and when both are taken nothing is overwritten (deferred minor)", async () => {
    const { SOURCES } = await import("../src/sources/catalog");
    for (const src of SOURCES) {
      expect(src.connect.fallback).toMatch(/^[a-z0-9-]+$/);
      expect(src.connect.fallback).not.toBe(src.connect.name);
    }
    const other = { url: "https://example.com/mcp" };
    const s = setup(["claude"], {
      servers: () => [
        { agent: "claude", name: "motion", def: other, where: "~/.claude.json" },
        { agent: "claude", name: "motion-dev", def: other, where: "~/.claude.json" },
      ],
    });
    const r = await runConnect(".", ctx("motion"), s.deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain(`✗ Claude Code: couldn't add it: it already has servers called "motion" and "motion-dev" that aren't Motion's, so nothing was changed`);
    expect(s.agentRuns()).toEqual([]);
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

describe("reading from the terminal (v0.2.0 review minors)", () => {
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
  /** A stream that stays open after the text, as a terminal does. */
  const open = (text: string) => {
    const input = new PassThrough();
    input.write(text);
    return input;
  };

  test("Ctrl+Z then Enter (Windows) or Ctrl+D, arriving as characters, end the input too (review of the follow-ups)", async () => {
    expect(await readLine("Which? ", open("\x1a\r\n"), quiet())).toBeNull();
    expect(await readLine("Which? ", open("\x04"), quiet())).toBeNull();
  });

});

describe("turning motif connect off for unattended runs (review of batch F)", () => {
  test("MOTIF_NO_CONNECT=1 changes no agent's settings, and says so", async () => {
    const home = tempDir("motif-connect-home-");
    mkdirSync(join(home, ".cursor"));
    const runs: string[] = [];
    const deps: ConnectDeps = {
      which: (c) => `/bin/${c}`,
      run: async (exe) => {
        runs.push(exe);
        return { code: 0, output: "" };
      },
      interactive: false,
      ask: async () => "",
      configured: () => [],
      servers: () => [],
      home,
      platform: "linux",
      vars: { MOTIF_NO_CONNECT: "1" },
      self: "motif",
    };
    const r = await runConnect(".", { positionals: ["motion"] }, deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("MOTIF_NO_CONNECT");
    expect(runs).toEqual([]);
    expect(existsSync(join(home, ".cursor", "mcp.json"))).toBe(false);
  });
});

describe("retired sources (2.0)", () => {
  const RETIRED_TEXT: Record<string, string> = {
    "21st": "21st.dev was retired in Motif 2.0. Motif now has this built in: a library of pieces for every stack. There's nothing to connect, and nothing was changed.",
    refero: "Refero was retired in Motif 2.0. Motif now has this built in: reference notes in the UX pattern guides. There's nothing to connect, and nothing was changed.",
    "60fps": "60fps.design was retired in Motif 2.0. Motif now has this built in: motion recipes for every stack, SwiftUI included. There's nothing to connect, and nothing was changed.",
  };
  for (const id of Object.keys(RETIRED_TEXT)) {
    test(`motif connect ${id} says it's built in now, exits without an error and changes nothing`, async () => {
      const home = tempDir("motif-connect-home-");
      mkdirSync(join(home, ".cursor"));
      const settings = join(home, ".cursor", "mcp.json");
      const before = '{\n  "mcpServers": { "x": { "url": "https://example.com" } }\n}\n';
      writeFileSync(settings, before);
      const runs: string[] = [];
      const deps: ConnectDeps = {
        which: (c) => `/bin/${c}`,
        run: async (exe) => {
          runs.push(exe);
          return { code: 0, output: "" };
        },
        interactive: true,
        ask: async () => "",
        configured: () => [],
        servers: () => [],
        home,
        platform: "linux",
        vars: {},
        self: "motif",
      };
      const r = await runConnect(".", ctx(id), deps);
      expect(r.exitCode).toBe(0);
      expect(r.text).toBe(RETIRED_TEXT[id]!);
      expect(r.data).toEqual({ retired: id });
      expect(runs).toEqual([]);
      expect(readFileSync(settings, "utf8")).toBe(before);
    });
  }
});
