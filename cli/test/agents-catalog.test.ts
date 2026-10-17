import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { AGENT_IDS, AGENTS, agentById, type AgentEnv, shown } from "../src/agents/catalog";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const env = (over: Partial<AgentEnv> = {}): AgentEnv => ({ home: join("/h"), platform: "linux", vars: {}, which: () => null, ...over });
const paths = (id: string, e: AgentEnv) => agentById(id)!.settings(e, join("/p")).map((f) => [f.where, f.key, f.format, f.scope]);

describe("the agents Motif sets design sources up for", () => {
  test("are the seven of the Part 3 spec, in order", () => {
    expect(AGENTS.map((a) => a.id)).toEqual(AGENT_IDS);
    expect(AGENTS.map((a) => a.label)).toEqual(["Claude Code", "Codex", "Cursor", "GitHub Copilot CLI", "VS Code", "Gemini CLI", "OpenCode"]);
  });

  test("are found by their command, or Codex, Cursor and VS Code by their settings folder", () => {
    const which = (c: string) => (["claude", "gemini"].includes(c) ? `/bin/${c}` : null);
    expect(AGENTS.filter((a) => a.found(env({ which }))).map((a) => a.id)).toEqual(["claude", "gemini"]);
    const home = tempDir("motif-agents-home-");
    mkdirSync(join(home, ".codex"));
    mkdirSync(join(home, ".cursor"));
    mkdirSync(join(home, ".config", "Code", "User"), { recursive: true });
    expect(AGENTS.filter((a) => a.found(env({ home }))).map((a) => a.id)).toEqual(["codex", "cursor", "vscode"]);
    const appData = tempDir("motif-agents-appdata-");
    mkdirSync(join(appData, "Code", "User"), { recursive: true });
    expect(agentById("vscode")!.found(env({ home: tempDir("motif-agents-empty-"), platform: "win32", vars: { APPDATA: appData } }))).toBe(true);
  });

  test("keep their settings where each agent does: user first, then the project's", () => {
    const e = env();
    expect(paths("claude", e)).toEqual([["~/.claude.json", "mcpServers", "json", "user"], [".mcp.json", "mcpServers", "json", "project"]]);
    expect(paths("codex", e)).toEqual([["~/.codex/config.toml", "mcp_servers", "toml", "user"], [".codex/config.toml", "mcp_servers", "toml", "project"]]);
    expect(paths("cursor", e)).toEqual([["~/.cursor/mcp.json", "mcpServers", "json", "user"], [".cursor/mcp.json", "mcpServers", "json", "project"]]);
    expect(paths("copilot", e)).toEqual([
      ["~/.copilot/mcp-config.json", "mcpServers", "json", "user"], [".mcp.json", "mcpServers", "json", "project"], [".github/mcp.json", "mcpServers", "json", "project"],
    ]);
    expect(paths("vscode", e)).toEqual([["~/.config/Code/User/mcp.json", "servers", "json", "user"], [".vscode/mcp.json", "servers", "json", "project"]]);
    expect(paths("gemini", e)).toEqual([["~/.gemini/settings.json", "mcpServers", "json", "user"], [".gemini/settings.json", "mcpServers", "json", "project"]]);
    expect(paths("opencode", e)).toEqual([
      ["~/.config/opencode/opencode.json", "mcp", "json", "user"], ["~/.config/opencode/opencode.jsonc", "mcp", "json", "user"],
      ["opencode.json", "mcp", "json", "project"], ["opencode.jsonc", "mcp", "json", "project"],
    ]);
  });

  test("follow each agent's own variable for its settings folder", () => {
    const e = env({ vars: { CODEX_HOME: join("/h", "cx"), COPILOT_HOME: join("/h", "cp"), GEMINI_CLI_HOME: join("/h", "g"), XDG_CONFIG_HOME: join("/h", "xdg") } });
    expect(paths("codex", e)[0]![0]).toBe("~/cx/config.toml");
    expect(paths("copilot", e)[0]![0]).toBe("~/cp/mcp-config.json");
    expect(paths("gemini", e)[0]![0]).toBe("~/g/.gemini/settings.json");
    expect(paths("opencode", e)[0]![0]).toBe("~/xdg/opencode/opencode.json");
    expect(paths("vscode", e)[0]![0]).toBe("~/xdg/Code/User/mcp.json");
    expect(paths("vscode", env({ platform: "darwin" }))[0]![0]).toBe("~/Library/Application Support/Code/User/mcp.json");
    expect(paths("vscode", env({ platform: "win32", vars: { APPDATA: join("/h", "AppData", "Roaming") } }))[0]![0]).toBe("~/AppData/Roaming/Code/User/mcp.json");
  });

  test("say how to sign in to a server, each in its own way", () => {
    expect(Object.fromEntries(AGENTS.map((a) => [a.id, a.signIn("refero")]))).toEqual({
      claude: 'in Claude Code, type /mcp, choose "refero" and sign in',
      codex: 'run "codex mcp login refero" in a terminal, or in Codex\'s app or editor extension open MCP servers in its settings and choose Authenticate',
      cursor: 'in Cursor\'s settings, under MCP, sign in to "refero" (or run "cursor-agent mcp login refero")',
      copilot: 'in Copilot CLI, type /mcp and sign in to "refero"',
      vscode: 'VS Code asks you to sign in to "refero" the first time Copilot uses it',
      gemini: "in Gemini CLI, type /mcp auth refero",
      opencode: 'run "opencode mcp auth refero" in a terminal',
    });
  });

  test("show a path in the home folder as ~/…, and any other as it is", () => {
    expect(shown(env(), join("/h", "a", "b.json"))).toBe("~/a/b.json");
    expect(shown(env(), join("/elsewhere", "b.json"))).toBe(join("/elsewhere", "b.json"));
  });
});
