import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findConfiguredSources, readAgentServers } from "../src/detect/sources";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const tmp = () => tempDir("motif-src-");

describe("findConfiguredSources", () => {
  test("reads project .mcp.json and ~/.claude.json (global + this project)", () => {
    const cwd = tmp();
    const home = tmp();
    writeFileSync(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: { refero: { type: "http", url: "https://example.com/mcp" } } }));
    writeFileSync(join(home, ".claude.json"), JSON.stringify({
      mcpServers: { "60fps": { type: "http", url: "https://example.com" } },
      projects: { [cwd.replace(/\\/g, "/")]: { mcpServers: { "21st": { type: "http", url: "https://21st.dev/api/mcp" } } } },
    }));
    expect(findConfiguredSources(cwd, home).filter((s) => s.agent === "claude").map((s) => s.id).sort()).toEqual(["21st", "60fps", "refero"]);
  });

  test("ignores other projects' servers and unrelated servers", () => {
    const cwd = tmp();
    const home = tmp();
    writeFileSync(join(home, ".claude.json"), JSON.stringify({
      mcpServers: { github: { command: "gh-mcp" } },
      projects: { "/somewhere/else": { mcpServers: { refero: { url: "x" } } } },
    }));
    expect(findConfiguredSources(cwd, home)).toEqual([]);
  });

  test("config files with a byte-order mark are still read", () => {
    const cwd = tmp();
    writeFileSync(join(cwd, ".mcp.json"), "\uFEFF" + JSON.stringify({ mcpServers: { refero: { url: "https://x" } } }));
    expect([...new Set(findConfiguredSources(cwd, tmp()).map((s) => s.id))]).toEqual(["refero"]);
  });

  test("broken config files are ignored", () => {
    const cwd = tmp();
    const home = tmp();
    writeFileSync(join(cwd, ".mcp.json"), "{ nope");
    writeFileSync(join(home, ".claude.json"), "{ nope");
    expect(findConfiguredSources(cwd, home)).toEqual([]);
  });
});

const put = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const linux = (vars: Record<string, string> = {}) => ({ platform: "linux" as const, vars });

describe("every agent's settings (Part 3)", () => {
  test("reads each agent's user and project settings, and says which agent has which source", () => {
    const cwd = tmp();
    const home = tmp();
    put(join(home, ".codex", "config.toml"), '[mcp_servers.refero]\nurl = "https://api.refero.design/mcp"\n');
    put(join(home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { motion: { url: "https://mcp.motion.dev" } } }));
    put(join(home, ".copilot", "mcp-config.json"), JSON.stringify({ mcpServers: { "60fps": { type: "http", url: "https://mcp.60fps.design/mcp" } } }));
    put(join(home, ".config", "Code", "User", "mcp.json"), JSON.stringify({ servers: { motion: { type: "http", url: "https://mcp.motion.dev" } } }));
    put(join(home, ".gemini", "settings.json"), JSON.stringify({ mcpServers: { k: { httpUrl: "https://21st.dev/api/mcp" } } }));
    put(join(home, ".config", "opencode", "opencode.jsonc"), '{ "mcp": { "refero": { "type": "remote", "url": "https://api.refero.design/mcp" } } }');
    put(join(cwd, ".codex", "config.toml"), '[mcp_servers.motion]\nurl = "https://mcp.motion.dev"\n');
    expect(findConfiguredSources(cwd, home, linux()).map((s) => `${s.agent}:${s.id}@${s.where}`).sort()).toEqual([
      "codex:motion@.codex/config.toml", "codex:refero@~/.codex/config.toml", "copilot:60fps@~/.copilot/mcp-config.json",
      "cursor:motion@~/.cursor/mcp.json", "gemini:21st@~/.gemini/settings.json", "opencode:refero@~/.config/opencode/opencode.jsonc",
      "vscode:motion@~/.config/Code/User/mcp.json",
    ]);
  });

  test("reads settings with comments and trailing commas, as Cursor, VS Code and OpenCode allow (review focus)", () => {
    const cwd = tmp();
    const home = tmp();
    put(join(home, ".cursor", "mcp.json"), '{\n  // mine\n  "mcpServers": {\n    "motion": { "url": "https://mcp.motion.dev", },\n  },\n}\n');
    put(join(cwd, ".vscode", "mcp.json"), '/* team */ { "servers": { "refero": { "type": "http", "url": "https://api.refero.design/mcp" } } }');
    expect(findConfiguredSources(cwd, home, linux()).map((s) => `${s.agent}:${s.id}`).sort()).toEqual(["cursor:motion", "vscode:refero"]);
  });

  test("a project's .mcp.json counts for Claude Code and Copilot CLI, which both read it", () => {
    const cwd = tmp();
    put(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: { refero: { url: "https://api.refero.design/mcp" } } }));
    expect(findConfiguredSources(cwd, tmp(), linux()).map((s) => s.agent).sort()).toEqual(["claude", "copilot"]);
  });

  test("a source under another server name still counts, once per agent (review focus)", () => {
    const home = tmp();
    put(join(home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { "refero-design": { url: "https://api.refero.design/mcp" }, refero: { url: "https://api.refero.design/mcp" } } }));
    expect(findConfiguredSources(tmp(), home, linux())).toEqual([{ id: "refero", agent: "cursor", server: "refero-design", where: "~/.cursor/mcp.json" }]);
  });

  test("a settings file that can't be read is named, and the others are still read (review focus)", () => {
    const home = tmp();
    put(join(home, ".codex", "config.toml"), "[mcp_servers.refero\nurl = ");
    put(join(home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { motion: { url: "https://mcp.motion.dev" } } }));
    const r = readAgentServers(tmp(), { home, platform: "linux", vars: {}, which: () => null });
    expect(r.unreadable).toEqual([join(home, ".codex", "config.toml")]);
    expect(r.servers.map((s) => `${s.agent}:${s.name}`)).toEqual(["cursor:motion"]);
  });

  test("follows the agents' own variables (CODEX_HOME and the rest)", () => {
    const home = tmp();
    put(join(home, "cx", "config.toml"), '[mcp_servers.motion]\nurl = "https://mcp.motion.dev"\n');
    expect(findConfiguredSources(tmp(), home, linux({ CODEX_HOME: join(home, "cx") })).map((s) => `${s.agent}@${s.where}`)).toEqual(["codex@~/cx/config.toml"]);
  });
});
