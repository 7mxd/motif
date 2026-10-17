# Motif 3B — Design sources in every agent, and v0.2.0: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `motif connect` sets a design source up in each coding agent the developer picks, `doctor` reports which agents have each source, and the repository is ready to tag v0.2.0.

**Architecture:** A new `cli/src/agents/catalog.ts` names the seven agents, how to find each, where each keeps its MCP settings and how to sign in. `cli/src/detect/sources.ts` reads every agent's settings (JSON with comments, and Codex's TOML). `cli/src/agents/edit.ts` adds a server to a settings file without disturbing it, for the agents whose own command can't. `connect` asks which agents, reads a key once, and adds the source to each in its own way. Then the skill's notes, the 3A deferred minors, and the v0.2.0 notes and version.

**Tech Stack:** Bun 1.4.3 + TypeScript, `jsonc-parser` (already a dependency), Bun's built-in TOML parser.

**Spec:** `docs/specs/2026-10-17-motif-part3-agents-design.md` (§5 source notes and sign-in, §7 `connect` and `doctor`, §9.3 and §10 release notes and docs). Plan 3A (`docs/plans/2026-10-17-motif-3a-agent-packages.md`) is built and merged on local `main` (f1ae5f3); its facts are in `docs/plans/notes/2026-10-17-3a-agent-facts.md`.

**Changes to spec §7.2, checked while planning (2026-10-17, against Codex 0.163, Copilot CLI 1.0.98, Gemini CLI 0.64, OpenCode 1.19 in a throwaway home):**
- **Codex:** `codex mcp add <name> --url <url>` writes `[mcp_servers.<name>]` and then starts an OAuth sign-in and waits for a browser — even for Motion. So Motif writes the table into `config.toml` itself, for every source, and Codex's sign-in line says `codex mcp login <server>`.
- **VS Code:** `code --add-mcp '<json>'` would pass JSON through `cmd.exe` on Windows (`code` is `code.cmd`), which doubles its quotes. So Motif adds `servers.<name>` to VS Code's user `mcp.json` itself, as it does for Cursor.
- **Confirmed as the spec says:** `copilot mcp add --transport http [--header "K: V"] <name> <url>` (writes `$COPILOT_HOME/mcp-config.json`), `gemini mcp add --scope user --transport http [--header "K: V"] <name> <url>` (writes `~/.gemini/settings.json`), `opencode mcp add <name> --url <url> [--header K=V]` (writes `~/.config/opencode/opencode.jsonc`); none of them prompts.

Task 8 brings the spec text in line with these.

## Global Constraints

- Bun 1.4.3 (`export PATH="$HOME/.bun/bin:$PATH"` in Git Bash); tests from `cli/` with `bun test --timeout 300000`; `bun run typecheck` clean before every commit.
- No new dependencies: JSON(C) with `jsonc-parser`, TOML with `Bun.TOML.parse`.
- Keys are typed only in the developer's own terminal, with hidden input; never in the chat; written only to user-level agent settings, never a project file; any output that would echo a key shows `<your key>` instead (spec §7.2).
- Files Motif edits keep every other entry, comment and the formatting; a file Motif can't read is left alone (spec §7.2 step 4).
- `connect` exit codes: 0 when every chosen agent has the source, 1 when some failed, 2 when none could be set up (spec §7.2 step 5).
- A settings file that can't be read never makes `doctor` fail; `--json` names it (spec §7.3).
- `skill/agents.md` is the only file in `skill/` that names agents' tools (lint).
- Nothing is pushed, tagged or published in this plan (approval points A/B/C follow it).
- Commits: `git -c user.name=7mxd -c user.email=7895735+7mxd@users.noreply.github.com commit …`, message ending `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; commit only after the step's tests pass, gated on the exit code.
- Write any file or test text containing backslashes with the Write/Edit tools: shell heredocs here collapse `\\`, even quoted ones.

## Review Focus

1. **Settings with comments and trailing commas** (Cursor's and VS Code's `mcp.json`, OpenCode's `opencode.jsonc`, edited by hand): read correctly, and an edit keeps the comments, the other servers and the line endings → tests in Tasks 2 and 4.
2. **A Codex `config.toml` with other content, or a broken one**: the new table is appended and everything else kept; a broken file, or one already holding a server of that name, is left exactly as it was → tests in Task 4.
3. **A source set up under another server name** (Refero as `refero-design`): counts as connected, once per agent, and `connect` doesn't add a second → tests in Tasks 2 and 5.
4. **`motif connect` run by an agent, not in a terminal**: a source with no key goes to every agent found (and says so); a source with a key stops and gives the command to run → test in Task 5.
5. **A settings file that can't be read** (broken JSON or TOML): skipped, named in `doctor --json`, and the other files are still read → tests in Tasks 2 and 3.

---

### Task 1: The agents and where they keep their settings

**Files:**
- Create: `cli/src/agents/catalog.ts`
- Test: `cli/test/agents-catalog.test.ts`

**Interfaces:**
- Produces:
  - `type AgentId = "claude" | "codex" | "cursor" | "copilot" | "vscode" | "gemini" | "opencode"`, `AGENT_IDS: AgentId[]`
  - `interface AgentEnv { home: string; platform: NodeJS.Platform; vars: Record<string, string | undefined>; which(cmd: string): string | null }`
  - `interface SettingsFile { path: string; where: string; format: "json" | "toml"; key: "mcpServers" | "servers" | "mcp" | "mcp_servers"; scope: "user" | "project" }`
  - `interface AgentInfo { id: AgentId; label: string; found(e: AgentEnv): boolean; settings(e: AgentEnv, cwd: string): SettingsFile[]; signIn(server: string): string }`
  - `AGENTS: AgentInfo[]`, `agentById(id: string): AgentInfo | undefined`, `defaultAgentEnv(): AgentEnv`, `shown(e: AgentEnv, path: string): string`
  - `codexHome(e)`, `copilotHome(e)`, `geminiDir(e)`, `configHome(e)`, `vscodeUserDir(e)` (all `(e: AgentEnv) => string`)

- [ ] **Step 1: Write the failing test**

`cli/test/agents-catalog.test.ts`:

```ts
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

  test("are found by their command, or Cursor and VS Code by their settings folder", () => {
    const which = (c: string) => (["claude", "gemini"].includes(c) ? `/bin/${c}` : null);
    expect(AGENTS.filter((a) => a.found(env({ which }))).map((a) => a.id)).toEqual(["claude", "gemini"]);
    const home = tempDir("motif-agents-home-");
    mkdirSync(join(home, ".cursor"));
    mkdirSync(join(home, ".config", "Code", "User"), { recursive: true });
    expect(AGENTS.filter((a) => a.found(env({ home }))).map((a) => a.id)).toEqual(["cursor", "vscode"]);
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
      codex: 'run "codex mcp login refero" in a terminal',
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd cli && bun test test/agents-catalog.test.ts`
Expected: FAIL — `Cannot find module '../src/agents/catalog'`.

- [ ] **Step 3: Write `cli/src/agents/catalog.ts`**

```ts
// The coding agents Motif sets design sources up for: how to find each, where it keeps its MCP settings, and how to
// sign in to a server there (Part 3 spec §7).
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";

export type AgentId = "claude" | "codex" | "cursor" | "copilot" | "vscode" | "gemini" | "opencode";
export const AGENT_IDS: AgentId[] = ["claude", "codex", "cursor", "copilot", "vscode", "gemini", "opencode"];

/** What Motif needs to know about this computer to find agents and their settings. */
export interface AgentEnv {
  home: string;
  platform: NodeJS.Platform;
  vars: Record<string, string | undefined>;
  which: (cmd: string) => string | null;
}

export interface SettingsFile {
  path: string;
  /** The file as the developer is shown it. */
  where: string;
  format: "json" | "toml";
  /** Where the servers are inside the file. */
  key: "mcpServers" | "servers" | "mcp" | "mcp_servers";
  scope: "user" | "project";
}

export interface AgentInfo {
  id: AgentId;
  label: string;
  found(e: AgentEnv): boolean;
  /** User settings first, then the project's. */
  settings(e: AgentEnv, cwd: string): SettingsFile[];
  /** How to sign in to a server that needs it (Refero, 60fps.design), as the end of a sentence. */
  signIn(server: string): string;
}

export function defaultAgentEnv(): AgentEnv {
  return { home: homedir(), platform: process.platform, vars: process.env, which: (c) => Bun.which(c) };
}

/** A path in the home folder as ~/… with forward slashes; any other path as it is. */
export function shown(e: AgentEnv, path: string): string {
  const rel = relative(e.home, path);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? `~/${rel.split(sep).join("/")}` : path;
}

export const codexHome = (e: AgentEnv) => e.vars.CODEX_HOME || join(e.home, ".codex");
export const copilotHome = (e: AgentEnv) => e.vars.COPILOT_HOME || join(e.home, ".copilot");
export const geminiDir = (e: AgentEnv) => join(e.vars.GEMINI_CLI_HOME || e.home, ".gemini");
export const configHome = (e: AgentEnv) => e.vars.XDG_CONFIG_HOME || join(e.home, ".config");

/** VS Code's user profile folder, where its user mcp.json lives. */
export function vscodeUserDir(e: AgentEnv): string {
  if (e.platform === "win32") return join(e.vars.APPDATA || join(e.home, "AppData", "Roaming"), "Code", "User");
  if (e.platform === "darwin") return join(e.home, "Library", "Application Support", "Code", "User");
  return join(configHome(e), "Code", "User");
}

const user = (e: AgentEnv, path: string, format: SettingsFile["format"], key: SettingsFile["key"]): SettingsFile =>
  ({ path, where: shown(e, path), format, key, scope: "user" });
const project = (cwd: string, rel: string, format: SettingsFile["format"], key: SettingsFile["key"]): SettingsFile =>
  ({ path: join(cwd, ...rel.split("/")), where: rel, format, key, scope: "project" });

export const AGENTS: AgentInfo[] = [
  {
    id: "claude",
    label: "Claude Code",
    found: (e) => Boolean(e.which("claude")),
    settings: (e, cwd) => [user(e, join(e.home, ".claude.json"), "json", "mcpServers"), project(cwd, ".mcp.json", "json", "mcpServers")],
    signIn: (s) => `in Claude Code, type /mcp, choose "${s}" and sign in`,
  },
  {
    id: "codex",
    label: "Codex",
    found: (e) => Boolean(e.which("codex")),
    settings: (e, cwd) => [user(e, join(codexHome(e), "config.toml"), "toml", "mcp_servers"), project(cwd, ".codex/config.toml", "toml", "mcp_servers")],
    signIn: (s) => `run "codex mcp login ${s}" in a terminal`,
  },
  {
    id: "cursor",
    label: "Cursor",
    found: (e) => existsSync(join(e.home, ".cursor")) || Boolean(e.which("cursor") || e.which("cursor-agent")),
    settings: (e, cwd) => [user(e, join(e.home, ".cursor", "mcp.json"), "json", "mcpServers"), project(cwd, ".cursor/mcp.json", "json", "mcpServers")],
    signIn: (s) => `in Cursor's settings, under MCP, sign in to "${s}" (or run "cursor-agent mcp login ${s}")`,
  },
  {
    id: "copilot",
    label: "GitHub Copilot CLI",
    found: (e) => Boolean(e.which("copilot")),
    settings: (e, cwd) => [
      user(e, join(copilotHome(e), "mcp-config.json"), "json", "mcpServers"),
      project(cwd, ".mcp.json", "json", "mcpServers"),
      project(cwd, ".github/mcp.json", "json", "mcpServers"),
    ],
    signIn: (s) => `in Copilot CLI, type /mcp and sign in to "${s}"`,
  },
  {
    id: "vscode",
    label: "VS Code",
    found: (e) => Boolean(e.which("code")) || existsSync(vscodeUserDir(e)),
    settings: (e, cwd) => [user(e, join(vscodeUserDir(e), "mcp.json"), "json", "servers"), project(cwd, ".vscode/mcp.json", "json", "servers")],
    signIn: (s) => `VS Code asks you to sign in to "${s}" the first time Copilot uses it`,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    found: (e) => Boolean(e.which("gemini")),
    settings: (e, cwd) => [user(e, join(geminiDir(e), "settings.json"), "json", "mcpServers"), project(cwd, ".gemini/settings.json", "json", "mcpServers")],
    signIn: (s) => `in Gemini CLI, type /mcp auth ${s}`,
  },
  {
    id: "opencode",
    label: "OpenCode",
    found: (e) => Boolean(e.which("opencode")),
    settings: (e, cwd) => [
      user(e, join(configHome(e), "opencode", "opencode.json"), "json", "mcp"),
      user(e, join(configHome(e), "opencode", "opencode.jsonc"), "json", "mcp"),
      project(cwd, "opencode.json", "json", "mcp"),
      project(cwd, "opencode.jsonc", "json", "mcp"),
    ],
    signIn: (s) => `run "opencode mcp auth ${s}" in a terminal`,
  },
];

export function agentById(id: string): AgentInfo | undefined {
  return AGENTS.find((a) => a.id === id);
}
```

- [ ] **Step 4: Run the tests**

Run: `cd cli && bun test test/agents-catalog.test.ts && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add cli/src/agents/catalog.ts cli/test/agents-catalog.test.ts
git commit -m "feat(agents): the seven agents, where each keeps its MCP settings, and how to sign in" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Reading every agent's settings

**Files:**
- Modify: `cli/src/detect/sources.ts`
- Modify: `cli/test/sources.test.ts`, `cli/test/catalog.test.ts` (ids now repeat per agent)

**Interfaces:**
- Consumes: `AGENTS`, `AgentEnv`, `AgentId` (Task 1).
- Produces:
  - `interface ConfiguredSource { id: SourceId; agent: AgentId; server: string; where: string }` (adds `agent`)
  - `interface AgentServer { agent: AgentId; name: string; def: unknown; where: string }`
  - `readSettings(path: string, format: "json" | "toml"): Record<string, unknown> | null | undefined` (undefined = no file, null = can't read)
  - `readAgentServers(cwd: string, e: AgentEnv): { servers: AgentServer[]; unreadable: string[] }`
  - `sourcesIn(servers: AgentServer[]): ConfiguredSource[]` (one per agent and source)
  - `findConfiguredSources(cwd: string, home: string, e?: Partial<Omit<AgentEnv, "home">>): ConfiguredSource[]` (defaults: this platform, no variables, no commands)

- [ ] **Step 1: Write the failing tests**

In `cli/test/sources.test.ts`, change the first test's last line to compare Claude Code's sources only (a project's `.mcp.json` now counts for Copilot CLI too):

```ts
    expect(findConfiguredSources(cwd, home).filter((s) => s.agent === "claude").map((s) => s.id).sort()).toEqual(["21st", "60fps", "refero"]);
```

and the byte-order-mark test's line to:

```ts
    expect([...new Set(findConfiguredSources(cwd, tmp()).map((s) => s.id))]).toEqual(["refero"]);
```

In `cli/test/catalog.test.ts` (the "configurations each source's own installer writes" test), change the last line to:

```ts
    expect([...new Set(findConfiguredSources(cwd, home).map((s) => s.id))].sort()).toEqual(["21st", "60fps", "motion", "refero"]);
```

In `cli/test/connect.test.ts`, add `agent: "claude"` to every `ConfiguredSource` literal (the `connected:` fixtures, for example `[{ id: "motion", agent: "claude", server: "motion", where: ".mcp.json" }]`), so the typecheck stays clean once `ConfiguredSource` gains `agent`.

Append to `cli/test/sources.test.ts` (add `mkdirSync` to the `node:fs` import, `dirname` to `node:path`, and `readAgentServers` to the sources import):

```ts
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd cli && bun test test/sources.test.ts test/catalog.test.ts`
Expected: FAIL — `readAgentServers` isn't exported; the new tests find only Claude Code's files.

- [ ] **Step 3: Rewrite `cli/src/detect/sources.ts`**

```ts
import { readFileSync } from "node:fs";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import { AGENTS, type AgentEnv, type AgentId } from "../agents/catalog";
import { SOURCES, type SourceId } from "../sources/catalog";
import { stripBom } from "../text";

export type { SourceId };

export const SOURCE_LABELS = Object.fromEntries(SOURCES.map((s) => [s.id, s.label])) as Record<SourceId, string>;

export interface ConfiguredSource {
  id: SourceId;
  agent: AgentId;
  server: string;
  where: string;
}

export interface AgentServer {
  agent: AgentId;
  name: string;
  def: unknown;
  where: string;
}

/** A settings file's contents: undefined when there's no such file, null when it can't be read or parsed. */
export function readSettings(path: string, format: "json" | "toml"): Record<string, unknown> | null | undefined {
  let text: string;
  try {
    text = stripBom(readFileSync(path, "utf8"));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? undefined : null;
  }
  if (format === "toml") {
    try {
      return Bun.TOML.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const errors: ParseError[] = [];
  const value = parseJsonc(text, errors, { allowTrailingComma: true });
  return errors.length === 0 && value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

const normPath = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** Every MCP server in every agent's user and project settings, and the settings files that couldn't be read. */
export function readAgentServers(cwd: string, e: AgentEnv): { servers: AgentServer[]; unreadable: string[] } {
  const servers: AgentServer[] = [];
  const unreadable: string[] = [];
  for (const agent of AGENTS) {
    for (const file of agent.settings(e, cwd)) {
      const doc = readSettings(file.path, file.format);
      if (doc === null) {
        if (!unreadable.includes(file.path)) unreadable.push(file.path);
        continue;
      }
      if (!doc) continue;
      const addAll = (map: unknown, where: string) => {
        if (map && typeof map === "object" && !Array.isArray(map)) {
          for (const [name, def] of Object.entries(map)) servers.push({ agent: agent.id, name, def, where });
        }
      };
      addAll(doc[file.key], file.where);
      if (agent.id === "claude" && file.scope === "user") {
        for (const [projectPath, project] of Object.entries((doc.projects as Record<string, unknown>) ?? {})) {
          if (normPath(projectPath) === normPath(cwd)) addAll((project as any)?.mcpServers, `${file.where} (this project)`);
        }
      }
    }
  }
  return { servers, unreadable };
}

/** The design sources among those servers: one entry per agent and source, the first server that matches. */
export function sourcesIn(servers: AgentServer[]): ConfiguredSource[] {
  const found: ConfiguredSource[] = [];
  for (const s of servers) {
    const text = `${s.name}\n${JSON.stringify(s.def)}`;
    for (const source of SOURCES) {
      if (source.configPattern.test(text) && !found.some((f) => f.id === source.id && f.agent === s.agent)) {
        found.push({ id: source.id, agent: s.agent, server: s.name, where: s.where });
      }
    }
  }
  return found;
}

/** The design sources set up in each agent. Without e, it assumes this platform and no agent variables. */
export function findConfiguredSources(cwd: string, home: string, e: Partial<Omit<AgentEnv, "home">> = {}): ConfiguredSource[] {
  const env: AgentEnv = { home, platform: e.platform ?? process.platform, vars: e.vars ?? {}, which: e.which ?? (() => null) };
  return sourcesIn(readAgentServers(cwd, env).servers);
}
```

- [ ] **Step 4: Run the tests**

Run: `cd cli && bun test test/sources.test.ts test/catalog.test.ts test/connect.test.ts test/doctor.test.ts && bun run typecheck`
Expected: sources, catalog and connect PASS; typecheck clean. `doctor.test.ts`'s "lists connected design sources" still passes here (its detail changes in Task 3).

- [ ] **Step 5: Commit**

```bash
git add cli/src/detect/sources.ts cli/test/sources.test.ts cli/test/catalog.test.ts cli/test/connect.test.ts
git commit -m "feat(sources): read every agent's MCP settings, JSON with comments and Codex's TOML" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `doctor` and `motif connect` list sources by agent

**Files:**
- Modify: `cli/src/commands/doctor.ts` (sources item, `data.sources`, `data.unreadable`, `DoctorDeps.vars`)
- Modify: `cli/src/commands/connect.ts` (`list()` only; the `configured` default and fixtures)
- Test: `cli/test/doctor.test.ts`, `cli/test/connect.test.ts`

**Interfaces:**
- Consumes: `readAgentServers`, `sourcesIn`, `findConfiguredSources`, `ConfiguredSource` (Task 2); `AGENTS`, `agentById`, `defaultAgentEnv`, `AgentEnv` (Task 1).
- Produces: `DoctorDeps.vars?: Record<string, string | undefined>`; doctor `data.sources: { id, label, agents: { agent, server, where }[] }[]` and `data.unreadable: string[]`; connect list `data.sources[].agents: AgentId[]`.

- [ ] **Step 1: Write the failing tests**

In `cli/test/doctor.test.ts`, change the "lists connected design sources" expectation to:

```ts
    expect(item(r.data.items as DoctorItem[], "sources")).toMatchObject({ status: "ok", detail: "Connected: Refero (Claude Code, GitHub Copilot CLI)." });
```

and append inside its `describe`:

```ts
  test("names the agents that have each source, and the settings files it couldn't read (Part 3)", async () => {
    const home = tempDir("motif-doc-home-");
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(join(home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { motion: { url: "https://mcp.motion.dev" } } }));
    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(join(home, ".gemini", "settings.json"), "{ nope");
    const r = await runDoctor(tempDir("motif-doc-app-"), deps({ home, platform: "linux", vars: {} }));
    expect(r.exitCode).toBe(0);
    expect(item(r.data.items as DoctorItem[], "sources")).toMatchObject({ status: "ok", detail: "Connected: Motion (Cursor)." });
    const sources = r.data.sources as { id: string; agents: { agent: string; where: string }[] }[];
    expect(sources.find((s) => s.id === "motion")!.agents).toEqual([{ agent: "cursor", server: "motion", where: "~/.cursor/mcp.json" }]);
    expect(sources.find((s) => s.id === "refero")!.agents).toEqual([]);
    expect(r.data.unreadable).toEqual([join(home, ".gemini", "settings.json")]);
  });
```

(add `mkdirSync` to its `node:fs` import if missing.)

In `cli/test/connect.test.ts`'s list test (its fixtures got `agent: "claude"` in Task 2), add:

```ts
    expect(r.text).toContain("In: Claude Code");
    expect((r.data.sources as { id: string; agents: string[] }[]).find((s) => s.id === "motion")!.agents).toEqual(["claude"]);
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd cli && bun test test/doctor.test.ts test/connect.test.ts`
Expected: FAIL — doctor's detail still says "Connected: Refero."; no `data.sources`; the list has no "In:".

- [ ] **Step 3: Change `cli/src/commands/doctor.ts`**

Imports:

```ts
import { AGENTS, type AgentEnv } from "../agents/catalog";
import { readAgentServers, sourcesIn } from "../detect/sources";
import { SOURCES } from "../sources/catalog";
```

(drop `findConfiguredSources` and `SOURCE_LABELS` from its sources import). Add to `DoctorDeps`:

```ts
  /** Environment variables (agents' settings folders follow some, e.g. CODEX_HOME). */
  vars?: Record<string, string | undefined>;
```

and `vars: process.env,` to `defaultDoctorDeps()`. Replace the sources block with:

```ts
  const agentEnv: AgentEnv = { home: deps.home, platform: deps.platform, vars: deps.vars ?? {}, which: deps.which };
  const read = readAgentServers(cwd, agentEnv);
  const configured = sourcesIn(read.servers);
  const sources = SOURCES.map((s) => ({
    id: s.id,
    label: s.label,
    agents: configured.filter((c) => c.id === s.id).map(({ agent, server, where }) => ({ agent, server, where })),
  }));
  const agentLabel = (id: string) => AGENTS.find((a) => a.id === id)!.label;
  const connected = sources.filter((s) => s.agents.length > 0);
  if (connected.length > 0) {
    const named = connected.map((s) => `${s.label} (${[...new Set(s.agents.map((a) => agentLabel(a.agent)))].join(", ")})`);
    push("sources", "ok", "Design sources", `Connected: ${named.join(", ")}.`);
  } else {
    push("sources", "optional", "Design sources", 'None connected. Everything works without them; you can add them later with "motif connect".');
  }
```

and return `data: { items, apps, sources, unreadable: read.unreadable }`.

- [ ] **Step 4: Change `list()` and the default `configured` in `cli/src/commands/connect.ts`**

Import `agentById` and `defaultAgentEnv` from `../agents/catalog`. In `defaultDeps`, set `configured: () => findConfiguredSources(cwd, home, defaultAgentEnv())`. Replace `list`:

```ts
function list(deps: ConnectDeps): CommandResult {
  const configured = deps.configured();
  const agentsFor = (id: string) => [...new Set(configured.filter((c) => c.id === id).map((c) => c.agent))];
  const lines = ["Design sources — all optional; Motif works fully without them:"];
  for (const s of SOURCES) {
    const agents = agentsFor(s.id);
    const where = agents.length > 0 ? ` In: ${agents.map((a) => agentById(a)!.label).join(", ")}.` : ` Connect: ${deps.self} connect ${s.id}`;
    lines.push(`  ${agents.length > 0 ? "✓" : "○"} ${s.label} — ${s.gives}. ${s.cost}.${where}`);
  }
  lines.push("  Supahero needs nothing: Motif reads its public pages when you build a landing page.");
  return {
    command: "connect",
    exitCode: 0,
    text: lines.join("\n"),
    data: {
      sources: SOURCES.map((s) => {
        const agents = agentsFor(s.id);
        return { id: s.id, label: s.label, connected: agents.length > 0, agents, gives: s.gives, cost: s.cost, command: `${deps.self} connect ${s.id}` };
      }),
    },
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `cd cli && bun test test/doctor.test.ts test/connect.test.ts test/sources.test.ts && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add cli/src/commands/doctor.ts cli/src/commands/connect.ts cli/test/doctor.test.ts cli/test/connect.test.ts
git commit -m "feat(doctor): design sources by agent, and the settings files that couldn't be read" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Adding a server to a settings file

**Files:**
- Create: `cli/src/agents/edit.ts`
- Test: `cli/test/agents-edit.test.ts`

**Interfaces:**
- Produces:
  - `type Edited = { ok: true } | { ok: false; reason: string }`
  - `addJsonServer(path: string, key: string, name: string, server: Record<string, unknown>, holdsKey?: boolean): Edited`
  - `addTomlServer(path: string, name: string, server: { url: string; headers?: Record<string, string> }, holdsKey?: boolean): Edited`

- [ ] **Step 1: Write the failing test**

`cli/test/agents-edit.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { addJsonServer, addTomlServer } from "../src/agents/edit";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const dir = () => tempDir("motif-edit-");
const isWin = process.platform === "win32";

describe("adding a server to a JSON settings file", () => {
  test("creates the file and its folder when there's none", () => {
    const p = join(dir(), ".cursor", "mcp.json");
    expect(addJsonServer(p, "mcpServers", "motion", { url: "https://mcp.motion.dev" })).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(p, "utf8"))).toEqual({ mcpServers: { motion: { url: "https://mcp.motion.dev" } } });
  });

  test("keeps every other server, comment and trailing comma, and the line endings (review focus)", () => {
    const p = join(dir(), "mcp.json");
    writeFileSync(p, '{\r\n  // mine\r\n  "servers": {\r\n    "github": { "command": "gh-mcp" },\r\n  },\r\n  "inputs": [],\r\n}\r\n');
    expect(addJsonServer(p, "servers", "refero", { type: "http", url: "https://api.refero.design/mcp" })).toEqual({ ok: true });
    const after = readFileSync(p, "utf8");
    expect(after).toContain("// mine");
    expect(after).toContain('"github": { "command": "gh-mcp" }');
    expect(after.replace(/\r\n/g, "")).not.toContain("\n");
    expect(parse(after, [], { allowTrailingComma: true })).toEqual({
      servers: { github: { command: "gh-mcp" }, refero: { type: "http", url: "https://api.refero.design/mcp" } },
      inputs: [],
    });
  });

  test("leaves a file that isn't valid JSON as it was", () => {
    const p = join(dir(), "mcp.json");
    writeFileSync(p, "{ nope");
    const r = addJsonServer(p, "mcpServers", "motion", { url: "https://mcp.motion.dev" });
    expect(r.ok).toBe(false);
    expect(readFileSync(p, "utf8")).toBe("{ nope");
  });

  test.skipIf(isWin)("a new file holding a key is readable by its owner only; an existing file keeps its permissions", () => {
    const p = join(dir(), "mcp.json");
    addJsonServer(p, "mcpServers", "21st", { url: "https://21st.dev/api/mcp", headers: { "x-api-key": "abcd1234" } }, true);
    expect(statSync(p).mode & 0o777).toBe(0o600);
    const q = join(dir(), "mcp.json");
    writeFileSync(q, "{}", { mode: 0o640 });
    addJsonServer(q, "mcpServers", "motion", { url: "https://mcp.motion.dev" });
    expect(statSync(q).mode & 0o777).toBe(0o640);
  });
});

describe("adding a server to Codex's config.toml", () => {
  test("appends the table and keeps everything already there (review focus)", () => {
    const p = join(dir(), "config.toml");
    const before = '# my settings\nmodel = "gpt-5"\n\n[mcp_servers.github]\ncommand = "gh-mcp"\n';
    writeFileSync(p, before);
    expect(addTomlServer(p, "21st", { url: "https://21st.dev/api/mcp", headers: { "x-api-key": "abcd1234" } })).toEqual({ ok: true });
    const after = readFileSync(p, "utf8");
    expect(after.startsWith(before)).toBe(true);
    expect(Bun.TOML.parse(after)).toEqual({
      model: "gpt-5",
      mcp_servers: { github: { command: "gh-mcp" }, "21st": { url: "https://21st.dev/api/mcp", http_headers: { "x-api-key": "abcd1234" } } },
    });
  });

  test("creates the file when there's none", () => {
    const p = join(dir(), ".codex", "config.toml");
    expect(addTomlServer(p, "motion", { url: "https://mcp.motion.dev" })).toEqual({ ok: true });
    expect(readFileSync(p, "utf8")).toBe('[mcp_servers.motion]\nurl = "https://mcp.motion.dev"\n');
  });

  test("leaves a broken file, or one that already has a server of that name, as it was (review focus)", () => {
    const p = join(dir(), "config.toml");
    writeFileSync(p, "[mcp_servers.motion\n");
    expect(addTomlServer(p, "refero", { url: "https://api.refero.design/mcp" }).ok).toBe(false);
    expect(readFileSync(p, "utf8")).toBe("[mcp_servers.motion\n");
    const q = join(dir(), "config.toml");
    writeFileSync(q, '[mcp_servers.motion]\nurl = "elsewhere"\n');
    expect(addTomlServer(q, "motion", { url: "https://mcp.motion.dev" }).ok).toBe(false);
    expect(readFileSync(q, "utf8")).toBe('[mcp_servers.motion]\nurl = "elsewhere"\n');
  });

  test("a file without a final newline still comes out valid", () => {
    const p = join(dir(), "config.toml");
    writeFileSync(p, 'model = "gpt-5"');
    expect(addTomlServer(p, "motion", { url: "https://mcp.motion.dev" })).toEqual({ ok: true });
    expect(Bun.TOML.parse(readFileSync(p, "utf8"))).toEqual({ model: "gpt-5", mcp_servers: { motion: { url: "https://mcp.motion.dev" } } });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd cli && bun test test/agents-edit.test.ts`
Expected: FAIL — `Cannot find module '../src/agents/edit'`.

- [ ] **Step 3: Write `cli/src/agents/edit.ts`**

```ts
// Adds an MCP server to an agent's settings file, for the agents whose own command can't (Part 3 spec §7.2): every
// other entry, comment and the formatting stay as they were, and a file Motif can't read is left alone.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";

export type Edited = { ok: true } | { ok: false; reason: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Writes beside the file, then moves it into place, so a failed write never leaves half a settings file. */
function writeSafely(path: string, text: string, holdsKey: boolean): Edited {
  const tmp = `${path}.motif-${process.pid}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const mode = existsSync(path) ? statSync(path).mode & 0o777 : holdsKey ? 0o600 : undefined;
    writeFileSync(tmp, text);
    if (mode !== undefined && process.platform !== "win32") chmodSync(tmp, mode);
    renameSync(tmp, path);
    return { ok: true };
  } catch (e) {
    rmSync(tmp, { force: true });
    return { ok: false, reason: `couldn't write ${path}: ${message(e)}` };
  }
}

function readIfThere(path: string): { text: string } | Edited {
  if (!existsSync(path)) return { text: "" };
  try {
    return { text: readFileSync(path, "utf8") };
  } catch (e) {
    return { ok: false, reason: `couldn't read ${path}: ${message(e)}` };
  }
}

/** Adds name under key (mcpServers for Cursor, servers for VS Code) in a JSON or JSONC file. */
export function addJsonServer(path: string, key: string, name: string, server: Record<string, unknown>, holdsKey = false): Edited {
  const read = readIfThere(path);
  if (!("text" in read)) return read;
  const bom = read.text.startsWith("﻿") ? "﻿" : "";
  const body = bom ? read.text.slice(1) : read.text;
  if (body.trim() !== "") {
    const errors: ParseError[] = [];
    const doc = parse(body, errors, { allowTrailingComma: true });
    if (errors.length > 0 || doc === null || typeof doc !== "object" || Array.isArray(doc)) {
      return { ok: false, reason: `${path} isn't valid JSON, so it wasn't changed` };
    }
  }
  const base = body.trim() === "" ? "{}" : body;
  const eol = base.includes("\r\n") ? "\r\n" : "\n";
  const next = applyEdits(base, modify(base, [key, name], server, { formattingOptions: { insertSpaces: true, tabSize: 2, eol } }));
  return writeSafely(path, `${bom}${next.endsWith(eol) ? next : next + eol}`, holdsKey);
}

/** Appends [mcp_servers.<name>] to Codex's config.toml. */
export function addTomlServer(path: string, name: string, server: { url: string; headers?: Record<string, string> }, holdsKey = false): Edited {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return { ok: false, reason: `"${name}" can't be a server name in ${path}` };
  const read = readIfThere(path);
  if (!("text" in read)) return read;
  const text = read.text;
  if (text.trim() !== "") {
    let doc: any;
    try {
      doc = Bun.TOML.parse(text.replace(/^﻿/, ""));
    } catch {
      return { ok: false, reason: `${path} isn't valid TOML, so it wasn't changed` };
    }
    if (doc?.mcp_servers?.[name] !== undefined) return { ok: false, reason: `${path} already has a server named "${name}", so it wasn't changed` };
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const table = [`[mcp_servers.${name}]`, `url = ${JSON.stringify(server.url)}`];
  if (server.headers) {
    table.push(`http_headers = { ${Object.entries(server.headers).map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`).join(", ")} }`);
  }
  const gap = text === "" ? "" : text.endsWith("\n") ? eol : eol + eol;
  const next = `${text}${gap}${table.join(eol)}${eol}`;
  try {
    if ((Bun.TOML.parse(next.replace(/^﻿/, "")) as any)?.mcp_servers?.[name]?.url !== server.url) throw new Error("not added");
  } catch {
    return { ok: false, reason: `couldn't add "${name}" to ${path} cleanly, so it wasn't changed` };
  }
  return writeSafely(path, next, holdsKey);
}
```

- [ ] **Step 4: Run the tests**

Run: `cd cli && bun test test/agents-edit.test.ts && bun run typecheck`
Expected: PASS; typecheck clean. If `jsonc-parser`'s `modify` places the new entry so the trailing-comma file no longer parses, read its output, adjust `formattingOptions` or insert with `{ isArrayInsertion: false }`, and ledger the change; the test's `parse` check is the contract.

- [ ] **Step 5: Commit**

```bash
git add cli/src/agents/edit.ts cli/test/agents-edit.test.ts
git commit -m "feat(agents): add a server to a JSON(C) or TOML settings file, keeping everything else" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `motif connect` for every agent

**Files:**
- Modify: `cli/src/commands/connect.ts` (agent choice, per-agent add, results)
- Modify: `cli/src/main.ts` (`--agent` option, help line)
- Test: `cli/test/connect.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4 (`AGENTS`, `agentById`, `AGENT_IDS`, `AgentEnv`, `codexHome`, `copilotHome`, `geminiDir`, `configHome`, `vscodeUserDir`, `shown`; `ConfiguredSource`; `addJsonServer`, `addTomlServer`).
- Produces:
  - `ConnectDeps` gains `ask(prompt: string): Promise<string>`, `platform: NodeJS.Platform`, `vars: Record<string, string | undefined>`
  - `pickAgents(answer: string, found: AgentInfo[]): AgentInfo[] | null`
  - connect `data`: `{ source, agents: { agent, status: "added" | "already" | "failed", where?, output? }[] }`, plus `error`, `output`, `config` when an agent failed

- [ ] **Step 1: Write the failing tests**

In `cli/test/connect.test.ts`, extend `fakes()`'s `deps` with:

```ts
    ask: async () => "",
    platform: "linux",
    vars: {},
```

and add `existsSync`, `mkdirSync`, `readFileSync` to its `node:fs` import. Then append:

```ts
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

  test("warns about each settings file that now holds the key and is tracked by git", async () => {
    const s = setup(["cursor", "gemini"], { tracked: (args) => args.includes("mcp.json") });
    const r = await runConnect(".", ctx("21st"), s.deps);
    expect(r.text).toContain("~/.cursor/mcp.json, which now holds your key, is tracked by git");
    expect(r.text).not.toContain("settings.json, which now holds your key");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd cli && bun test test/connect.test.ts`
Expected: FAIL — `connect` still sets up Claude Code only (the new tests find no Cursor file, no Gemini run, no question).

- [ ] **Step 3: Rewrite the `<source>` path of `cli/src/commands/connect.ts`**

Keep `spawnArgs`, `runCommand`, `readSecret`, `genericConfig`, `KEY`, `fail`, `selfCommand` and the new `list()`. Imports:

```ts
import { basename, dirname, join } from "node:path";
import { addJsonServer, addTomlServer, type Edited } from "../agents/edit";
import {
  AGENT_IDS, AGENTS, agentById, codexHome, configHome, copilotHome, defaultAgentEnv, geminiDir, shown, vscodeUserDir,
  type AgentEnv, type AgentInfo,
} from "../agents/catalog";
```

`ConnectDeps` gains:

```ts
  /** Reads a line the developer types in their own terminal (shown as typed): which agents to set up. */
  ask: (prompt: string) => Promise<string>;
  platform: NodeJS.Platform;
  /** Environment variables (agents' settings folders follow some, e.g. CODEX_HOME). */
  vars: Record<string, string | undefined>;
```

`defaultDeps` adds `ask: readLine, platform: process.platform, vars: process.env`, with:

```ts
/** Reads one line from the terminal, as typed. */
function readLine(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const stdin = process.stdin;
  let value = "";
  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      value += chunk.toString("utf8");
      const end = value.search(/\r?\n/);
      if (end !== -1) {
        stdin.off("data", onData);
        stdin.pause();
        resolve(value.slice(0, end));
      }
    };
    stdin.resume();
    stdin.on("data", onData);
  });
}
```

Then:

```ts
/** The agents the developer picked from the numbered list: Enter (nothing) is all of them. Null when the answer isn't a choice. */
export function pickAgents(answer: string, found: AgentInfo[]): AgentInfo[] | null {
  const a = answer.trim();
  if (a === "") return found;
  const picked = a.split(/[\s,]+/).filter(Boolean).map(Number);
  if (picked.some((n) => !Number.isInteger(n) || n < 1 || n > found.length)) return null;
  return [...new Set(picked)].sort((x, y) => x - y).map((n) => found[n - 1]!);
}

interface ServerSpec {
  name: string;
  url: string;
  headers?: Record<string, string>;
}

interface AddResult {
  ok: boolean;
  output: string;
  /** Files that now hold the key, to check against git. */
  keyFiles: string[];
}

/**
 * Adds the server to one agent's user settings: with the agent's own command, or by editing its file where the command
 * can't — Codex's starts a sign-in and waits for a browser; VS Code's would pass JSON through cmd.exe on Windows.
 */
async function addTo(agent: AgentInfo, server: ServerSpec, deps: ConnectDeps, env: AgentEnv): Promise<AddResult> {
  const header = server.headers ? Object.entries(server.headers)[0] : undefined;
  const colon = header ? ["--header", `${header[0]}: ${header[1]}`] : [];
  const command = async (cli: string, args: string[], keyFiles: string[]): Promise<AddResult> => {
    const exe = deps.which(cli);
    if (!exe) return { ok: false, output: `its "${cli}" command isn't on PATH`, keyFiles: [] };
    const r = await deps.run(exe, args);
    return { ok: r.code === 0, output: r.output, keyFiles };
  };
  const file = (path: string, edit: () => Edited): AddResult => {
    const r = edit();
    return r.ok ? { ok: true, output: "", keyFiles: [path] } : { ok: false, output: r.reason, keyFiles: [] };
  };
  const holdsKey = Boolean(header);
  const plain = { url: server.url, ...(server.headers ? { headers: server.headers } : {}) };
  switch (agent.id) {
    case "claude":
      return command("claude", ["mcp", "add", ...colon, "--transport", "http", "--scope", "user", server.name, server.url], [join(env.home, ".claude.json")]);
    case "codex": {
      const path = join(codexHome(env), "config.toml");
      return file(path, () => addTomlServer(path, server.name, plain, holdsKey));
    }
    case "cursor": {
      const path = join(env.home, ".cursor", "mcp.json");
      return file(path, () => addJsonServer(path, "mcpServers", server.name, plain, holdsKey));
    }
    case "copilot":
      return command("copilot", ["mcp", "add", "--transport", "http", ...colon, server.name, server.url], [join(copilotHome(env), "mcp-config.json")]);
    case "vscode": {
      const path = join(vscodeUserDir(env), "mcp.json");
      return file(path, () => addJsonServer(path, "servers", server.name, { type: "http", ...plain }, holdsKey));
    }
    case "gemini":
      return command("gemini", ["mcp", "add", "--scope", "user", "--transport", "http", ...colon, server.name, server.url], [join(geminiDir(env), "settings.json")]);
    case "opencode": {
      const dir = join(configHome(env), "opencode");
      const equals = header ? ["--header", `${header[0]}=${header[1]}`] : [];
      return command("opencode", ["mcp", "add", server.name, "--url", server.url, ...equals], [join(dir, "opencode.jsonc"), join(dir, "opencode.json")]);
    }
  }
}

type AgentResult = { agent: AgentInfo; status: "added" | "already" | "failed"; server?: string; where?: string; output?: string; keyFiles?: string[] };

function needsTerminal(source: SourceInfo, deps: ConnectDeps, agentFlag: string): CommandResult {
  const run = `${deps.self} connect ${source.id}${agentFlag}`;
  const powershell = run.startsWith('"') ? "\n(In PowerShell, type & and a space before it.)" : "";
  return fail(`${source.label} needs a key. Run this in your own terminal, so the key never passes through the chat:\n  ${run}${powershell}`, { error: "needs-terminal", run });
}

export async function runConnect(cwd: string, ctx: RunContext, deps: ConnectDeps = defaultDeps(cwd)): Promise<CommandResult> {
  const id = ctx.positionals[0];
  if (!id) return list(deps);
  const source = sourceById(id);
  if (!source) return fail(`There's no design source called "${id}". Choose one of: ${ids}.`, { error: "no-such-source" });
  const env: AgentEnv = { home: deps.home, platform: deps.platform, vars: deps.vars, which: deps.which };
  const config = JSON.parse(genericConfig(source));
  const manual = `To add it by hand, put this in your agent's MCP settings:\n${genericConfig(source)}`;
  const wanted = typeof ctx.flags?.agent === "string" ? ctx.flags.agent : undefined;
  const agentFlag = wanted ? ` --agent ${wanted}` : "";

  let chosen: AgentInfo[];
  let note = "";
  if (wanted !== undefined) {
    const asked = wanted.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const unknown = asked.find((a) => !agentById(a));
    if (asked.length === 0 || unknown !== undefined) {
      return fail(`There's no agent called "${unknown ?? wanted}". Choose from: ${AGENT_IDS.join(", ")}.`, { error: "no-such-agent" });
    }
    chosen = AGENTS.filter((a) => asked.includes(a.id));
  } else {
    const found = AGENTS.filter((a) => a.found(env));
    if (found.length === 0) {
      return fail(`Motif didn't find a coding agent it can set up on this computer (${AGENTS.map((a) => a.label).join(", ")}).\n${manual}`, { error: "no-agent", config });
    }
    if (found.length === 1) chosen = found;
    else if (deps.interactive) {
      const menu = found.map((a, i) => `${i + 1} ${a.label}`).join(", ");
      const picked = pickAgents(await deps.ask(`Set up ${source.label} for which agents? ${menu}. Press Enter for all, or type numbers (such as 1,3): `), found);
      if (!picked) return fail("That isn't a choice from the list. Nothing changed.", { error: "bad-choice" });
      chosen = picked;
    } else if (source.connect.auth === "key") {
      return needsTerminal(source, deps, agentFlag);
    } else {
      chosen = found;
      note = `Setting it up in every agent found (choose some with --agent): ${found.map((a) => a.label).join(", ")}.`;
    }
  }

  let secret = "";
  if (source.connect.auth === "key") {
    if (!deps.interactive) return needsTerminal(source, deps, agentFlag);
    const key = await deps.readSecret(`Paste your ${source.label} key (get one at ${source.docs}); it won't be shown: `);
    if (!key) return fail("No key entered. Nothing changed.", { error: "no-key" });
    if (!KEY.test(key)) return fail(`That doesn't look like a ${source.label} key (keys are at least 8 letters, digits or - _ . ~ + / =). Nothing changed.`, { error: "bad-key" });
    secret = key;
  }
  const server: ServerSpec = { name: source.connect.name, url: source.connect.url, ...(secret ? { headers: { [source.connect.keyHeader!]: secret } } : {}) };
  const hide = (text: string) => (secret ? text.replaceAll(secret, "<your key>") : text);

  const configured = deps.configured();
  const results: AgentResult[] = [];
  for (const agent of chosen) {
    const existing = configured.find((c) => c.id === source.id && c.agent === agent.id);
    if (existing) {
      results.push({ agent, status: "already", server: existing.server, where: existing.where });
      continue;
    }
    const r = await addTo(agent, server, deps, env);
    results.push(r.ok ? { agent, status: "added", keyFiles: r.keyFiles } : { agent, status: "failed", output: hide(r.output) });
  }

  const ok = results.filter((r) => r.status !== "failed");
  const failed = results.filter((r) => r.status === "failed");
  const lines: string[] = note ? [note] : [];
  for (const r of results) {
    if (r.status === "added") lines.push(`✓ ${r.agent.label}: added ${source.label} for all your projects.`);
    else if (r.status === "already") lines.push(`✓ ${r.agent.label}: already connected (server "${r.server}" in ${r.where}).`);
    else lines.push(`✗ ${r.agent.label}: couldn't add it: ${r.output}`);
  }
  if (failed.length > 0) lines.push(manual);
  if (source.connect.auth === "oauth" && ok.length > 0) {
    lines.push(`Next, sign in with your ${source.label} account:`);
    for (const r of ok) lines.push(`  ${r.agent.label}: ${r.agent.signIn(r.server ?? source.connect.name)}.`);
  }
  if (secret) {
    const git = deps.which("git");
    for (const file of ok.flatMap((r) => r.keyFiles ?? [])) {
      if (git && (await deps.run(git, ["-C", dirname(file), "ls-files", "--error-unmatch", basename(file)])).code === 0) {
        lines.push(`Warning: ${shown(env, file)}, which now holds your key, is tracked by git. Remove it from that repository before you push.`);
      }
    }
  }
  if (ok.length > 0) lines.push(source.note, `Cost: ${source.cost}.`);

  const data: Record<string, unknown> = {
    source: source.id,
    agents: results.map((r) => ({ agent: r.agent.id, status: r.status, ...(r.where ? { where: r.where } : {}), ...(r.output ? { output: r.output } : {}) })),
  };
  if (failed.length > 0) Object.assign(data, { error: ok.length === 0 ? "agent-failed" : "some-agents-failed", output: failed[0]!.output, config });
  return { command: "connect", exitCode: failed.length === 0 ? 0 : ok.length > 0 ? 1 : 2, text: lines.join("\n"), data };
}
```

Delete the old Claude-only body and its `ls-files … .claude.json` warning (the loop above replaces it).

- [ ] **Step 4: Add `--agent` in `cli/src/main.ts`**

In `parseArgs` options add `agent: { type: "string" },`, pass `agent: values.agent,` in `flags`, and change the help line to:

```
  connect    Connect optional design sources (Motion, Refero, 21st.dev, 60fps.design) to your coding agents (--agent claude,cursor picks them)
```

- [ ] **Step 5: Run the tests**

Run: `cd cli && bun test test/connect.test.ts && bun run typecheck`
Expected: PASS (the old tests too: with one agent found there's no question, and Claude Code's arguments are unchanged); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add cli/src/commands/connect.ts cli/src/main.ts cli/test/connect.test.ts
git commit -m "feat(connect): set a design source up in each agent the developer picks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The skill's sign-in notes and source notes

**Files:**
- Modify: `skill/agents.md` (sign-in section)
- Modify: `skill/sources/motion-dev.md`, `skill/sources/refero.md`, `skill/sources/21st.md`, `skill/sources/60fps.md`
- Test: `cli/test/skill-modes.test.ts`

**Interfaces:**
- Consumes: `AGENTS[].signIn` (Task 1).

- [ ] **Step 1: Write the failing test**

Append to `cli/test/skill-modes.test.ts` (import `AGENTS` from `"../src/agents/catalog"`):

```ts
describe("design sources in every agent (Part 3)", () => {
  test("agents.md says how to sign in to a design source in each agent, as motif connect does", () => {
    const agents = read("agents.md");
    expect(agents).toContain("## Signing in to a design source");
    const fragment: Record<string, string> = {
      claude: "type /mcp", codex: "codex mcp login", cursor: "cursor-agent mcp login", copilot: "/mcp and sign in",
      vscode: "VS Code asks", gemini: "/mcp auth", opencode: "opencode mcp auth",
    };
    for (const a of AGENTS) {
      expect([a.id, a.signIn("refero").includes(fragment[a.id]!), agents.includes(fragment[a.id]!)]).toEqual([a.id, true, true]);
    }
  });

  test("the source notes say motif connect sets a source up in the agents the developer picks", () => {
    for (const f of ["sources/motion-dev.md", "sources/refero.md", "sources/21st.md", "sources/60fps.md"]) {
      const note = read(f);
      expect([f, note.includes("Claude Code"), note.includes("the agents the developer picks")]).toEqual([f, false, true]);
    }
    for (const f of ["sources/refero.md", "sources/60fps.md"]) expect([f, read(f).includes("(../agents.md)")]).toEqual([f, true]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd cli && bun test test/skill-modes.test.ts`
Expected: FAIL — no sign-in section; the notes still say Claude Code.

- [ ] **Step 3: Append to `skill/agents.md`**

```markdown
## Signing in to a design source

Refero and 60fps.design need the developer to sign in once, after `motif connect` adds them. The server is `refero` or `60fps`:

| Agent | How the developer signs in |
|---|---|
| Claude Code | type /mcp, choose the server and sign in |
| Codex | run `codex mcp login <server>` in a terminal |
| Cursor | in Cursor's settings, under MCP, sign in to the server (or run `cursor-agent mcp login <server>`) |
| GitHub Copilot CLI | type /mcp and sign in to the server |
| VS Code (Copilot) | VS Code asks them to sign in the first time Copilot uses the server |
| Gemini CLI | type `/mcp auth <server>` |
| OpenCode | run `opencode mcp auth <server>` in a terminal |
```

- [ ] **Step 4: Reword the source notes**

`skill/sources/motion-dev.md`, in its `motif connect motion` paragraph: replace "sets it up for Claude Code; it's free" with "sets it up in the agents the developer picks; it's free", and "On a computer without Claude Code it prints the settings to paste into another agent instead;" with "When it finds no agent it can set up, it prints the settings to paste instead;".

`skill/sources/21st.md`: replace "and sets it up for Claude Code." with "and sets it up in the agents the developer picks.", and "On a computer without Claude Code it prints the settings to paste into another agent instead;" with "When it finds no agent it can set up, it prints the settings to paste instead;".

`skill/sources/refero.md` and `skill/sources/60fps.md`:
- In the "Until the developer signs in" paragraph, replace "(in Claude Code, `/mcp`)" with "([agents.md](../agents.md) says how in each agent)".
- In the `motif connect` paragraph, replace "sets it up for Claude Code (" with "sets it up in the agents the developer picks (", "Then the developer signs in through their agent's MCP sign-in; in Claude Code that is `/mcp`." with "Then the developer signs in through each agent's MCP sign-in, as [agents.md](../agents.md) says.", and "On a computer without Claude Code it prints the settings to paste into another agent instead;" with "When it finds no agent it can set up, it prints the settings to paste instead;".

- [ ] **Step 5: Run the tests**

Run: `cd cli && bun test test/skill-modes.test.ts test/skill-content.test.ts`
Expected: PASS (the lint resolves `../agents.md` inside the skill folder).

- [ ] **Step 6: Commit**

```bash
git add skill/agents.md skill/sources cli/test/skill-modes.test.ts
git commit -m "docs(skill): signing in to design sources in each agent; connect sets sources up in the agents picked" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Install scripts — the 3A deferred minors

From the 3A final review's deferred list (`docs/plans/notes/2026-10-17-3a-agent-facts.md` has the context). Drop this task if the developer chooses to defer them.

**Files:**
- Modify: `install.sh`, `install.ps1`
- Test: `cli/test/install-script.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside `describe.skipIf(!sh)("install.sh", …)`:

```ts
  test("--version takes a leading v too (3A review)", async () => {
    const r = await run(freshHome(), ["--agent", "agents", "--version", `v${VERSION}`], "ok", { MOTIF_RAW_BASE: `http://127.0.0.1:${server.port}/nowhere` });
    expect({ code: r.exitCode, out: r.output }).toMatchObject({ code: 0 });
    expect(r.output).not.toContain("vv");
  }, 60_000);

  test("--uninstall says so when there's nothing to remove (3A review)", async () => {
    const r = await run(freshHome(), ["--agent", "agents", "--uninstall"]);
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("nothing to remove");
  }, 60_000);

  test.skipIf(Boolean(Bun.which("opencode")))("with no OpenCode and no --agent, installs in ~/.agents/skills (3A review)", async () => {
    const home = freshHome();
    const r = await run(home, []);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(home, ".agents/skills/motif/SKILL.md"))).toBe(true);
  }, 60_000);

  test("installing for OpenCode points out an earlier Motif in ~/.agents/skills, which OpenCode also reads (3A review)", async () => {
    const home = freshHome();
    await run(home, ["--agent", "agents"]);
    const config = slash(join(home, "cfg"));
    mkdirSync(join(config, "opencode"), { recursive: true });
    const r = await run(home, ["--agent", "opencode"], "ok", { XDG_CONFIG_HOME: config });
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("OpenCode also reads ~/.agents/skills");
  }, 60_000);

  test("leaves a /motif command that isn't Motif's alone (3A review)", async () => {
    const home = freshHome();
    const config = slash(join(home, "cfg"));
    mkdirSync(join(config, "opencode/commands"), { recursive: true });
    writeFileSync(join(config, "opencode/commands/motif.md"), "my own command\n");
    const r = await run(home, ["--agent", "opencode"], "ok", { XDG_CONFIG_HOME: config });
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain("isn't Motif's");
    expect(readFileSync(join(config, "opencode/commands/motif.md"), "utf8")).toBe("my own command\n");
  }, 60_000);
```

Append inside `describe.skipIf(!isWin)("install.ps1", …)`:

```ts
  test("running it again replaces an earlier Motif install, and takes a version with a leading v (3A review)", async () => {
    const home = freshHome();
    await run(file(["-Agent", "agents"]), envFor(home));
    writeFileSync(join(home, ".agents/skills/motif/stale.md"), "old");
    const r = await run(file(["-Agent", "agents", "-Version", `v${VERSION}`]), envFor(home, "ok", { MOTIF_RAW_BASE: `http://127.0.0.1:${server.port}/nowhere` }));
    expect({ code: r.exitCode, out: r.output }).toMatchObject({ code: 0 });
    expect(existsSync(join(home, ".agents/skills/motif/stale.md"))).toBe(false);
  }, 180_000);

  test("-Uninstall says so when there's nothing to remove; a /motif command that isn't Motif's is left alone (3A review)", async () => {
    const home = freshHome();
    const u = await run(file(["-Agent", "agents", "-Uninstall"]), envFor(home));
    expect(u.exitCode).toBe(0);
    expect(u.output).toContain("nothing to remove");
    const config = join(home, "cfg");
    mkdirSync(join(config, "opencode/commands"), { recursive: true });
    writeFileSync(join(config, "opencode/commands/motif.md"), "my own command\n");
    const r = await run(file(["-Agent", "opencode"]), envFor(home, "ok", { XDG_CONFIG_HOME: config }));
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain("isn't Motif's");
  }, 180_000);
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd cli && bun test test/install-script.test.ts`
Expected: FAIL — "vv" in the output (sh), "removed Motif" instead of "nothing to remove", no OpenCode note; the foreign-command and auto-detect tests may already pass (they pin behaviour the review found untested; that's expected).

- [ ] **Step 3: Change `install.sh`**

After the option loop, add:

```sh
VERSION="${VERSION#v}"
```

Replace the uninstall block with:

```sh
if [ "$UNINSTALL" = 1 ]; then
  if [ ! -e "$TARGET" ] && { [ -z "$COMMAND_FILE" ] || [ ! -e "$COMMAND_FILE" ]; }; then
    say "Motif isn't installed in $SKILLS, so there was nothing to remove."
    exit 0
  fi
  rm -rf "$TARGET"
  if [ -n "$COMMAND_FILE" ]; then rm -f "$COMMAND_FILE"; fi
  say "removed Motif from $SKILLS."
  exit 0
fi
```

At the end, after the "start it" line:

```sh
if [ "$AGENT" = opencode ] && is_motif "$HOME/.agents/skills/motif"; then
  say "OpenCode also reads ~/.agents/skills, which has an earlier Motif. To remove that one: curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | sh -s -- --agent agents --uninstall"
fi
```

- [ ] **Step 4: Change `install.ps1`** (Edit tool)

At the top of `Invoke-MotifInstall`, after `$ProgressPreference = …`:

```powershell
  if ($Version) { $Version = $Version -replace '^v', '' }
```

At the start of the `if ($Uninstall) {` block:

```powershell
    if (-not (Test-Path -LiteralPath $Target) -and -not ($CommandFile -and (Test-Path -LiteralPath $CommandFile))) {
      Say "Motif isn't installed in $Skills, so there was nothing to remove."
      return 0
    }
```

Before the final `return 0`:

```powershell
  $Shared = Join-Path (Join-Path (Join-Path $UserHome '.agents') 'skills') 'motif'
  if ($Agent -eq 'opencode' -and (Test-Motif $Shared)) {
    Say "OpenCode also reads ~/.agents/skills, which has an earlier Motif. To remove that one: & ([scriptblock]::Create((irm https://raw.githubusercontent.com/$Repo/main/install.ps1))) -Agent agents -Uninstall"
  }
```

- [ ] **Step 5: Run the tests**

Run: `cd cli && bun test test/install-script.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add install.sh install.ps1 cli/test/install-script.test.ts
git commit -m "fix(install): a leading v in --version, a plain message when there's nothing to remove, and the second copy OpenCode would load" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Docs and CI — the other 3A deferred minors, and the spec

**Files:**
- Modify: `skill/SKILL.md` (`$motif` in the routing row), `cli/test/skill-modes.test.ts`
- Modify: `plugin/agents/README.md` (where the build writes the tool), `cli/test/agents-package.test.ts`
- Modify: `.github/workflows/release.yml` (a `plugins-branch` job; timeouts), `.github/workflows/agents.yml` (timeout), `cli/test/release.test.ts`
- Modify: `docs/specs/2026-10-17-motif-part3-agents-design.md` (§3, §7.2, appendix)

- [ ] **Step 1: Write the failing tests**

`cli/test/skill-modes.test.ts`: change the 3A routing assertion to

```ts
    expect(skill).toContain("| types /design, /motif or $motif with nothing else, or asks for design help without saying what | [modes/design.md](modes/design.md) |");
```

`cli/test/agents-package.test.ts`, in the Develop guide test, add `"at the repository's root"` to its list.

`cli/test/release.test.ts`, inside `describe("the release workflow", …)`:
- In "publishes the skill archives with the release, and the plugins branch only from its own artifact", replace the body with:

```ts
    const publish = section("publish");
    expect(publish).toContain("pattern: motif-*");
    expect(publish).not.toContain("plugins-tree");
    const branch = section("plugins-branch");
    for (const s of [
      "needs: publish", "name: plugins-tree", 'tar -xzf plugins-tree/plugins-tree.tar.gz -C "$dir"',
      'commit -q -m "Motif $GITHUB_REF_NAME"', 'git -C "$dir" push origin "HEAD:refs/heads/plugins"', '"refs/tags/plugins-$GITHUB_REF_NAME"',
    ]) expect(branch).toContain(s);
```

- In "moves the plugins branch only for a release without a suffix", use `section("plugins-branch")` instead of `section("publish")`.
- In "gives each job only the access it needs", add:

```ts
    expect(section("plugins-branch")).toContain("permissions:\n      contents: write");
    expect(wf.split("contents: write").length - 1).toBe(2);
```

- Append:

```ts
  test("a failed plugins-branch push doesn't skip the Claude Code check, and the agents check waits for the branch (3A review)", () => {
    expect(section("check")).toContain("needs: publish");
    expect(section("agents")).toContain("needs: plugins-branch");
  });

  test("the agents checks can't hold a runner for hours (3A review)", () => {
    expect(section("agents")).toContain("timeout-minutes: 30");
    expect(readFileSync(join(REPO, ".github/workflows/agents.yml"), "utf8")).toContain("timeout-minutes: 30");
  });
```

Add a spec test to `cli/test/agents-package.test.ts`'s docs block:

```ts
  test("the Part 3 spec matches what was built: no /motif command file, no skills field, Codex and VS Code settings edited directly", () => {
    const spec = read("docs/specs/2026-10-17-motif-part3-agents-design.md");
    expect(spec).not.toContain("├── commands/motif.toml");
    expect(spec).not.toContain('`skills: "./skills/"`');
    expect(spec).toContain("for a URL it starts a sign-in and waits");
    expect(spec).toContain("which doubles its quotes");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd cli && bun test test/skill-modes.test.ts test/agents-package.test.ts test/release.test.ts`
Expected: FAIL on each changed assertion.

- [ ] **Step 3: Make the changes**

1. `skill/SKILL.md` routing row: `| types /design, /motif or $motif with nothing else, or asks for design help without saying what | [modes/design.md](modes/design.md) |`.
2. `plugin/agents/README.md`: replace "Point the skill at a local build of the tool first: in `cli`, `bun run build`, then set `MOTIF_BIN` to `dist/motif` (`dist\motif.exe` on Windows) in the terminal you start the agent from." with "Point the skill at a local build of the tool first: in `cli`, run `bun run build`, which writes `dist/motif` (`dist\motif.exe` on Windows) at the repository's root, then set `MOTIF_BIN` to that file in the terminal you start the agent from." (Edit tool: it has a backslash.)
3. `.github/workflows/release.yml`: remove the `plugins-tree` download step and the "Update the plugins branch…" step from `publish`, and add a job after `publish`:

```yaml
  plugins-branch:
    needs: publish
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: plugins-tree
          path: plugins-tree
      - name: Update the plugins branch, which every agent but Claude Code installs from
        shell: bash
        run: |
          case "$GITHUB_REF_NAME" in *-*) echo "A pre-release: the plugins branch stays as it is."; exit 0 ;; esac
          dir="$RUNNER_TEMP/plugins"
          if git ls-remote --exit-code --heads origin plugins >/dev/null; then
            git fetch --depth 1 origin plugins
            git worktree add --detach "$dir" FETCH_HEAD
          else
            git worktree add --detach "$dir"
            git -C "$dir" checkout -q --orphan plugins
          fi
          git -C "$dir" rm -rqf --ignore-unmatch .
          tar -xzf plugins-tree/plugins-tree.tar.gz -C "$dir"
          git -C "$dir" add -A
          git -C "$dir" -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit -q -m "Motif $GITHUB_REF_NAME"
          git -C "$dir" push origin "HEAD:refs/heads/plugins"
          git -C "$dir" tag "plugins-$GITHUB_REF_NAME"
          git -C "$dir" push origin "refs/tags/plugins-$GITHUB_REF_NAME"
```

(This is the script that was in `publish`, moved as it is; the `checkout` here keeps its default token, which the push needs, and only this job and `publish` get `contents: write`.)

   In the `agents` job, change `needs: publish` to `needs: plugins-branch` and add `timeout-minutes: 30` under `runs-on`. In `.github/workflows/agents.yml`, add `timeout-minutes: 30` under the `install` job's `runs-on`.
4. `docs/specs/2026-10-17-motif-part3-agents-design.md` (Edit tool):
   - §3 tree: delete the line `├── commands/motif.toml        Gemini: /motif`, and after the `commands/motif/` line add `├── .agents/plugins/, .cursor-plugin/, .github/plugin/   each agent's marketplace, pointing at this package itself`.
   - §3 `plugin.json` bullet: replace "`keywords`, and `skills: "./skills/"`." with "and `keywords`; Agent Plugins finds `skills/` without it being named."
   - §3 Gemini commands bullet: append "Gemini makes the `motif` skill itself `/motif`, so there's no `/motif` command file."
   - §7.2 Codex row: replace its "How" cell with "A `[mcp_servers.<name>]` table with `url` (and `http_headers` for a key) added to `config.toml`: `codex mcp add` can't set headers, and for a URL it starts a sign-in and waits for a browser".
   - §7.2 VS Code row: replace "`code --add-mcp '<json>'`" with "`servers.<name>` (`type`, `url`, `headers`) added to its user `mcp.json`: `code --add-mcp` would pass the JSON through cmd.exe on Windows, which doubles its quotes".
   - Appendix, Cursor's Agent Skills cell: replace "`.agents/skills`, `.cursor/skills`, `~/.cursor/skills`; also reads `.claude/skills`" with "`.agents/skills`, `.cursor/skills`, `~/.agents/skills`, `~/.cursor/skills`; also reads `.claude/skills`".

- [ ] **Step 4: Run the tests**

Run: `cd cli && bun test test/skill-modes.test.ts test/skill-content.test.ts test/agents-package.test.ts test/release.test.ts && bun -e 'const y = Bun.YAML.parse(await Bun.file("../.github/workflows/release.yml").text()); console.log(Object.keys(y.jobs).join(" "), "|", y.jobs.agents.needs)'`
Expected: PASS; `build plugin publish plugins-branch check agents | plugins-branch`.

- [ ] **Step 5: Commit**

```bash
git add skill/SKILL.md plugin/agents/README.md .github/workflows/release.yml .github/workflows/agents.yml docs/specs/2026-10-17-motif-part3-agents-design.md cli/test/skill-modes.test.ts cli/test/agents-package.test.ts cli/test/release.test.ts
git commit -m "fix(release): the plugins branch in its own job, timeouts on the agent checks; docs match what was built" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: v0.2.0 — notes, version, README and core spec

**Files:**
- Modify: `skill/VERSION` (`0.2.0`)
- Create: `docs/releases/v0.2.0.md`
- Modify: `README.md` (preview line, `motif connect` row)
- Modify: `docs/specs/2026-10-12-motif-core-design.md` (§10.2 `connect` row)
- Test: `cli/test/release.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `describe("the release notes", …)` in `cli/test/release.test.ts`:

```ts
  test("say how to install Motif in every agent, and name the skill archives (Part 3)", () => {
    const notes = readFileSync(NOTES, "utf8");
    for (const s of [
      "codex plugin marketplace add 7mxd/motif", "codex plugin add motif@motif", "copilot plugin marketplace add 7mxd/motif", "copilot plugin install motif@motif",
      "gemini extensions install https://github.com/7mxd/motif --ref plugins --auto-update", "cursor-agent plugin marketplace add https://github.com/7mxd/motif",
      "install.sh", "install.ps1", "motif-skill.zip", "motif-skill.tar.gz", "motif connect",
    ]) expect(notes).toContain(s);
  });
```

and to `describe("the READMEs", …)`:

```ts
  test("the README's motif connect row says it sets sources up in the agents you choose (Part 3)", () => {
    expect(readFileSync(join(REPO, "README.md"), "utf8")).toContain("to the coding agents you choose");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd cli && bun test test/release.test.ts`
Expected: FAIL — the notes for 0.1.0 have no other agents; the README row says "to Claude Code".

- [ ] **Step 3: Bump the version and write the notes**

`skill/VERSION`: `0.2.0` (one line). `docs/releases/v0.2.0.md`:

````markdown
# Motif v0.2.0 (preview)

Motif now works in **Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode**, as well as Claude Code, for **React web** apps and **plain web** sites (HTML, CSS and JavaScript without a framework).

Motif keeps your app's design in a guide your agent follows, `DESIGN.md` and `design/tokens.json`. It shows mockups before code, screenshots your real app after, checks your code against the guide, and reviews the result in plain words.

## Install

**Claude Code**

```
/plugin marketplace add 7mxd/motif
/plugin install motif@motif
```

**Codex**

```
codex plugin marketplace add 7mxd/motif
codex plugin add motif@motif
```

**GitHub Copilot CLI**

```
copilot plugin marketplace add 7mxd/motif
copilot plugin install motif@motif
```

In VS Code, run "Chat: Install Plugin From Source" and enter `7mxd/motif`.

**Cursor:** add the plugin marketplace `7mxd/motif` in Cursor's plugin settings, or in the CLI run `cursor-agent plugin marketplace add https://github.com/7mxd/motif`.

**Gemini CLI**

```
gemini extensions install https://github.com/7mxd/motif --ref plugins --auto-update
```

**OpenCode, or any agent that reads `~/.agents/skills`**

- macOS and Linux: `curl -fsSL https://raw.githubusercontent.com/7mxd/motif/main/install.sh | sh`
- Windows PowerShell: `irm https://raw.githubusercontent.com/7mxd/motif/main/install.ps1 | iex`

The install script downloads the skill from this release, checks it against `SHA256SUMS` and puts it where OpenCode (or the shared `~/.agents/skills`) reads it. To read it first, download `install.sh` or `install.ps1` from the repository and run it from there.

Then start Motif: `/motif:design` in Claude Code, `$motif` in Codex, `/motif` everywhere else.

You need git, and Claude Code 2.1.224 or later if you use Claude Code. The first time Motif runs, it downloads its tool (about 100 MB) from this release and checks it against `SHA256SUMS`. Screenshots and previews use the Chrome or Edge you have; if you have neither, Motif asks before downloading a private browser (about 120 MB to download, about 300 MB on disk).

Motif runs on your computer. Previews and screenshots stay there, nothing is uploaded, and there's no telemetry.

## What's new

- Packages for Codex, Cursor, GitHub Copilot (CLI and VS Code), Gemini CLI and OpenCode. Each agent but Claude Code installs from the `plugins` branch, which every release rebuilds (tagged `plugins-v0.2.0`).
- `/motif` starts Motif in those agents; Gemini CLI also has `/motif:design`, `/motif:init`, `/motif:feature` and `/motif:review`.
- `motif connect` sets a design source (Motion, Refero, 21st.dev, 60fps.design) up in each agent you pick, with any key typed only in your own terminal; `motif doctor` shows which agents have each source.
- Every release checks that each agent installs Motif, on Windows, macOS and Linux.

## Known limits

- React web and plain web only. Vue, Svelte, Angular, React Native, Flutter, SwiftUI and Jetpack Compose come later.
- Cursor's plugin install is checked by hand, not by the release checks: its CLI adds the marketplace, and installing the plugin happens in Cursor.
- Codex asks multiple-choice questions only in Plan mode; elsewhere Motif asks in a numbered list.
- The tool binaries aren't code-signed. The plugin downloads and checks them, so they run without a warning; a binary you download by hand may get one from macOS or Windows.
- Windows on ARM runs the x64 tool.

## Files

| File | What it is |
|---|---|
| `motif-claude-code.zip` | The Claude Code plugin, installed through the marketplace |
| `motif-skill.zip`, `motif-skill.tar.gz` | The skill alone, which `install.ps1` and `install.sh` download |
| `motif-windows-x64.exe`, `motif-darwin-arm64`, `motif-darwin-x64`, `motif-linux-x64`, `motif-linux-arm64` | The `motif` tool, downloaded by the skill when it's first needed |
| `SHA256SUMS` | Checksums of all of the above |
| `THIRD-PARTY-NOTICES.txt` | The licences of the other works Motif ships |
````

(It keeps every string the existing notes test checks, such as "/plugin marketplace add 7mxd/motif", "Claude Code 2.1.224", "## Known limits" and "aren't code-signed".)

- [ ] **Step 4: README and core spec**

`README.md`:
- Preview line: `> **Preview (v0.2.0).** Motif works in Claude Code today, for React web apps and plain web sites. Packages for Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode come with this release; more stacks and the first full release come next.`
- `motif connect` row: `| \`motif connect\` | Connects optional design sources (Motion, Refero, 21st.dev, 60fps.design) to the coding agents you choose, for all your projects; keys are typed only in your own terminal |`

(The README's install section changes at approval C, after the release checks pass.)

`docs/specs/2026-10-12-motif-core-design.md` §10.2 `connect` row: replace "(Part 1: Claude Code via `claude mcp add`; others in Part 3)" with "(Claude Code, Codex, Cursor, GitHub Copilot CLI, VS Code, Gemini CLI and OpenCode: [Part 3 spec §7](2026-10-17-motif-part3-agents-design.md))".

- [ ] **Step 5: Run the tests, then the whole suite**

Run: `cd cli && bun test test/release.test.ts test/plugin.test.ts` — Expected: PASS.
Run: `cd cli && bun run typecheck && bun test --timeout 300000 > ../.superpowers/3b-suite.log 2>&1; echo "exit $?"; tail -6 ../.superpowers/3b-suite.log`
Expected: `exit 0`, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add skill/VERSION docs/releases/v0.2.0.md README.md docs/specs/2026-10-12-motif-core-design.md cli/test/release.test.ts
git commit -m "release: v0.2.0 notes and version — Motif in every agent" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## After this plan

The approval points, as for v0.1.0:

- **A:** merge to `main`, push (the `ci` and `agents` workflows run; the first real Cursor check and the GitHub install forms are proved here only for the local build), and run the release workflow as a dry run.
- **B:** tag `v0.2.0`; the release publishes, the `plugins-branch` job creates the branch, and the post-release checks install Motif from GitHub in every agent on three systems. If a check shows an agent needs the `#plugins` form, its install command changes at C (and the published notes are edited with `gh release edit`).
- **C:** Claude Code's marketplace (`bun scripts/marketplace.ts v0.2.0`), the README's install section with every agent's commands (and a test that they match `agent-checks.ts`), then a real install here in Claude Code. Then the hands-on test in Cursor, Gemini CLI and Copilot, and the evals.
