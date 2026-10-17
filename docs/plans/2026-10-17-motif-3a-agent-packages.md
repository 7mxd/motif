# Motif 3A — Packages for other agents: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the package Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode install Motif from, the marketplace files and install scripts that reach it, and the release and CI steps that publish and check it.

**Architecture:** `bun run packages` turns `skill/` into `dist/agents/` (the skill as `skills/motif/`, an Agent Plugins `plugin.json`, a Gemini CLI extension with `/motif` commands) and `dist/agents-local/` (a local marketplace for checks). The release workflow commits `dist/agents/` to a `plugins` branch; marketplace files on `main` point each agent there; `install.sh` / `install.ps1` install the skill for OpenCode and any agent reading `~/.agents/skills` from new `motif-skill.*` release assets. `cli/scripts/agent-checks.ts` installs Motif in each agent without signing in, on every push (Linux) and after each release (three systems).

**Tech Stack:** Bun 1.4.3 + TypeScript, fflate (zip, gzip), Bun's built-in TOML parser, POSIX sh, Windows PowerShell 5.1, GitHub Actions.

**Spec:** `docs/specs/2026-10-17-motif-part3-agents-design.md` (Part 3; this plan covers §3–§6, §8, §9.1–§9.2, §10 except release notes, and §12's first-task checks. `motif connect` and `doctor` (§7), the source notes, `agents.md`'s sign-in table, the release notes and the version bump are plan 3B.)

## Global Constraints

- Bun 1.4.3 (`export PATH="$HOME/.bun/bin:$PATH"` in Git Bash); run tests from `cli/` with `bun test --timeout 300000`; typecheck with `bun run typecheck`.
- No new dependencies: zip and gzip with `fflate`, TOML with `Bun.TOML.parse`, JSON with `jsonc-parser` where comments may appear.
- Everything in `skill/` stays agent-neutral; `skill/agents.md` is the only file there that names an agent's tools (spec §5).
- Install scripts download only from `github.com` and `raw.githubusercontent.com`, check every download against the release's `SHA256SUMS`, send nothing anywhere, need no admin rights, and replace or remove only Motif's own files (spec §6).
- Messages people read are plain words, prefixed `Motif:` in scripts, as the bootstrap does; exit codes 0 = done, 2 = couldn't (with the reason).
- Every manifest carries `skill/VERSION` (spec §3).
- Nothing is pushed, tagged or published in this plan; agent CLIs are downloaded only after asking (Task 1). Approval points A/B/C come after plan 3B.
- Commits: `git -c user.name=7mxd -c user.email=7895735+7mxd@users.noreply.github.com commit …`, message ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Commit only after the step's tests pass (gate on the exit code, never on grepped output).
- Write files containing backslashes with the Write/Edit tools, never a shell heredoc (heredocs collapse `\\`).

## Review Focus

1. **A home folder with a space in its path** (`C:\Users\Ahmed Ali`, `/home/a b`): the install scripts quote every path and install correctly → tests in Tasks 6 and 7.
2. **`install.ps1` run as `irm … | iex`**: there is no `$PSScriptRoot` and no parameters, and an `exit` would close the developer's PowerShell window → the script finishes without `exit` and installs with defaults → test in Task 7.
3. **A pre-release tag (`v1.0.0-rc.1`)** must not move the `plugins` branch that every install follows → the publish step's guard, run with `sh` in a test, Task 9.
4. **A Windows checkout (CRLF)** building the package: Gemini's TOML commands and the branch README must come out with LF → test in Task 3.
5. **A fresh computer** with no `~/.agents` folder and no OpenCode config: the script creates the folders and installs → test in Task 6.

---

### Task 1: Check what the agents actually do

The spec's §12 lists what the docs don't settle. Settle it before building on it, and record the answers.

**Files:**
- Create: `docs/plans/notes/2026-10-17-3a-agent-facts.md`

**Interfaces:**
- Produces: the facts file. Later tasks use the formats in this plan unless the facts file says otherwise; each difference is a ledger `Ruling:` in the task that applies it.

- [ ] **Step 1: Ask the developer before downloading anything**

Ask with the question prompt (one question):

> "Task 1 checks how Codex, Copilot, Gemini CLI and OpenCode install plugins. It downloads their CLIs (npm packages, about 400 MB) into a scratch folder and runs them with a throwaway home: nothing is installed system-wide and nothing signs in. Cursor's CLI installer changes your user PATH on Windows, so Cursor is checked in CI instead. Go ahead?"
> - "Yes, in a scratch folder (Recommended)"
> - "Skip; check everything in CI later"

If skipped, write the facts file with every item marked "unverified (CI checks it in Task 8)" and go to Step 6.

- [ ] **Step 2: Install the four CLIs into the scratch folder**

```bash
S="<scratchpad>/agents-spike"   # the session scratchpad directory
mkdir -p "$S" && cd "$S"
npm install --prefix "$S/cli" @openai/codex@0.163.0 @github/copilot@1.0.98 @google/gemini-cli@0.64.0 opencode-ai@1.19.3
ls "$S/cli/node_modules/.bin"
```
Expected: `codex`, `copilot`, `gemini`, `opencode` in `.bin`. If a pinned version no longer exists, install the latest and record the version.

- [ ] **Step 3: Make a candidate package and a local marketplace by hand**

Use exactly the manifests and marketplace entries Tasks 3 and 4 will generate (copy their JSON/TOML from this plan):

```bash
mkdir -p "$S/pkg/skills" "$S/pkg/commands/motif"
cp -R "<repo>/skill" "$S/pkg/skills/motif"
# plugin.json: Task 3's agentPluginManifest("0.1.0"); gemini-extension.json: Task 3's geminiManifest("0.1.0");
# commands/motif.toml and commands/motif/feature.toml: Task 3, Step 3.
mkdir -p "$S/mkt" && cp -R "$S/pkg" "$S/mkt/motif"
# $S/mkt/.agents/plugins/marketplace.json, $S/mkt/.github/plugin/marketplace.json, $S/mkt/.cursor-plugin/marketplace.json:
# Task 4's agentMarketplaces({ local: "./motif" }).
# $S/mkt/.claude-plugin/marketplace.json: a decoy listing a plugin named "decoy" from "./motif", to see which file each agent reads.
```

Also make a git repo with a `plugins` branch, to check installs from a branch:

```bash
git init -q "$S/remote" && cd "$S/remote"
git checkout -q --orphan plugins && cp -R "$S/pkg/." . && git add -A && git -c user.name=t -c user.email=t@t commit -qm pkg
git checkout -q --orphan main && git rm -rqf . && cp -R "$S/mkt/.agents" "$S/mkt/.github" "$S/mkt/.cursor-plugin" .
# In these copies, replace each source with Task 4's branch form, using "file://$S/remote" (or its .git) as the URL and "plugins" as the ref.
git add -A && git -c user.name=t -c user.email=t@t commit -qm mkt
```

- [ ] **Step 4: Run each agent with a throwaway home and record what happens**

For each, set `H="$S/home-<agent>"`, `mkdir -p "$H"`, and run with `HOME="$H" USERPROFILE="$H"` plus the variable shown. Record each command's output.

```bash
B="$S/cli/node_modules/.bin"
# Codex
mkdir -p "$H/.codex"
HOME="$H" USERPROFILE="$H" CODEX_HOME="$H/.codex" "$B/codex" plugin --help
HOME="$H" USERPROFILE="$H" CODEX_HOME="$H/.codex" "$B/codex" plugin marketplace add "$S/mkt"
HOME="$H" USERPROFILE="$H" CODEX_HOME="$H/.codex" "$B/codex" plugin add motif@motif
HOME="$H" USERPROFILE="$H" CODEX_HOME="$H/.codex" "$B/codex" plugin list
find "$H" -path '*skills/motif/SKILL.md'
# then the same with a fresh $H against "$S/remote" (branch install)

# Copilot CLI
HOME="$H" USERPROFILE="$H" COPILOT_HOME="$H/.copilot" "$B/copilot" plugin marketplace add "$S/mkt"
HOME="$H" USERPROFILE="$H" COPILOT_HOME="$H/.copilot" "$B/copilot" plugin install motif@motif
HOME="$H" USERPROFILE="$H" COPILOT_HOME="$H/.copilot" "$B/copilot" plugin list
HOME="$H" USERPROFILE="$H" COPILOT_HOME="$H/.copilot" "$B/copilot" skill list
find "$H" -path '*skills/motif/SKILL.md'

# Gemini CLI
HOME="$H" USERPROFILE="$H" GEMINI_CLI_HOME="$H" "$B/gemini" extensions validate "$S/pkg"
HOME="$H" USERPROFILE="$H" GEMINI_CLI_HOME="$H" "$B/gemini" extensions install "$S/pkg" --consent --skip-settings
HOME="$H" USERPROFILE="$H" GEMINI_CLI_HOME="$H" "$B/gemini" extensions list -o json
HOME="$H" USERPROFILE="$H" GEMINI_CLI_HOME="$H" "$B/gemini" skills list
find "$H" -path '*skills/motif/SKILL.md'
# then a branch install from "$S/remote" with --ref plugins

# OpenCode
HOME="$H" USERPROFILE="$H" XDG_CONFIG_HOME="$H/.config" XDG_DATA_HOME="$H/.local/share" XDG_CACHE_HOME="$H/.cache" OPENCODE_DISABLE_CLAUDE_CODE=1 "$B/opencode" debug paths
mkdir -p "$H/.config/opencode/skills" && cp -R "$S/pkg/skills/motif" "$H/.config/opencode/skills/"
HOME="$H" USERPROFILE="$H" XDG_CONFIG_HOME="$H/.config" XDG_DATA_HOME="$H/.local/share" XDG_CACHE_HOME="$H/.cache" OPENCODE_DISABLE_CLAUDE_CODE=1 "$B/opencode" debug skill
# Also: without XDG_CONFIG_HOME set, which folder does it use on Windows? (debug paths with only HOME/USERPROFILE set)
```

Expected per agent, to confirm or correct:
- Codex reads `.agents/plugins/marketplace.json` (motif listed, not "decoy"); `codex plugin add` exists; a branch (`ref`) source installs; skill lands in `~/.codex/plugins/cache/motif/motif/<version>/skills/motif`.
- Copilot reads `.github/plugin/marketplace.json`; `install motif@motif` works; `github`/`url` source with `ref` installs from a branch; skill lands in `~/.copilot/installed-plugins/motif/motif/skills/motif`.
- Gemini validates and installs the package; `skills list` shows `motif`; `--ref plugins` installs from the branch; the extension lands in `~/.gemini/extensions/motif`. Command names: check the CLI's source for how extension commands are named (`packages/cli/src/services/FileCommandLoader.ts` or similar in `node_modules/@google/gemini-cli`), and whether a colon or a dot is used.
- OpenCode lists `motif` from `<config>/skills/motif`; record the config folder on Windows when `XDG_CONFIG_HOME` isn't set.
- Agent Plugins `plugin.json`: accepted by Codex and Copilot with no vendor manifest? If one rejects it, note which vendor manifest it needs.

- [ ] **Step 5: Write the facts file**

`docs/plans/notes/2026-10-17-3a-agent-facts.md`: one section per agent with the versions run, the exact commands that worked, the paths where the skill landed (for `skill/agents.md`), which marketplace file it read, whether a branch install worked, and anything that differs from this plan. End with a list "Changes to the plan" (each becomes a `Ruling:` where it's applied). Cursor: "checked in CI (Task 8)".

- [ ] **Step 6: Commit**

```bash
git add docs/plans/notes/2026-10-17-3a-agent-facts.md
git commit -m "docs(plan): what the agents do, checked before 3A builds on it" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `/motif` and `skill/agents.md`

**Files:**
- Create: `skill/agents.md`
- Modify: `skill/SKILL.md` (routing row, "Running the motif tool", rule 3, "What's in the skill folder")
- Modify: `cli/test/skill-lint.ts` (tool names only in `agents.md`)
- Test: `cli/test/skill-modes.test.ts`, `cli/test/skill-content.test.ts`

**Interfaces:**
- Consumes: Task 1's facts (install paths).
- Produces: `skill/agents.md` (3B adds its sign-in section); the lint constant `AGENT_NOTES = "agents.md"`.

- [ ] **Step 1: Write the failing tests**

Append to `cli/test/skill-modes.test.ts`:

```ts
describe("Motif in every agent (Part 3)", () => {
  const skill = read("SKILL.md");
  const agents = read("agents.md");

  test("a bare /motif starts the design mode, as /design does", () => {
    expect(skill).toContain("| types /design or /motif with nothing else, or asks for design help without saying what | [modes/design.md](modes/design.md) |");
  });

  test("SKILL.md sends agents to agents.md for the skill folder and the question prompt", () => {
    expect(outOfOrder(skill, ["## Running the motif tool", "(agents.md)", "3. **Ask with choices.**", "(agents.md)", "## What's in the skill folder", "(agents.md)"])).toBeNull();
  });

  test("agents.md covers every agent: the skill folder, the question prompt and the shell", () => {
    for (const a of ["Claude Code", "Codex", "Cursor", "GitHub Copilot", "VS Code", "Gemini CLI", "OpenCode", "Any other agent"]) expect(agents).toContain(a);
    for (const s of ["skills/motif", "~/.agents/skills/motif", "request_user_input", "Plan mode", "ask_user", "numbered list", "PowerShell", "motif.cmd"]) {
      expect(agents).toContain(s);
    }
  });
});
```

Append inside `describe("the lint rules", …)` in `cli/test/skill-content.test.ts`:

```ts
  test("agent tool names appear only in agents.md (Part 3)", () => {
    expect(lint("modes/feature.md", "Ask with ask_user.\n")).toEqual(["modes/feature.md uses a specific agent's tool name."]);
    expect(lint("modes/feature.md", "Use request_user_input.\n")).toEqual(["modes/feature.md uses a specific agent's tool name."]);
    expect(lint("modes/feature.md", "Use AskQuestion or askQuestions.\n")).toEqual(["modes/feature.md uses a specific agent's tool name."]);
    expect(lint("agents.md", "| Codex | request_user_input | AskUserQuestion | ask_user |\n")).toEqual([]);
    expect(lint("agents.md", "Use $ARGUMENTS.\n")).toEqual(["agents.md uses an agent-specific variable."]);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd cli && bun test test/skill-modes.test.ts test/skill-content.test.ts`
Expected: FAIL — `agents.md` doesn't exist (ENOENT), the routing row is missing, and the lint passes `ask_user` in `modes/feature.md`.

- [ ] **Step 3: Teach the lint**

In `cli/test/skill-lint.ts`, replace the `NOT_PORTABLE` constant and its loop:

```ts
/** The one file in skill/ that may name agents' tools: per-agent notes (spec §5, core spec §5.5). */
export const AGENT_NOTES = "agents.md";

const NOT_PORTABLE: [RegExp, string, "tool" | "other"][] = [
  [/\b(?:AskUserQuestion|TodoWrite|SlashCommand|WebFetch|WebSearch|request_user_input|ask_user|AskQuestion|askQuestions)\b/, "a specific agent's tool name", "tool"],
  [/\b(?:Bash|Read|Write|Edit|Glob|Grep|Task|Skill) tool\b/, "a specific agent's tool name", "tool"],
  [/\bmcp__\w+/, "an agent-specific MCP tool name (name tools by their own names, e.g. refero_get_style)", "other"],
  [/\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\}/, "an agent-specific variable", "other"],
];
```

and in `lintSkillMarkdown`:

```ts
  for (const [pattern, what, kind] of NOT_PORTABLE) {
    if (kind === "tool" && file === AGENT_NOTES) continue;
    if (pattern.test(text)) problems.push(`${file} uses ${what}.`);
  }
```

(The existing test "agent-specific names, settings and variables are not portable" still passes: its messages are unchanged.)

- [ ] **Step 4: Write `skill/agents.md`**

Use the paths from the facts file where they differ from these.

```markdown
# Motif in each agent

Motif's files are the same in every agent. This page lists what differs: where the skill folder is, how to ask the developer a question, and which shell runs commands. Use your own agent's row.

## Where the skill folder is

You run the motif tool from the skill folder (`<skill folder>/bin/motif`, as [SKILL.md](SKILL.md) shows). Most agents tell you the folder when the skill loads. If yours doesn't, look for `skills/motif/SKILL.md` here (`~` is the developer's home folder, `C:\Users\<name>` on Windows):

| Agent | Installed through | Skill folder |
|---|---|---|
| Claude Code | its plugin marketplace | `~/.claude/plugins/cache/motif/motif/<version>/skills/motif` |
| Codex | its plugin marketplace | `~/.codex/plugins/cache/motif/motif/<version>/skills/motif` |
| Cursor | its plugin marketplace | a `skills/motif` folder under `~/.cursor/plugins/` |
| GitHub Copilot CLI | its plugin marketplace | `~/.copilot/installed-plugins/motif/motif/skills/motif` |
| VS Code (Copilot) | its agent plugins | the Copilot CLI folder above, or a `skills/motif` folder under VS Code's agent plugins folder |
| Gemini CLI | an extension | `~/.gemini/extensions/motif/skills/motif` |
| OpenCode | Motif's install script | `~/.config/opencode/skills/motif` |
| Any other agent | Motif's install script | `~/.agents/skills/motif` |

If several versions are there, use the newest.

## Asking the developer

Rule 3 in [SKILL.md](SKILL.md) asks with your agent's question prompt when it has one, and in a numbered list at the end of your message when it doesn't:

| Agent | Question prompt |
|---|---|
| Claude Code | AskUserQuestion |
| Codex | request_user_input, only in Plan mode; otherwise use the numbered list |
| Cursor | its ask-questions tool (AskQuestion), when your model has it; otherwise the numbered list |
| GitHub Copilot CLI | ask_user |
| VS Code (Copilot) | askQuestions |
| Gemini CLI | ask_user |
| OpenCode | question |
| Any other agent | its own, if it has one; otherwise the numbered list |

## Which shell runs commands

On Windows, Codex, Cursor, GitHub Copilot and Gemini CLI run commands in PowerShell, so use the PowerShell row of SKILL.md's table (`motif.cmd`). OpenCode uses PowerShell when it's installed, and Git Bash or Command Prompt otherwise: match the row to the shell you're in. On macOS and Linux, every agent uses `sh`.
```

- [ ] **Step 5: Edit `skill/SKILL.md`**

Replace the routing row

```
| types /design, or asks for design help without saying what | [modes/design.md](modes/design.md) |
```
with
```
| types /design or /motif with nothing else, or asks for design help without saying what | [modes/design.md](modes/design.md) |
```

After "Wherever Motif's files say `motif <command>`, run it this way." add:

```
If your agent didn't tell you where the skill folder is, [agents.md](agents.md) lists where each agent installs it.
```

In rule 3, replace "When your agent has its own question prompt (the developer answers by picking an option), ask with it," with:

```
When your agent has its own question prompt (the developer answers by picking an option; [agents.md](agents.md) names each agent's), ask with it,
```

At the end of "What's in the skill folder", add:

```
- [agents.md](agents.md): what differs between agents (where this folder is, the question prompt, the shell).
```

- [ ] **Step 6: Run the tests**

Run: `cd cli && bun test test/skill-modes.test.ts test/skill-content.test.ts test/plugin.test.ts`
Expected: PASS (the plugin build copies `skill/` whole, so its test sees `agents.md` too).

- [ ] **Step 7: Commit**

```bash
git add skill/agents.md skill/SKILL.md cli/test/skill-lint.ts cli/test/skill-modes.test.ts cli/test/skill-content.test.ts
git commit -m "feat(skill): /motif starts the design mode, and agents.md says what differs per agent" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The package (`dist/agents/`)

**Files:**
- Create: `cli/scripts/build-agents.ts`
- Create: `plugin/agents/commands/motif.toml`, `plugin/agents/commands/motif/design.toml`, `…/init.toml`, `…/feature.toml`, `…/review.toml`
- Create: `plugin/agents/branch-README.md`
- Modify: `cli/package.json` (script `packages`)
- Test: `cli/test/agents-package.test.ts`

**Interfaces:**
- Consumes: `pluginManifest(version)` from `cli/scripts/build-plugin.ts`.
- Produces:
  - `AGENT_PLUGIN_SCHEMA: string`
  - `agentPluginManifest(version: string): Record<string, unknown>`
  - `geminiManifest(version: string): Record<string, unknown>`
  - `buildAgents(outDir: string, repo?: string): void`
  - `isAgentsBuild(dir: string): boolean`

Ruling carried from the spec: `plugin.json` has no `skills` field. Agent Plugins discovers `skills/` by itself (Codex and Cursor docs), and Copilot's list of Agent Plugins fields doesn't include it.

- [ ] **Step 1: Write the failing test**

`cli/test/agents-package.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { AGENT_PLUGIN_SCHEMA, agentPluginManifest, buildAgents, geminiManifest } from "../scripts/build-agents";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO, "skill/VERSION"), "utf8").trim();
const MODES = ["design", "init", "feature", "review"];
const fresh = () => join(tempDir("motif-agents-"), "agents");

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, base) : [relative(base, path).replace(/\\/g, "/")];
  });
}

describe("the package for other agents", () => {
  const out = fresh();
  buildAgents(out);
  const read = (rel: string) => readFileSync(join(out, rel), "utf8");
  const files = walk(out);

  test("holds the whole skill as skills/motif, the two manifests and Gemini's commands, at the skill's version", () => {
    expect(walk(join(out, "skills/motif")).sort()).toEqual(walk(join(REPO, "skill")).sort());
    expect(readdirSync(join(out, "skills"))).toEqual(["motif"]);
    for (const f of ["plugin.json", "gemini-extension.json", "commands/motif.toml", ...MODES.map((m) => `commands/motif/${m}.toml`), "README.md", "LICENSE", "THIRD-PARTY-NOTICES.txt"]) {
      expect(files).toContain(f);
    }
    const plugin = JSON.parse(read("plugin.json"));
    expect(plugin).toEqual(agentPluginManifest(VERSION));
    expect(plugin.$schema).toBe(AGENT_PLUGIN_SCHEMA);
    expect([plugin.name, plugin.version]).toEqual(["motif", VERSION]);
    expect(JSON.parse(read("gemini-extension.json"))).toEqual(geminiManifest(VERSION));
    expect(geminiManifest(VERSION)).toMatchObject({ name: "motif", version: VERSION });
  });

  test("Gemini's commands parse, start the motif skill and follow the right mode", () => {
    const top = Bun.TOML.parse(read("commands/motif.toml")) as { description: string; prompt: string };
    expect(top.description).toContain("Motif");
    for (const s of ["motif skill", "{{args}}", "modes/design.md"]) expect(top.prompt).toContain(s);
    for (const mode of MODES) {
      const c = Bun.TOML.parse(read(`commands/motif/${mode}.toml`)) as { description: string; prompt: string };
      expect(c.description).toContain("Motif");
      for (const s of ["motif skill", "{{args}}", `modes/${mode}.md`]) expect(c.prompt).toContain(s);
    }
  });

  test("names no Claude Code placeholder anywhere", () => {
    const text = files.filter((f) => /\.(md|toml|json|txt)$/.test(f) || f === "LICENSE");
    expect(text.filter((f) => /\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\}/.test(read(f)))).toEqual([]);
  });

  test("its README says what the branch is, the version, and not to edit it", () => {
    const readme = read("README.md");
    for (const s of [`v${VERSION}`, "Don't edit", "https://github.com/7mxd/motif", "/motif"]) expect(readme).toContain(s);
  });

  test("a rebuild drops files that are no longer in skill/", () => {
    const dir = fresh();
    buildAgents(dir);
    writeFileSync(join(dir, "skills/motif/stale.md"), "old");
    buildAgents(dir);
    expect(existsSync(join(dir, "skills/motif/stale.md"))).toBe(false);
  });

  test("never replaces a folder that isn't a package build", () => {
    const dir = fresh();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "notes.txt"), "mine");
    expect(() => buildAgents(dir)).toThrow("isn't a Motif package build");
    expect(readFileSync(join(dir, "notes.txt"), "utf8")).toBe("mine");
  });

  test("a Windows checkout (CRLF) still gives Gemini's commands and the README Unix line endings (review focus)", () => {
    const repo = tempDir("motif-crlf-repo-");
    cpSync(join(REPO, "skill"), join(repo, "skill"), { recursive: true });
    cpSync(join(REPO, "plugin/agents"), join(repo, "plugin/agents"), { recursive: true });
    for (const f of ["LICENSE", "THIRD-PARTY-NOTICES.txt"]) cpSync(join(REPO, f), join(repo, f));
    for (const f of ["commands/motif.toml", ...MODES.map((m) => `commands/motif/${m}.toml`), "branch-README.md"]) {
      const p = join(repo, "plugin/agents", f);
      writeFileSync(p, readFileSync(p, "utf8").replace(/\r?\n/g, "\r\n"));
    }
    const dir = fresh();
    buildAgents(dir, repo);
    for (const f of ["commands/motif.toml", ...MODES.map((m) => `commands/motif/${m}.toml`), "README.md", "plugin.json", "gemini-extension.json"]) {
      expect(readFileSync(join(dir, f), "utf8").includes("\r") ? f : "LF").toBe("LF");
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd cli && bun test test/agents-package.test.ts`
Expected: FAIL — `Cannot find module '../scripts/build-agents'`.

- [ ] **Step 3: Write the command files and the branch README**

`plugin/agents/commands/motif.toml`:

```toml
description = "Motif: design and build your app's look from its design guide. Say what you'd like, or type /motif on its own to choose."
prompt = """
Use Motif: activate the motif skill and follow its SKILL.md.

What the developer asked for: {{args}}

If that's empty, they typed /motif on its own: follow modes/design.md in the skill's folder.
"""
```

`plugin/agents/commands/motif/design.toml`:

```toml
description = "Motif: start here. Asks whether you're starting a new app, adding a feature or improving your app's look."
prompt = """
Use Motif: activate the motif skill, read its SKILL.md, then follow modes/design.md in the skill's folder.

What the developer asked for: {{args}}
"""
```

`plugin/agents/commands/motif/init.toml`:

```toml
description = "Motif: start a new app with its own design guide, from a short brief."
prompt = """
Use Motif: activate the motif skill, read its SKILL.md, then follow modes/init.md in the skill's folder.

What the developer asked for: {{args}}
"""
```

`plugin/agents/commands/motif/feature.toml`:

```toml
description = "Motif: add a screen or flow that matches your app. Shows a mockup first, then compares the app with it."
prompt = """
Use Motif: activate the motif skill, read its SKILL.md, then follow modes/feature.md in the skill's folder.

What the developer asked for: {{args}}
"""
```

`plugin/agents/commands/motif/review.toml`:

```toml
description = "Motif: review and improve your app's look against its design guide."
prompt = """
Use Motif: activate the motif skill, read its SKILL.md, then follow modes/review.md in the skill's folder.

What the developer asked for: {{args}}
"""
```

`plugin/agents/branch-README.md` (`{version}` is filled in by the build):

```markdown
# Motif v{version}: the package for Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode

This branch is built from [Motif's main branch](https://github.com/7mxd/motif) at each release, here v{version}. Don't edit it: every release replaces its files.

- `skills/motif/` is the Motif skill. It fetches the motif tool from the matching release the first time it runs.
- `plugin.json` is the plugin manifest Codex, Cursor and GitHub Copilot read; `gemini-extension.json` and `commands/` make it a Gemini CLI extension with `/motif`.

Install Motif as [the README](https://github.com/7mxd/motif#install) says, then start it with `/motif` (`$motif` in Codex).
```

- [ ] **Step 4: Write the build**

`cli/scripts/build-agents.ts`:

```ts
// Builds the package every agent but Claude Code installs Motif from (the plugins branch): skill/ as skills/motif/,
// the Agent Plugins manifest Codex, Cursor and Copilot read, and a Gemini CLI extension with /motif commands.
// Run: bun run packages
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pluginManifest } from "./build-plugin";

const REPO = resolve(import.meta.dir, "../..");
export const AGENT_PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

const lf = (text: string) => text.replace(/\r\n/g, "\n");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** The Agent Plugins 1.0 manifest at the package's root; skills/ is found without being named. */
export function agentPluginManifest(version: string): Record<string, unknown> {
  const m = pluginManifest(version) as Record<string, unknown>;
  return {
    $schema: AGENT_PLUGIN_SCHEMA,
    name: m.name,
    version,
    description: m.description,
    author: m.author,
    homepage: m.homepage,
    repository: m.repository,
    license: m.license,
    keywords: m.keywords,
  };
}

/** Gemini CLI's extension manifest: no context file (nothing added to every session) and no MCP servers. */
export function geminiManifest(version: string): Record<string, unknown> {
  const m = pluginManifest(version) as Record<string, unknown>;
  return { name: m.name, version, description: m.description };
}

/** True for a folder an earlier build made. */
export function isAgentsBuild(dir: string): boolean {
  try {
    return JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8")).name === "motif" && existsSync(join(dir, "gemini-extension.json"));
  } catch {
    return false;
  }
}

/** Every file under dir, relative, with forward slashes. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path).map((f) => `${name}/${f}`) : [name];
  });
}

/** Replaces outDir with a fresh build; refuses a folder that has files and isn't an earlier build. */
export function buildAgents(outDir: string, repo: string = REPO): void {
  if (existsSync(outDir) && readdirSync(outDir).length > 0 && !isAgentsBuild(outDir)) {
    throw new Error(`${outDir} isn't a Motif package build, so it wasn't replaced.`);
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const version = readFileSync(join(repo, "skill", "VERSION"), "utf8").trim();
  cpSync(join(repo, "skill"), join(outDir, "skills", "motif"), { recursive: true });
  if (process.platform !== "win32") chmodSync(join(outDir, "skills", "motif", "bin", "motif"), 0o755);
  writeFileSync(join(outDir, "plugin.json"), json(agentPluginManifest(version)));
  writeFileSync(join(outDir, "gemini-extension.json"), json(geminiManifest(version)));
  const source = join(repo, "plugin", "agents");
  for (const rel of filesUnder(join(source, "commands"))) {
    const to = join(outDir, "commands", rel);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, lf(readFileSync(join(source, "commands", rel), "utf8")));
  }
  writeFileSync(join(outDir, "README.md"), lf(readFileSync(join(source, "branch-README.md"), "utf8")).replaceAll("{version}", version));
  for (const f of ["LICENSE", "THIRD-PARTY-NOTICES.txt"]) writeFileSync(join(outDir, f), lf(readFileSync(join(repo, f), "utf8")));
}

if (import.meta.main) {
  const out = resolve(process.argv[2] ?? join(REPO, "dist", "agents"));
  buildAgents(out);
  console.log(`Built the package for other agents in ${relative(process.cwd(), out) || out}`);
}
```

In `cli/package.json` scripts, after `"plugin:zip"`, add:

```json
    "packages": "bun scripts/build-agents.ts",
```

- [ ] **Step 5: Run the tests**

Run: `cd cli && bun test test/agents-package.test.ts && bun run typecheck && bun run packages`
Expected: PASS; typecheck clean; `Built the package for other agents in …dist/agents`.

- [ ] **Step 6: Commit**

```bash
git add cli/scripts/build-agents.ts cli/test/agents-package.test.ts cli/package.json plugin/agents
git commit -m "feat(packages): build the package other agents install Motif from" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Marketplace files, on `main` and local

**Files:**
- Modify: `cli/scripts/marketplace.ts` (agent marketplaces, `--agents`)
- Modify: `cli/scripts/build-agents.ts` (`buildAgentsLocal`; the CLI builds both)
- Create (generated, committed): `.agents/plugins/marketplace.json`, `.cursor-plugin/marketplace.json`, `.github/plugin/marketplace.json`
- Test: `cli/test/marketplace.test.ts`, `cli/test/agents-package.test.ts`

**Interfaces:**
- Consumes: `buildAgents`, `isAgentsBuild` (Task 3); `pluginManifest` (build-plugin).
- Produces:
  - `PLUGINS_BRANCH = "plugins"`
  - `AGENT_MARKETPLACES: { codex: string; cursor: string; copilot: string }` (paths relative to a marketplace root)
  - `type MarketplaceSource = { branch: string } | { local: string }`
  - `agentMarketplaces(source: MarketplaceSource): Record<string, Record<string, unknown>>` (path → file)
  - `agentMarketplaceProblems(path: string, file: unknown): string[]`
  - `buildAgentsLocal(agentsDir: string, outDir: string): void` (copies the package to `outDir/motif/` and writes the three files with `{ local: "./motif" }`)

- [ ] **Step 1: Write the failing tests**

Append to `cli/test/marketplace.test.ts` (add the imports to its import lines):

```ts
import { AGENT_MARKETPLACES, agentMarketplaceProblems, agentMarketplaces, PLUGINS_BRANCH } from "../scripts/marketplace";

describe("the other agents' marketplaces", () => {
  const REPO = join(import.meta.dir, "../..");
  const files = agentMarketplaces({ branch: PLUGINS_BRANCH });

  test("one per agent, each listing Motif from the plugins branch in that agent's own format", () => {
    expect(Object.keys(files).sort()).toEqual([".agents/plugins/marketplace.json", ".cursor-plugin/marketplace.json", ".github/plugin/marketplace.json"]);
    expect(Object.values(AGENT_MARKETPLACES).sort()).toEqual(Object.keys(files).sort());
    const codex = files[AGENT_MARKETPLACES.codex] as any;
    expect(codex.plugins[0].source).toEqual({ source: "url", url: "https://github.com/7mxd/motif.git", ref: "plugins" });
    for (const path of [AGENT_MARKETPLACES.cursor, AGENT_MARKETPLACES.copilot]) {
      expect((files[path] as any).plugins[0].source).toEqual({ source: "github", repo: "7mxd/motif", ref: "plugins" });
    }
    for (const [path, file] of Object.entries(files)) expect([path, agentMarketplaceProblems(path, file)]).toEqual([path, []]);
  });

  test("the files on main are what the script writes", () => {
    for (const [path, file] of Object.entries(files)) {
      expect(JSON.parse(readFileSync(join(REPO, path), "utf8"))).toEqual(file);
    }
  });

  test("a local marketplace points at the package beside it", () => {
    const local = agentMarketplaces({ local: "./motif" });
    expect((local[AGENT_MARKETPLACES.codex] as any).plugins[0].source).toEqual({ source: "local", path: "./motif" });
    expect((local[AGENT_MARKETPLACES.copilot] as any).plugins[0].source).toBe("./motif");
  });

  test("names what's wrong in plain words", () => {
    const codex = structuredClone(files[AGENT_MARKETPLACES.codex]) as any;
    codex.plugins[0].source.ref = "main";
    expect(agentMarketplaceProblems(AGENT_MARKETPLACES.codex, codex)).toEqual(['Motif must come from this repository\'s "plugins" branch.']);
    expect(agentMarketplaceProblems(AGENT_MARKETPLACES.copilot, { name: "x", plugins: [] })).toEqual([
      'The marketplace must be named "motif".',
      "The marketplace must list one plugin, Motif.",
    ]);
  });
});
```

(If `marketplace.test.ts` doesn't import `readFileSync`/`join` yet, add `import { readFileSync } from "node:fs";` and `import { join } from "node:path";`.)

Append to `cli/test/agents-package.test.ts`, adding `buildAgentsLocal` to its `../scripts/build-agents` import and a new line `import { AGENT_MARKETPLACES } from "../scripts/marketplace";`:

```ts
describe("the local marketplace for checks and trying a build", () => {
  test("holds the package as motif/ and each agent's marketplace pointing at it", () => {
    const agents = fresh();
    buildAgents(agents);
    const local = join(tempDir("motif-agents-local-"), "agents-local");
    buildAgentsLocal(agents, local);
    expect(walk(join(local, "motif")).sort()).toEqual(walk(agents).sort());
    for (const path of Object.values(AGENT_MARKETPLACES)) {
      expect(JSON.stringify(JSON.parse(readFileSync(join(local, path), "utf8")))).toContain("./motif");
    }
  });

  test("never replaces a folder that isn't a local marketplace build", () => {
    const agents = fresh();
    buildAgents(agents);
    const local = join(tempDir("motif-agents-local-"), "agents-local");
    mkdirSync(local, { recursive: true });
    writeFileSync(join(local, "notes.txt"), "mine");
    expect(() => buildAgentsLocal(agents, local)).toThrow("isn't a Motif local marketplace build");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd cli && bun test test/marketplace.test.ts test/agents-package.test.ts`
Expected: FAIL — `agentMarketplaces` / `buildAgentsLocal` aren't exported.

- [ ] **Step 3: Add the marketplaces to `cli/scripts/marketplace.ts`**

Add below `marketplaceProblems`:

```ts
export const PLUGINS_BRANCH = "plugins";
const REPO_SLUG = "7mxd/motif";

/** Where each agent with a plugin system reads a marketplace, relative to the marketplace's root. */
export const AGENT_MARKETPLACES = {
  codex: ".agents/plugins/marketplace.json",
  cursor: ".cursor-plugin/marketplace.json",
  copilot: ".github/plugin/marketplace.json",
} as const;

export type MarketplaceSource = { branch: string } | { local: string };

/** Each agent's marketplace: Motif from this repository's plugins branch, or from a folder beside a local marketplace. */
export function agentMarketplaces(source: MarketplaceSource): Record<string, Record<string, unknown>> {
  const m = pluginManifest("0") as { name: string; description: string };
  const owner = { name: "7mxd", url: "https://github.com/7mxd" };
  const description = "Motif: design guide tools for AI coding agents.";
  const local = "local" in source ? source.local : null;
  const codexSource = local ? { source: "local", path: local } : { source: "url", url: `https://github.com/${REPO_SLUG}.git`, ref: (source as { branch: string }).branch };
  const githubSource = local ?? { source: "github", repo: REPO_SLUG, ref: (source as { branch: string }).branch };
  const entry = (s: unknown) => ({ name: m.name, description: m.description, source: s });
  return {
    [AGENT_MARKETPLACES.codex]: {
      name: "motif",
      interface: { displayName: "Motif" },
      plugins: [{ ...entry(codexSource), policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" } }],
    },
    [AGENT_MARKETPLACES.cursor]: { name: "motif", owner, metadata: { description }, plugins: [entry(githubSource)] },
    [AGENT_MARKETPLACES.copilot]: { name: "motif", owner, metadata: { description }, plugins: [entry(githubSource)] },
  };
}

/** What's wrong with one of the other agents' marketplace files on main, in plain words; empty when it's right. */
export function agentMarketplaceProblems(path: string, file: unknown): string[] {
  const m = (file ?? {}) as Record<string, any>;
  const problems: string[] = [];
  if (m.name !== "motif") problems.push('The marketplace must be named "motif".');
  const plugins: any[] = Array.isArray(m.plugins) ? m.plugins : [];
  if (plugins.length !== 1) problems.push("The marketplace must list one plugin, Motif.");
  for (const p of plugins) {
    if (p?.name !== NAME) problems.push(`The plugin entry must be named "${NAME}", as the plugin itself is.`);
    if (p && "version" in p) problems.push("The plugin entry must not set a version: the package's own plugin.json gives it.");
    const s = p?.source ?? {};
    const fromBranch = path === AGENT_MARKETPLACES.codex
      ? s.source === "url" && s.url === `https://github.com/${REPO_SLUG}.git` && s.ref === PLUGINS_BRANCH
      : s.source === "github" && s.repo === REPO_SLUG && s.ref === PLUGINS_BRANCH;
    if (!fromBranch) problems.push(`Motif must come from this repository's "${PLUGINS_BRANCH}" branch.`);
  }
  return problems;
}
```

Change the CLI block at the bottom so `--agents` writes the three files and anything else keeps today's behaviour:

```ts
if (import.meta.main) {
  if (process.argv[2] === "--agents") {
    for (const [path, file] of Object.entries(agentMarketplaces({ branch: PLUGINS_BRANCH }))) {
      mkdirSync(dirname(join(REPO, path)), { recursive: true });
      writeFileSync(join(REPO, path), `${JSON.stringify(file, null, 2)}\n`);
      console.log(`Wrote ${path}`);
    }
    process.exit(0);
  }
  const tag = process.argv[2] ?? "";
  // … the existing tag flow, unchanged …
}
```

(add `dirname` to the `node:path` import).

- [ ] **Step 4: Add `buildAgentsLocal` to `cli/scripts/build-agents.ts`**

```ts
import { agentMarketplaces } from "./marketplace";

/** A local marketplace for each agent, holding a copy of the package as motif/: for CI's checks and for trying a build. */
export function buildAgentsLocal(agentsDir: string, outDir: string): void {
  if (existsSync(outDir) && readdirSync(outDir).length > 0 && !isAgentsBuild(join(outDir, "motif"))) {
    throw new Error(`${outDir} isn't a Motif local marketplace build, so it wasn't replaced.`);
  }
  rmSync(outDir, { recursive: true, force: true });
  cpSync(agentsDir, join(outDir, "motif"), { recursive: true });
  for (const [path, file] of Object.entries(agentMarketplaces({ local: "./motif" }))) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    writeFileSync(join(outDir, path), json(file));
  }
}
```

and make the CLI block build both:

```ts
if (import.meta.main) {
  const out = resolve(process.argv[2] ?? join(REPO, "dist", "agents"));
  const local = resolve(process.argv[3] ?? join(REPO, "dist", "agents-local"));
  buildAgents(out);
  buildAgentsLocal(out, local);
  console.log(`Built the package for other agents in ${out}, and a local marketplace for it in ${local}`);
}
```

(`marketplace.ts` imports `build-plugin` and `zip-plugin` only, so importing it here makes no cycle.)

- [ ] **Step 5: Write the files on main, then run the tests**

Run: `cd cli && bun scripts/marketplace.ts --agents && bun test test/marketplace.test.ts test/agents-package.test.ts && bun run typecheck`
Expected: three "Wrote …" lines; PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add cli/scripts/marketplace.ts cli/scripts/build-agents.ts cli/test/marketplace.test.ts cli/test/agents-package.test.ts .agents/plugins/marketplace.json .cursor-plugin/marketplace.json .github/plugin/marketplace.json
git commit -m "feat(packages): Codex, Cursor and Copilot marketplaces that follow the plugins branch" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The skill archives (`motif-skill.zip`, `motif-skill.tar.gz`)

**Files:**
- Create: `cli/scripts/skill-archive.ts`
- Create: `plugin/agents/opencode/commands/motif.md`
- Modify: `cli/scripts/zip-plugin.ts` (export `listFiles` and `refuseWindowsLineEndings`)
- Modify: `cli/package.json` (script `skill:archives`)
- Test: `cli/test/skill-archive.test.ts`

**Interfaces:**
- Consumes: fflate `zipSync`, `gzipSync`, `gunzipSync`.
- Produces:
  - `SKILL_ZIP = "motif-skill.zip"`, `SKILL_TGZ = "motif-skill.tar.gz"`
  - `type ArchiveEntry = [path: string, data: Uint8Array, mode: number]`
  - `skillArchiveEntries(repo?: string): ArchiveEntry[]` — `motif/<skill file>` for every file in `skill/`, plus `opencode/commands/motif.md`; sorted; `motif/bin/motif` mode `0o755`, others `0o644`
  - `skillZip(entries: ArchiveEntry[]): Uint8Array`, `skillTarGz(entries: ArchiveEntry[]): Uint8Array`
  - from `zip-plugin.ts`: `listFiles(dir: string): string[]`, `refuseWindowsLineEndings(path: string, data: Uint8Array): void`

- [ ] **Step 1: Write the failing test**

`cli/test/skill-archive.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gunzipSync, unzipSync } from "fflate";
import { SKILL_TGZ, SKILL_ZIP, skillArchiveEntries, skillTarGz, skillZip } from "../scripts/skill-archive";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, base) : [relative(base, path).replace(/\\/g, "/")];
  });
}

/** Each tar entry's name and mode, read from its headers. */
function tarModes(tgz: Uint8Array): Map<string, number> {
  const tar = gunzipSync(tgz);
  const out = new Map<string, number>();
  const text = (from: number, len: number) => new TextDecoder().decode(tar.subarray(from, from + len)).replace(/\0.*$/s, "");
  for (let at = 0; at + 512 <= tar.length; ) {
    const name = text(at, 100);
    if (!name) break;
    const size = parseInt(text(at + 124, 12), 8);
    out.set(name, parseInt(text(at + 100, 8), 8));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

describe("the skill archives", () => {
  const entries = skillArchiveEntries();
  const names = entries.map(([n]) => n);

  test("are named as the release and the install scripts expect", () => {
    expect([SKILL_ZIP, SKILL_TGZ]).toEqual(["motif-skill.zip", "motif-skill.tar.gz"]);
  });

  test("hold the whole skill as motif/, and OpenCode's /motif command", () => {
    expect(names.filter((n) => n.startsWith("motif/")).map((n) => n.slice(6)).sort()).toEqual(walk(join(REPO, "skill")).sort());
    expect(names).toContain("opencode/commands/motif.md");
    expect(names).toEqual([...names].sort());
  });

  test("the tarball unpacks with tar; only the bootstrap is executable", () => {
    const dir = tempDir("motif-tgz-");
    writeFileSync(join(dir, SKILL_TGZ), skillTarGz(entries));
    const r = Bun.spawnSync(["tar", "-xzf", SKILL_TGZ], { cwd: dir });
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(dir, "motif/SKILL.md"), "utf8")).toBe(readFileSync(join(REPO, "skill/SKILL.md"), "utf8"));
    const modes = tarModes(skillTarGz(entries));
    expect(modes.get("motif/bin/motif")).toBe(0o755);
    expect([...modes].filter(([n, m]) => n !== "motif/bin/motif" && m !== 0o644)).toEqual([]);
  });

  test("the zip holds the same files", () => {
    expect(Object.keys(unzipSync(skillZip(entries))).sort()).toEqual([...names].sort());
  });

  test("the same files give the same bytes, in any time zone, with no date in the gzip header", () => {
    const before = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      expect(skillZip(entries)).toEqual(skillZip(entries));
      const tgz = skillTarGz(entries);
      expect(tgz).toEqual(skillTarGz(entries));
      expect([...tgz.subarray(4, 8)]).toEqual([0, 0, 0, 0]);
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  test("refuse a name too long for tar, and a bootstrap with Windows line endings", () => {
    expect(() => skillTarGz([[`motif/${"x".repeat(120)}.md`, new Uint8Array(1), 0o644]])).toThrow("longer than a tar name can be");
    const crlf = entries.map(([n, d, m]): [string, Uint8Array, number] => [n, n === "motif/bin/motif" ? new TextEncoder().encode("#!/bin/sh\r\n") : d, m]);
    expect(() => skillTarGz(crlf)).toThrow("has Windows line endings");
    expect(() => skillZip(crlf)).toThrow("has Windows line endings");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd cli && bun test test/skill-archive.test.ts`
Expected: FAIL — `Cannot find module '../scripts/skill-archive'`.

- [ ] **Step 3: Share two helpers from `zip-plugin.ts`**

In `cli/scripts/zip-plugin.ts`, rename `files` to an exported `listFiles` (same body and doc comment), and move the CR check into an exported helper used by `zipPlugin`:

```ts
/** sh can't run a script with Windows line endings: refuse the build instead of shipping a broken bootstrap. */
export function refuseWindowsLineEndings(path: string, data: Uint8Array): void {
  if (data.includes(13)) {
    throw new Error(`${path} has Windows line endings, which sh can't run: check it out with LF endings (see .gitattributes) and rebuild with "bun run plugin".`);
  }
}
```

In `zipPlugin`, replace the inline `if (EXECUTABLE.has(path) && data.includes(13)) { throw … }` with `if (EXECUTABLE.has(path)) refuseWindowsLineEndings(path, data);` and `files(pluginDir)` with `listFiles(pluginDir)`.

Run: `cd cli && bun test test/plugin-zip.test.ts` — Expected: PASS (unchanged behaviour).

- [ ] **Step 4: Write OpenCode's command**

`plugin/agents/opencode/commands/motif.md`:

```markdown
---
description: "Motif: design and build your app's look from its design guide"
---
<!-- Installed by Motif's install script: running it again replaces this file, and --uninstall removes it. -->
Use the motif skill: load it and follow its SKILL.md.

What the developer asked for: $ARGUMENTS

If that's empty, they typed /motif on its own: follow modes/design.md in the skill's folder.
```

- [ ] **Step 5: Write `cli/scripts/skill-archive.ts`**

```ts
// Packs the skill for the install scripts: motif-skill.tar.gz (install.sh) and motif-skill.zip (install.ps1), each with
// the skill as motif/ and OpenCode's /motif command. Fixed order, dates and modes, so the same files give the same bytes.
// Run: bun run skill:archives
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync, zipSync, type Zippable } from "fflate";
import { listFiles, refuseWindowsLineEndings } from "./zip-plugin";

const REPO = resolve(import.meta.dir, "../..");
export const SKILL_ZIP = "motif-skill.zip";
export const SKILL_TGZ = "motif-skill.tar.gz";
const BOOTSTRAP = "motif/bin/motif";
const TAR_MTIME = 946684800; // 2000-01-01 00:00 UTC

export type ArchiveEntry = [path: string, data: Uint8Array, mode: number];

/** Every file the archives hold, sorted: the skill as motif/, and OpenCode's command. */
export function skillArchiveEntries(repo: string = REPO): ArchiveEntry[] {
  const skill = join(repo, "skill");
  const entries: ArchiveEntry[] = listFiles(skill).map((f) => [`motif/${f}`, new Uint8Array(readFileSync(join(skill, f))), 0o644]);
  const command = join(repo, "plugin", "agents", "opencode", "commands", "motif.md");
  entries.push(["opencode/commands/motif.md", new Uint8Array(readFileSync(command)), 0o644]);
  for (const e of entries) if (e[0] === BOOTSTRAP) e[2] = 0o755;
  return entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function checked(entries: ArchiveEntry[]): ArchiveEntry[] {
  for (const [path, data] of entries) if (path === BOOTSTRAP) refuseWindowsLineEndings(path, data);
  return entries;
}

export function skillZip(entries: ArchiveEntry[]): Uint8Array {
  const date = new Date(2000, 0, 1); // zips store local time: built from local parts, the same in every time zone
  const files: Zippable = {};
  for (const [path, data, mode] of checked(entries)) files[path] = [data, { os: 3, attrs: ((0o100000 | mode) << 16) >>> 0, mtime: date }];
  return zipSync(files, { level: 9 });
}

function tarHeader(name: string, size: number, mode: number): Uint8Array {
  const enc = new TextEncoder();
  const nameBytes = enc.encode(name);
  if (nameBytes.length > 100) throw new Error(`${name} is longer than a tar name can be (100 bytes): shorten it.`);
  const h = new Uint8Array(512);
  const put = (text: string, at: number) => h.set(enc.encode(text), at);
  const octal = (n: number, width: number) => `${n.toString(8).padStart(width - 1, "0")}\0`;
  h.set(nameBytes, 0);
  put(octal(mode, 8), 100);
  put(octal(0, 8), 108);
  put(octal(0, 8), 116);
  put(octal(size, 12), 124);
  put(octal(TAR_MTIME, 12), 136);
  put("        ", 148);
  put("0", 156);
  put("ustar\0", 257);
  put("00", 263);
  const sum = h.reduce((total, b) => total + b, 0);
  put(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return h;
}

export function skillTarGz(entries: ArchiveEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [path, data, mode] of checked(entries)) {
    parts.push(tarHeader(path, data.length, mode), data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  const tar = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    tar.set(p, at);
    at += p.length;
  }
  return gzipSync(tar, { level: 9, mtime: 0 });
}

if (import.meta.main) {
  const entries = skillArchiveEntries();
  mkdirSync(join(REPO, "dist"), { recursive: true });
  writeFileSync(join(REPO, "dist", SKILL_ZIP), skillZip(entries));
  writeFileSync(join(REPO, "dist", SKILL_TGZ), skillTarGz(entries));
  console.log(`Wrote dist/${SKILL_ZIP} and dist/${SKILL_TGZ} (${entries.length} files)`);
}
```

In `cli/package.json` scripts add `"skill:archives": "bun scripts/skill-archive.ts",`.

- [ ] **Step 6: Run the tests**

Run: `cd cli && bun test test/skill-archive.test.ts test/plugin-zip.test.ts && bun run typecheck && bun run skill:archives`
Expected: PASS; typecheck clean; "Wrote dist/motif-skill.zip and dist/motif-skill.tar.gz".

If fflate's `gzipSync` writes a date despite `mtime: 0` (the header test fails), set bytes 4–7 of the result to 0 after compressing (the CRC covers the data, not the header), and note the ruling.

- [ ] **Step 7: Commit**

```bash
git add cli/scripts/skill-archive.ts cli/scripts/zip-plugin.ts cli/test/skill-archive.test.ts cli/package.json plugin/agents/opencode
git commit -m "feat(packages): the skill archives the install scripts download" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `install.sh`

**Files:**
- Create: `install.sh` (repo root; `.gitattributes` already gives `*.sh` LF)
- Test: `cli/test/install-script.test.ts`

**Interfaces:**
- Consumes: `skillArchiveEntries`, `skillTarGz`, `SKILL_TGZ` (Task 5).
- Produces: `install.sh` with options `--agent opencode|agents`, `--version X.Y.Z`, `--uninstall`, `--help`; environment overrides for tests and checks: `MOTIF_RAW_BASE` (where `skills/motif/VERSION` is read; default `https://raw.githubusercontent.com/7mxd/motif/plugins`), `MOTIF_DOWNLOAD_BASE` (release download folder; default `https://github.com/7mxd/motif/releases/download/v<version>`), `MOTIF_REPO`.

- [ ] **Step 1: Write the failing test**

`cli/test/install-script.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL_TGZ, skillArchiveEntries, skillTarGz } from "../scripts/skill-archive";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO, "skill/VERSION"), "utf8").trim();
const COMMAND = readFileSync(join(REPO, "plugin/agents/opencode/commands/motif.md"), "utf8");
const slash = (p: string) => p.replace(/\\/g, "/");

let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  const tgz = skillTarGz(skillArchiveEntries());
  const sums = `${createHash("sha256").update(tgz).digest("hex")}  ${SKILL_TGZ}\n`;
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/raw/skills/motif/VERSION") return new Response(`${VERSION}\n`);
      if (path === `/ok/${SKILL_TGZ}` || path === `/bad/${SKILL_TGZ}`) return new Response(tgz);
      if (path === "/ok/SHA256SUMS") return new Response(sums);
      if (path === "/bad/SHA256SUMS") return new Response(`${"0".repeat(64)}  ${SKILL_TGZ}\n`);
      return new Response("not found", { status: 404 });
    },
  });
});
afterAll(() => server?.stop(true));

const sh = Bun.which("sh");

describe.skipIf(!sh)("install.sh", () => {
  /** A fresh home, with a space in its path (review focus), and no .agents or .config in it. */
  const freshHome = () => {
    const home = join(tempDir("motif-install-"), "home with space");
    mkdirSync(home, { recursive: true });
    return slash(home);
  };
  const run = async (home: string, args: string[], base = "ok", extra: Record<string, string> = {}) => {
    const env: Record<string, string> = { ...process.env, HOME: home, MOTIF_RAW_BASE: `http://127.0.0.1:${server.port}/raw`, MOTIF_DOWNLOAD_BASE: `http://127.0.0.1:${server.port}/${base}`, ...extra };
    delete env.XDG_CONFIG_HOME;
    if (extra.XDG_CONFIG_HOME) env.XDG_CONFIG_HOME = extra.XDG_CONFIG_HOME;
    const proc = Bun.spawn([sh!, join(REPO, "install.sh"), ...args], { env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { exitCode, output: `${stdout}${stderr}` };
  };

  test("installs for any agent in ~/.agents/skills on a fresh computer, folders and all (review focus)", async () => {
    const home = freshHome();
    const r = await run(home, ["--agent", "agents"]);
    expect({ code: r.exitCode, out: r.output }).toMatchObject({ code: 0 });
    expect(r.output).toContain(`installed Motif v${VERSION}`);
    expect(readFileSync(join(home, ".agents/skills/motif/SKILL.md"), "utf8")).toBe(readFileSync(join(REPO, "skill/SKILL.md"), "utf8"));
    expect(readFileSync(join(home, ".agents/skills/motif/VERSION"), "utf8").trim()).toBe(VERSION);
  }, 60_000);

  test("finds OpenCode by its config folder and adds the /motif command there too", async () => {
    const home = freshHome();
    const config = slash(join(home, "cfg"));
    mkdirSync(join(config, "opencode"), { recursive: true });
    const r = await run(home, [], "ok", { XDG_CONFIG_HOME: config });
    expect({ code: r.exitCode, out: r.output }).toMatchObject({ code: 0 });
    expect(existsSync(join(config, "opencode/skills/motif/SKILL.md"))).toBe(true);
    expect(readFileSync(join(config, "opencode/commands/motif.md"), "utf8")).toBe(COMMAND);
    expect(r.output).toContain("/motif");
  }, 60_000);

  test("running it again replaces an earlier Motif install", async () => {
    const home = freshHome();
    await run(home, ["--agent", "agents"]);
    writeFileSync(join(home, ".agents/skills/motif/stale.md"), "old");
    const r = await run(home, ["--agent", "agents"]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(home, ".agents/skills/motif/stale.md"))).toBe(false);
  }, 60_000);

  test("a download that fails its checksum installs nothing and keeps what was there", async () => {
    const home = freshHome();
    await run(home, ["--agent", "agents"]);
    writeFileSync(join(home, ".agents/skills/motif/mark.txt"), "kept");
    const r = await run(home, ["--agent", "agents"], "bad");
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain("failed its safety check");
    expect(readFileSync(join(home, ".agents/skills/motif/mark.txt"), "utf8")).toBe("kept");
  }, 60_000);

  test("a failed download says so plainly", async () => {
    const r = await run(freshHome(), ["--agent", "agents"], "missing");
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain("couldn't download Motif");
  }, 60_000);

  test("leaves a folder named motif that isn't Motif alone", async () => {
    const home = freshHome();
    mkdirSync(join(home, ".agents/skills/motif"), { recursive: true });
    writeFileSync(join(home, ".agents/skills/motif/SKILL.md"), "---\nname: someone-else\n---\n");
    const r = await run(home, ["--agent", "agents"]);
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain("isn't Motif");
    expect(readFileSync(join(home, ".agents/skills/motif/SKILL.md"), "utf8")).toContain("someone-else");
  }, 60_000);

  test("--uninstall removes Motif's skill and command and nothing else", async () => {
    const home = freshHome();
    const config = slash(join(home, "cfg"));
    mkdirSync(join(config, "opencode/skills/other"), { recursive: true });
    await run(home, ["--agent", "opencode"], "ok", { XDG_CONFIG_HOME: config });
    const r = await run(home, ["--agent", "opencode", "--uninstall"], "ok", { XDG_CONFIG_HOME: config });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(config, "opencode/skills/motif"))).toBe(false);
    expect(existsSync(join(config, "opencode/commands/motif.md"))).toBe(false);
    expect(existsSync(join(config, "opencode/skills/other"))).toBe(true);
  }, 60_000);

  test("--version pins a version without asking which is the latest", async () => {
    const home = freshHome();
    const r = await run(home, ["--agent", "agents", "--version", VERSION], "ok", { MOTIF_RAW_BASE: `http://127.0.0.1:${server.port}/nowhere` });
    expect(r.exitCode).toBe(0);
  }, 60_000);

  test("an unknown option is refused in plain words", async () => {
    const r = await run(freshHome(), ["--everything"]);
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain('unknown option "--everything"');
  }, 60_000);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd cli && bun test test/install-script.test.ts`
Expected: FAIL — `sh` can't open `install.sh`.

- [ ] **Step 3: Write `install.sh`**

```sh
#!/bin/sh
# Installs Motif's skill for OpenCode, or for any agent that reads ~/.agents/skills.
#   curl -fsSL https://raw.githubusercontent.com/7mxd/motif/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/7mxd/motif/main/install.sh | sh -s -- --uninstall
# It downloads only from GitHub, checks the download against the release's SHA256SUMS, and replaces or removes only
# Motif's own files. Running it again updates Motif.
set -eu

REPO="${MOTIF_REPO:-7mxd/motif}"
RAW="${MOTIF_RAW_BASE:-https://raw.githubusercontent.com/$REPO/plugins}"
AGENT=""
VERSION=""
UNINSTALL=0
MARK="Installed by Motif's install script"

say() { printf 'Motif: %s\n' "$*"; }
fail() { printf 'Motif: %s\n' "$*" >&2; exit 2; }
usage() {
  cat <<'EOF'
Usage: install.sh [--agent opencode|agents] [--version X.Y.Z] [--uninstall]
  --agent opencode   install for OpenCode, with its /motif command (the default when OpenCode is installed)
  --agent agents     install in ~/.agents/skills, which Codex, Gemini CLI, Copilot, Cursor, Amp and others read
  --version X.Y.Z    install that version instead of the latest
  --uninstall        remove Motif's skill (and OpenCode's /motif command)
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --agent) [ $# -ge 2 ] || fail "--agent needs opencode or agents."; AGENT="$2"; shift 2 ;;
    --agent=*) AGENT="${1#--agent=}"; shift ;;
    --version) [ $# -ge 2 ] || fail "--version needs a version, such as 0.2.0."; VERSION="$2"; shift 2 ;;
    --version=*) VERSION="${1#--version=}"; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown option \"$1\". Use --agent opencode|agents, --version X.Y.Z or --uninstall." ;;
  esac
done

OPENCODE_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
if [ -z "$AGENT" ]; then
  if command -v opencode >/dev/null 2>&1 || [ -d "$OPENCODE_CONFIG" ]; then AGENT=opencode; else AGENT=agents; fi
fi
case "$AGENT" in
  opencode) SKILLS="$OPENCODE_CONFIG/skills"; COMMANDS="$OPENCODE_CONFIG/commands"; WHO="OpenCode" ;;
  agents) SKILLS="$HOME/.agents/skills"; COMMANDS=""; WHO="agents that read ~/.agents/skills (Codex, Gemini CLI, GitHub Copilot, Cursor, Amp and others)" ;;
  *) fail "--agent must be opencode or agents, not \"$AGENT\"." ;;
esac
TARGET="$SKILLS/motif"
COMMAND_FILE=""
if [ -n "$COMMANDS" ]; then COMMAND_FILE="$COMMANDS/motif.md"; fi

is_motif() { [ -f "$1/SKILL.md" ] && [ -f "$1/bin/motif" ] && grep -q '^name: motif[[:space:]]*$' "$1/SKILL.md"; }
is_motif_command() { [ -f "$1" ] && grep -q "$MARK" "$1"; }

if [ -e "$TARGET" ] && ! is_motif "$TARGET"; then
  fail "$TARGET is there and isn't Motif, so nothing was changed. Move it somewhere else and run this again."
fi
if [ -n "$COMMAND_FILE" ] && [ -e "$COMMAND_FILE" ] && ! is_motif_command "$COMMAND_FILE"; then
  fail "$COMMAND_FILE is there and isn't Motif's, so nothing was changed. Move it somewhere else and run this again."
fi

if [ "$UNINSTALL" = 1 ]; then
  rm -rf "$TARGET"
  if [ -n "$COMMAND_FILE" ]; then rm -f "$COMMAND_FILE"; fi
  say "removed Motif from $SKILLS."
  exit 0
fi

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -q "$1" -O "$2"
  else return 1
  fi
}
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d ' ' -f 1
  else shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}
command -v tar >/dev/null 2>&1 || fail "tar is needed to unpack Motif. Install it, then run this again."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if [ -z "$VERSION" ]; then
  fetch "$RAW/skills/motif/VERSION" "$TMP/VERSION" || fail "couldn't find Motif's latest version. Check your internet connection and try again."
  VERSION=$(tr -d ' \r\n' < "$TMP/VERSION")
fi
case "$VERSION" in
  ""|*[!0-9A-Za-z.-]*) fail "\"$VERSION\" isn't a Motif version." ;;
esac

BASE="${MOTIF_DOWNLOAD_BASE:-https://github.com/$REPO/releases/download/v$VERSION}"
ASSET=motif-skill.tar.gz
say "downloading Motif v$VERSION..."
if ! fetch "$BASE/$ASSET" "$TMP/$ASSET" || ! fetch "$BASE/SHA256SUMS" "$TMP/SHA256SUMS"; then
  fail "couldn't download Motif v$VERSION. Check your internet connection and try again."
fi
EXPECTED=$(grep " $ASSET\$" "$TMP/SHA256SUMS" | cut -d ' ' -f 1 || true)
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$(sha256 "$TMP/$ASSET")" ]; then
  fail "the download failed its safety check, so nothing was installed. Please try again later, or report this at https://github.com/$REPO/issues"
fi

mkdir "$TMP/unpacked"
tar -xzf "$TMP/$ASSET" -C "$TMP/unpacked" || fail "couldn't unpack the download."
is_motif "$TMP/unpacked/motif" || fail "the download didn't hold Motif's skill, so nothing was installed."

mkdir -p "$SKILLS" || fail "couldn't create $SKILLS."
# Copy next to the installed one first, so a failed copy leaves it as it was.
NEW="$SKILLS/.motif-new"
rm -rf "$NEW"
if ! cp -R "$TMP/unpacked/motif" "$NEW"; then
  rm -rf "$NEW"
  fail "couldn't write to $SKILLS."
fi
rm -rf "$TARGET"
mv "$NEW" "$TARGET" || fail "couldn't finish installing in $TARGET."
if [ -n "$COMMAND_FILE" ]; then
  mkdir -p "$COMMANDS" || fail "couldn't create $COMMANDS."
  cp "$TMP/unpacked/opencode/commands/motif.md" "$COMMAND_FILE" || fail "couldn't write $COMMAND_FILE."
fi

say "installed Motif v$VERSION in $TARGET, for $WHO."
if [ -n "$COMMAND_FILE" ]; then say "start it in OpenCode with /motif."; else say "start it the way your agent starts a skill (for example /motif)."; fi
```

Then: `git update-index --chmod=+x install.sh` after adding it (Step 5), so it's executable on macOS and Linux checkouts.

- [ ] **Step 4: Run the tests**

Run: `cd cli && bun test test/install-script.test.ts`
Expected: PASS (on Windows through Git Bash's `sh`, `curl` and `tar`).

- [ ] **Step 5: Commit**

```bash
git add install.sh cli/test/install-script.test.ts && git update-index --chmod=+x install.sh
git commit -m "feat(install): install.sh puts Motif's skill where OpenCode or any skills-reading agent finds it" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `install.ps1`

**Files:**
- Create: `install.ps1` (repo root; `.gitattributes` gives `*.ps1` CRLF)
- Test: `cli/test/install-script.test.ts` (Windows section)

**Interfaces:**
- Consumes: `skillArchiveEntries`, `skillZip`, `SKILL_ZIP` (Task 5); the test server from Task 6 (extend it).
- Produces: `install.ps1` with `-Agent opencode|agents`, `-Version X.Y.Z`, `-Uninstall`; also `$env:MOTIF_AGENT`, `$env:MOTIF_VERSION` (for `irm | iex`, which can't pass parameters); the same `MOTIF_RAW_BASE`, `MOTIF_DOWNLOAD_BASE`, `MOTIF_REPO` overrides. Under `irm | iex` it never calls `exit`; it sets `$LASTEXITCODE`.

- [ ] **Step 1: Write the failing test**

In `cli/test/install-script.test.ts`, make the server also serve the zip (add to `beforeAll`):

```ts
  const zip = skillZip(skillArchiveEntries());
  const zipSums = `${createHash("sha256").update(zip).digest("hex")}  ${SKILL_ZIP}\n`;
  // in fetch(): serve /ok/<SKILL_ZIP> and /bad/<SKILL_ZIP> with `zip`; /ok/SHA256SUMS returns `${sums}${zipSums}`;
  // /bad/SHA256SUMS returns zeros for both names.
```

(import `SKILL_ZIP`, `skillZip`), then append:

```ts
const isWin = process.platform === "win32";

describe.skipIf(!isWin)("install.ps1", () => {
  const freshHome = () => {
    const home = join(tempDir("motif-install-ps-"), "home with space");
    mkdirSync(home, { recursive: true });
    return home;
  };
  const envFor = (home: string, base = "ok", extra: Record<string, string> = {}) => {
    const env: Record<string, string> = { ...process.env, USERPROFILE: home, HOME: home, MOTIF_RAW_BASE: `http://127.0.0.1:${server.port}/raw`, MOTIF_DOWNLOAD_BASE: `http://127.0.0.1:${server.port}/${base}`, ...extra };
    if (!extra.XDG_CONFIG_HOME) delete env.XDG_CONFIG_HOME;
    return env;
  };
  const run = async (cmd: string[], env: Record<string, string>) => {
    const proc = Bun.spawn(cmd, { env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { exitCode, output: `${stdout}${stderr}` };
  };
  const file = (args: string[]) => ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(REPO, "install.ps1"), ...args];

  test("installs for any agent in ~/.agents/skills, in a home with a space in it (review focus)", async () => {
    const home = freshHome();
    const r = await run(file(["-Agent", "agents"]), envFor(home));
    expect({ code: r.exitCode, out: r.output }).toMatchObject({ code: 0 });
    expect(readFileSync(join(home, ".agents/skills/motif/VERSION"), "utf8").trim()).toBe(VERSION);
  }, 120_000);

  test("works as irm | iex: no parameters, no script path, and no exit that would close the window (review focus)", async () => {
    const home = freshHome();
    const script = `Get-Content -Raw -LiteralPath '${join(REPO, "install.ps1").replace(/'/g, "''")}' | Invoke-Expression; Write-Output "still here"`;
    const r = await run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], envFor(home, "ok", { MOTIF_AGENT: "agents" }));
    expect(r.output).toContain("still here");
    expect(existsSync(join(home, ".agents/skills/motif/SKILL.md"))).toBe(true);
  }, 120_000);

  test("finds OpenCode by its config folder and adds the /motif command", async () => {
    const home = freshHome();
    const config = join(home, "cfg");
    mkdirSync(join(config, "opencode"), { recursive: true });
    const r = await run(file([]), envFor(home, "ok", { XDG_CONFIG_HOME: config }));
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(config, "opencode/commands/motif.md"), "utf8").replace(/\r\n/g, "\n")).toBe(COMMAND.replace(/\r\n/g, "\n"));
  }, 120_000);

  test("a download that fails its checksum installs nothing", async () => {
    const home = freshHome();
    const r = await run(file(["-Agent", "agents"]), envFor(home, "bad"));
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain("failed its safety check");
    expect(existsSync(join(home, ".agents/skills/motif"))).toBe(false);
  }, 120_000);

  test("leaves a folder named motif that isn't Motif alone, and -Uninstall removes only Motif", async () => {
    const home = freshHome();
    mkdirSync(join(home, ".agents/skills/motif"), { recursive: true });
    writeFileSync(join(home, ".agents/skills/motif/SKILL.md"), "---\nname: someone-else\n---\n");
    const r = await run(file(["-Agent", "agents"]), envFor(home));
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain("isn't Motif");
    const other = freshHome();
    await run(file(["-Agent", "agents"]), envFor(other));
    const u = await run(file(["-Agent", "agents", "-Uninstall"]), envFor(other));
    expect(u.exitCode).toBe(0);
    expect(existsSync(join(other, ".agents/skills/motif"))).toBe(false);
  }, 180_000);
});
```

- [ ] **Step 2: Run it to see it fail**

Run (Windows): `cd cli && bun test test/install-script.test.ts`
Expected: the install.ps1 tests FAIL — the script doesn't exist; the install.sh tests still PASS.

- [ ] **Step 3: Write `install.ps1`** (Write tool; it has backslashes)

```powershell
# Installs Motif's skill for OpenCode, or for any agent that reads ~/.agents/skills.
#   irm https://raw.githubusercontent.com/7mxd/motif/main/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/7mxd/motif/main/install.ps1))) -Uninstall
# Options: -Agent opencode|agents, -Version X.Y.Z, -Uninstall ($env:MOTIF_AGENT and $env:MOTIF_VERSION work too).
# It downloads only from GitHub, checks the download against the release's SHA256SUMS, and replaces or removes only
# Motif's own files. Running it again updates Motif.
param([string]$Agent = $env:MOTIF_AGENT, [string]$Version = $env:MOTIF_VERSION, [switch]$Uninstall)

function Invoke-MotifInstall([string]$Agent, [string]$Version, [bool]$Uninstall) {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $Repo = if ($env:MOTIF_REPO) { $env:MOTIF_REPO } else { '7mxd/motif' }
  $Raw = if ($env:MOTIF_RAW_BASE) { $env:MOTIF_RAW_BASE } else { "https://raw.githubusercontent.com/$Repo/plugins" }
  $Mark = "Installed by Motif's install script"
  function Say([string]$Text) { Write-Host "Motif: $Text" }
  function Fail([string]$Text) { [Console]::Error.WriteLine("Motif: $Text"); return 2 }
  function Test-Motif([string]$Dir) {
    $skill = Join-Path $Dir 'SKILL.md'
    if (-not (Test-Path -LiteralPath $skill) -or -not (Test-Path -LiteralPath (Join-Path (Join-Path $Dir 'bin') 'motif'))) { return $false }
    return [regex]::IsMatch([IO.File]::ReadAllText($skill), '(?m)^name: motif\s*$')
  }

  $UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
  $ConfigRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $UserHome '.config' }
  $OpenCodeConfig = Join-Path $ConfigRoot 'opencode'
  if (-not $Agent) {
    if ((Get-Command opencode -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath $OpenCodeConfig)) { $Agent = 'opencode' } else { $Agent = 'agents' }
  }
  if ($Agent -eq 'opencode') {
    $Skills = Join-Path $OpenCodeConfig 'skills'; $Commands = Join-Path $OpenCodeConfig 'commands'; $Who = 'OpenCode'
  } elseif ($Agent -eq 'agents') {
    $Skills = Join-Path (Join-Path $UserHome '.agents') 'skills'; $Commands = $null
    $Who = 'agents that read ~/.agents/skills (Codex, Gemini CLI, GitHub Copilot, Cursor, Amp and others)'
  } else {
    return (Fail "-Agent must be opencode or agents, not ""$Agent"".")
  }
  $Target = Join-Path $Skills 'motif'
  $CommandFile = if ($Commands) { Join-Path $Commands 'motif.md' } else { $null }

  if ((Test-Path -LiteralPath $Target) -and -not (Test-Motif $Target)) {
    return (Fail "$Target is there and isn't Motif, so nothing was changed. Move it somewhere else and run this again.")
  }
  if ($CommandFile -and (Test-Path -LiteralPath $CommandFile) -and -not ([IO.File]::ReadAllText($CommandFile).Contains($Mark))) {
    return (Fail "$CommandFile is there and isn't Motif's, so nothing was changed. Move it somewhere else and run this again.")
  }

  if ($Uninstall) {
    if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
    if ($CommandFile -and (Test-Path -LiteralPath $CommandFile)) { Remove-Item -LiteralPath $CommandFile -Force }
    Say "removed Motif from $Skills."
    return 0
  }

  $Tmp = Join-Path ([IO.Path]::GetTempPath()) ('motif-install-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    if (-not $Version) {
      try { $Version = (Invoke-WebRequest -UseBasicParsing -Uri "$Raw/skills/motif/VERSION").Content.Trim() }
      catch { return (Fail "couldn't find Motif's latest version. Check your internet connection and try again.") }
    }
    if ($Version -notmatch '^[0-9A-Za-z.-]+$') { return (Fail """$Version"" isn't a Motif version.") }
    $Base = if ($env:MOTIF_DOWNLOAD_BASE) { $env:MOTIF_DOWNLOAD_BASE } else { "https://github.com/$Repo/releases/download/v$Version" }
    $Asset = 'motif-skill.zip'
    $Zip = Join-Path $Tmp $Asset
    Say "downloading Motif v$Version..."
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile $Zip
      Invoke-WebRequest -UseBasicParsing -Uri "$Base/SHA256SUMS" -OutFile (Join-Path $Tmp 'SHA256SUMS')
    } catch {
      return (Fail "couldn't download Motif v$Version. Check your internet connection and try again.")
    }
    $Expected = $null
    foreach ($line in [IO.File]::ReadAllLines((Join-Path $Tmp 'SHA256SUMS'))) {
      $parts = $line.Trim() -split '\s+'
      if ($parts.Count -ge 2 -and $parts[1].TrimStart('*') -eq $Asset) { $Expected = $parts[0].ToLower() }
    }
    $Sha = [Security.Cryptography.SHA256]::Create()
    $Stream = [IO.File]::OpenRead($Zip)
    try { $Actual = ([BitConverter]::ToString($Sha.ComputeHash($Stream)) -replace '-', '').ToLower() } finally { $Stream.Dispose(); $Sha.Dispose() }
    if (-not $Expected -or $Expected -ne $Actual) {
      return (Fail "the download failed its safety check, so nothing was installed. Please try again later, or report this at https://github.com/$Repo/issues")
    }
    $Unpacked = Join-Path $Tmp 'unpacked'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($Zip, $Unpacked)
    if (-not (Test-Motif (Join-Path $Unpacked 'motif'))) { return (Fail "the download didn't hold Motif's skill, so nothing was installed.") }

    New-Item -ItemType Directory -Force -Path $Skills | Out-Null
    # Copy next to the installed one first, so a failed copy leaves it as it was.
    $New = Join-Path $Skills '.motif-new'
    if (Test-Path -LiteralPath $New) { Remove-Item -LiteralPath $New -Recurse -Force }
    Copy-Item -LiteralPath (Join-Path $Unpacked 'motif') -Destination $New -Recurse
    if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
    Move-Item -LiteralPath $New -Destination $Target
    if ($CommandFile) {
      New-Item -ItemType Directory -Force -Path $Commands | Out-Null
      Copy-Item -LiteralPath (Join-Path (Join-Path (Join-Path $Unpacked 'opencode') 'commands') 'motif.md') -Destination $CommandFile -Force
    }
  } catch {
    return (Fail "couldn't install Motif: $($_.Exception.Message)")
  } finally {
    Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  Say "installed Motif v$Version in $Target, for $Who."
  if ($CommandFile) { Say 'start it in OpenCode with /motif.' } else { Say 'start it the way your agent starts a skill (for example /motif).' }
  return 0
}

$code = Invoke-MotifInstall $Agent $Version $Uninstall.IsPresent
# Run as a file: exit with the code. Run as irm | iex: exit would close the window, so only set it.
if ($PSCommandPath) { exit $code } else { $global:LASTEXITCODE = $code }
```

Note: `Fail` returns `2` from its own function; each caller does `return (Fail …)`, so `Invoke-MotifInstall` returns 2.

- [ ] **Step 4: Run the tests**

Run (Windows): `cd cli && bun test test/install-script.test.ts`
Expected: PASS (all install.sh and install.ps1 tests).

- [ ] **Step 5: Commit**

```bash
git add install.ps1 cli/test/install-script.test.ts
git commit -m "feat(install): install.ps1, the same installer for Windows PowerShell, safe under irm | iex" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Install checks in each agent (script and CI)

**Files:**
- Create: `cli/scripts/agent-checks.ts`
- Create: `.github/workflows/agents.yml`
- Test: `cli/test/agent-checks.test.ts`

**Interfaces:**
- Consumes: `spawnArgs(exe, args)` from `cli/src/commands/connect.ts`; `SKILL_TGZ`, `SKILL_ZIP` (Task 5); `dist/agents`, `dist/agents-local` (Tasks 3–4).
- Produces:
  - `type CheckSource = { kind: "local"; marketplace: string; agents: string } | { kind: "github"; repo: string; branch: string }`
  - `interface AgentCheck { id: "codex" | "copilot" | "gemini" | "cursor" | "opencode"; label: string; steps: string[][]; list: string[]; env(home: string): Record<string, string>; installsSkill: boolean }`
  - `agentChecks(source: CheckSource, opts: { platform?: NodeJS.Platform; repo?: string; release?: { base: string; raw: string } }): AgentCheck[]`
  - `findSkills(root: string): string[]` (folders named `motif` holding `SKILL.md` and `bin/motif`)
  - `localRelease(dist: string, agentsDir: string): { base: string; raw: string; stop(): void }`
  - CLI: `bun scripts/agent-checks.ts --source local|github [--agents codex,gemini] [--doctor]` → one line per agent, exit 1 if any fails.

- [ ] **Step 1: Write the failing test**

`cli/test/agent-checks.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentChecks, findSkills, localRelease } from "../scripts/agent-checks";
import { SKILL_TGZ } from "../scripts/skill-archive";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const local = { kind: "local", marketplace: "/m", agents: "/a" } as const;
const github = { kind: "github", repo: "7mxd/motif", branch: "plugins" } as const;
const byId = (checks: ReturnType<typeof agentChecks>) => Object.fromEntries(checks.map((c) => [c.id, c]));

describe("the install checks", () => {
  test("cover the five agents, installing Motif as each one's README instructions say", () => {
    const g = byId(agentChecks(github, { platform: "linux", repo: "/r" }));
    expect(Object.keys(g)).toEqual(["codex", "copilot", "gemini", "cursor", "opencode"]);
    expect(g.codex!.steps).toEqual([["codex", "plugin", "marketplace", "add", "7mxd/motif"], ["codex", "plugin", "add", "motif@motif"]]);
    expect(g.copilot!.steps).toEqual([["copilot", "plugin", "marketplace", "add", "7mxd/motif"], ["copilot", "plugin", "install", "motif@motif"]]);
    expect(g.gemini!.steps).toEqual([["gemini", "extensions", "install", "https://github.com/7mxd/motif", "--ref", "plugins", "--auto-update", "--consent", "--skip-settings"]]);
    expect(g.cursor!.steps).toEqual([["cursor-agent", "plugin", "marketplace", "add", "https://github.com/7mxd/motif"]]);
    expect(g.opencode!.steps).toEqual([["sh", join("/r", "install.sh"), "--agent", "opencode"]]);
  });

  test("a local check installs from the built package and the local marketplace", () => {
    const l = byId(agentChecks(local, { platform: "linux", repo: "/r" }));
    expect(l.codex!.steps[0]).toEqual(["codex", "plugin", "marketplace", "add", "/m"]);
    expect(l.gemini!.steps[0]).toEqual(["gemini", "extensions", "install", "/a", "--consent", "--skip-settings"]);
  });

  test("on Windows, OpenCode's check runs install.ps1", () => {
    const w = byId(agentChecks(github, { platform: "win32", repo: "C:/r" }));
    expect(w.opencode!.steps[0]).toEqual(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join("C:/r", "install.ps1"), "-Agent", "opencode"]);
  });

  test("every agent runs in the throwaway home only", () => {
    for (const c of agentChecks(github, { platform: "linux", repo: "/r" })) {
      const env = c.env("/h");
      expect([c.id, env.HOME, env.USERPROFILE]).toEqual([c.id, "/h", "/h"]);
    }
    const e = byId(agentChecks(github, { platform: "linux", repo: "/r" }));
    expect(e.codex!.env("/h").CODEX_HOME).toBe(join("/h", ".codex"));
    expect(e.copilot!.env("/h").COPILOT_HOME).toBe(join("/h", ".copilot"));
    expect(e.gemini!.env("/h").GEMINI_CLI_HOME).toBe("/h");
    expect(e.opencode!.env("/h")).toMatchObject({ XDG_CONFIG_HOME: join("/h", ".config"), OPENCODE_DISABLE_CLAUDE_CODE: "1" });
  });

  test("a local OpenCode check downloads from the local release", () => {
    const l = byId(agentChecks(local, { platform: "linux", repo: "/r", release: { base: "http://127.0.0.1:1/release", raw: "http://127.0.0.1:1/raw" } }));
    expect(l.opencode!.env("/h")).toMatchObject({ MOTIF_DOWNLOAD_BASE: "http://127.0.0.1:1/release", MOTIF_RAW_BASE: "http://127.0.0.1:1/raw" });
  });

  test("finds installed skills wherever the agent put them", () => {
    const home = tempDir("motif-find-");
    const skill = join(home, ".codex/plugins/cache/motif/motif/0.2.0/skills/motif");
    mkdirSync(join(skill, "bin"), { recursive: true });
    writeFileSync(join(skill, "SKILL.md"), "---\nname: motif\n---\n");
    writeFileSync(join(skill, "bin/motif"), "#!/bin/sh\n");
    mkdirSync(join(home, "other/motif"), { recursive: true });
    expect(findSkills(home)).toEqual([skill]);
  });

  test("serves a local release: the skill archives, their checksums and the version", async () => {
    const dist = tempDir("motif-dist-");
    const agents = tempDir("motif-agentsdir-");
    writeFileSync(join(dist, SKILL_TGZ), "tgz");
    writeFileSync(join(dist, "motif-skill.zip"), "zip");
    mkdirSync(join(agents, "skills/motif"), { recursive: true });
    writeFileSync(join(agents, "skills/motif/VERSION"), "9.9.9\n");
    const release = localRelease(dist, agents);
    try {
      expect(await (await fetch(`${release.raw}/skills/motif/VERSION`)).text()).toBe("9.9.9\n");
      expect(await (await fetch(`${release.base}/${SKILL_TGZ}`)).text()).toBe("tgz");
      expect(await (await fetch(`${release.base}/SHA256SUMS`)).text()).toMatch(/^[0-9a-f]{64} {2}motif-skill\.tar\.gz\n[0-9a-f]{64} {2}motif-skill\.zip\n$/);
    } finally {
      release.stop();
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd cli && bun test test/agent-checks.test.ts`
Expected: FAIL — `Cannot find module '../scripts/agent-checks'`.

- [ ] **Step 3: Write `cli/scripts/agent-checks.ts`**

Use Task 1's facts for any command that differs (for example if `codex plugin add` doesn't exist, the Codex check stops after `marketplace add` and lists with `codex plugin marketplace list`; ledger the ruling).

```ts
// Installs Motif in each agent the way its README says, in a throwaway home, and checks that the agent lists the motif
// skill; with --doctor, it also runs the installed skill's tool through its bootstrap. Nobody signs in.
//   bun scripts/agent-checks.ts --source local     from dist/agents-local and dist/ (bun run packages, skill:archives first)
//   bun scripts/agent-checks.ts --source github    from GitHub, as people install it (after a release)
// Options: --agents codex,gemini (some agents only), --doctor (also run the tool).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnArgs } from "../src/commands/connect";
import { SKILL_TGZ, SKILL_ZIP } from "./skill-archive";

const REPO = resolve(import.meta.dir, "../..");

export type CheckSource = { kind: "local"; marketplace: string; agents: string } | { kind: "github"; repo: string; branch: string };

export interface AgentCheck {
  id: "codex" | "copilot" | "gemini" | "cursor" | "opencode";
  label: string;
  steps: string[][];
  list: string[];
  env(home: string): Record<string, string>;
  /** Whether the install puts the skill's files under the home (so --doctor can run its tool). */
  installsSkill: boolean;
}

export function agentChecks(
  source: CheckSource,
  opts: { platform?: NodeJS.Platform; repo?: string; release?: { base: string; raw: string } } = {},
): AgentCheck[] {
  const platform = opts.platform ?? process.platform;
  const repo = opts.repo ?? REPO;
  const home = (h: string) => ({ HOME: h, USERPROFILE: h });
  const marketplace = source.kind === "local" ? source.marketplace : source.repo;
  const gitUrl = source.kind === "local" ? source.marketplace : `https://github.com/${source.repo}`;
  const gemini = source.kind === "local" ? [source.agents] : [`https://github.com/${source.repo}`, "--ref", source.branch, "--auto-update"];
  const installer = platform === "win32"
    ? ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(repo, "install.ps1"), "-Agent", "opencode"]
    : ["sh", join(repo, "install.sh"), "--agent", "opencode"];
  const release = opts.release ? { MOTIF_DOWNLOAD_BASE: opts.release.base, MOTIF_RAW_BASE: opts.release.raw } : {};
  return [
    {
      id: "codex", label: "Codex", installsSkill: true,
      steps: [["codex", "plugin", "marketplace", "add", marketplace], ["codex", "plugin", "add", "motif@motif"]],
      list: ["codex", "plugin", "list"],
      env: (h) => ({ ...home(h), CODEX_HOME: join(h, ".codex") }),
    },
    {
      id: "copilot", label: "GitHub Copilot CLI", installsSkill: true,
      steps: [["copilot", "plugin", "marketplace", "add", marketplace], ["copilot", "plugin", "install", "motif@motif"]],
      list: ["copilot", "plugin", "list"],
      env: (h) => ({ ...home(h), COPILOT_HOME: join(h, ".copilot") }),
    },
    {
      id: "gemini", label: "Gemini CLI", installsSkill: true,
      steps: [["gemini", "extensions", "install", ...gemini, "--consent", "--skip-settings"]],
      list: ["gemini", "skills", "list"],
      env: (h) => ({ ...home(h), GEMINI_CLI_HOME: h }),
    },
    {
      id: "cursor", label: "Cursor CLI", installsSkill: false,
      steps: [["cursor-agent", "plugin", "marketplace", "add", gitUrl]],
      list: ["cursor-agent", "plugin", "marketplace", "list", "--format", "json"],
      env: (h) => home(h),
    },
    {
      id: "opencode", label: "OpenCode", installsSkill: true,
      steps: [installer],
      list: ["opencode", "debug", "skill"],
      env: (h) => ({
        ...home(h), ...release,
        XDG_CONFIG_HOME: join(h, ".config"), XDG_DATA_HOME: join(h, ".local", "share"), XDG_CACHE_HOME: join(h, ".cache"),
        OPENCODE_DISABLE_CLAUDE_CODE: "1",
      }),
    },
  ];
}

/** Folders named motif under root that hold SKILL.md and bin/motif. */
export function findSkills(root: string, depth = 10): string[] {
  const found: string[] = [];
  const walk = (dir: string, left: number) => {
    if (left < 0) return;
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      try {
        if (!statSync(path).isDirectory()) continue;
      } catch {
        continue;
      }
      if (name === "motif" && existsSync(join(path, "SKILL.md")) && existsSync(join(path, "bin", "motif"))) found.push(path);
      else if (name !== "node_modules") walk(path, left - 1);
    }
  };
  walk(root, depth);
  return found.sort();
}

/** Serves dist/'s skill archives with their checksums, and the package's VERSION, as a release and the plugins branch would. */
export function localRelease(dist: string, agentsDir: string): { base: string; raw: string; stop(): void } {
  const files = [SKILL_TGZ, SKILL_ZIP].sort();
  const sums = files.map((f) => `${createHash("sha256").update(readFileSync(join(dist, f))).digest("hex")}  ${f}\n`).join("");
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/release/SHA256SUMS") return new Response(sums);
      for (const f of files) if (path === `/release/${f}`) return new Response(Bun.file(join(dist, f)));
      if (path === "/raw/skills/motif/VERSION") return new Response(Bun.file(join(agentsDir, "skills", "motif", "VERSION")));
      return new Response("not found", { status: 404 });
    },
  });
  const root = `http://127.0.0.1:${server.port}`;
  return { base: `${root}/release`, raw: `${root}/raw`, stop: () => server.stop(true) };
}

async function run(cmd: string[], env: Record<string, string>, timeoutMs = 300_000): Promise<{ code: number; output: string }> {
  const exe = Bun.which(cmd[0]!) ?? cmd[0]!;
  const { cmd: argv, verbatim } = spawnArgs(exe, cmd.slice(1));
  const proc = Bun.spawn(argv, { env: { ...process.env, ...env }, stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsVerbatimArguments: verbatim });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  return { code, output: `${out}${err}`.trim() };
}

const tail = (text: string) => text.split("\n").slice(-6).join("\n    ");

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const kind = value("--source");
  if (kind !== "local" && kind !== "github") {
    console.error("Usage: bun scripts/agent-checks.ts --source local|github [--agents codex,gemini] [--doctor]");
    process.exit(2);
  }
  const only = value("--agents")?.split(",");
  const doctor = args.includes("--doctor");
  const release = kind === "local" ? localRelease(join(REPO, "dist"), join(REPO, "dist", "agents")) : null;
  const source: CheckSource = kind === "local"
    ? { kind, marketplace: join(REPO, "dist", "agents-local"), agents: join(REPO, "dist", "agents") }
    : { kind, repo: "7mxd/motif", branch: "plugins" };
  let failed = 0;
  for (const check of agentChecks(source, { release: release ?? undefined })) {
    if (only && !only.includes(check.id)) continue;
    const home = mkdtempSync(join(tmpdir(), `motif-${check.id}-`));
    const env = check.env(home);
    for (const dir of [env.CODEX_HOME, env.COPILOT_HOME, env.XDG_CONFIG_HOME].filter(Boolean)) mkdirSync(dir!, { recursive: true });
    const problem = await (async () => {
      for (const step of check.steps) {
        const r = await run(step, env);
        if (r.code !== 0) return `"${step.join(" ")}" failed:\n    ${tail(r.output)}`;
      }
      const listed = await run(check.list, env);
      if (listed.code !== 0 || !listed.output.includes("motif")) return `"${check.list.join(" ")}" doesn't list motif:\n    ${tail(listed.output)}`;
      if (doctor && check.installsSkill) {
        const skill = findSkills(home)[0];
        if (!skill) return "no skills/motif folder was installed under the agent's home";
        const tool = process.platform === "win32" ? [join(skill, "bin", "motif.cmd")] : ["sh", join(skill, "bin", "motif")];
        const d = await run([...tool, "doctor", "--json"], { ...env, MOTIF_HOME: join(home, ".motif") });
        if (d.code !== 0 && d.code !== 1) return `the installed skill's tool didn't run:\n    ${tail(d.output)}`;
      }
      return null;
    })();
    console.log(problem ? `✗ ${check.label}: ${problem}` : `✓ ${check.label}: installs Motif and lists its skill${doctor && check.installsSkill ? "; its tool runs" : ""}`);
    if (problem) failed++;
    rmSync(home, { recursive: true, force: true });
  }
  release?.stop();
  process.exit(failed ? 1 : 0);
}
```

- [ ] **Step 4: Run the tests**

Run: `cd cli && bun test test/agent-checks.test.ts && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Write `.github/workflows/agents.yml`**

```yaml
name: agents

# Each agent installs Motif's package and lists its skill, without signing in. Pinned versions on every push;
# the agents' latest versions every Monday, so a change in an agent shows up before people hit it.
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: "17 6 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  install:
    runs-on: ubuntu-latest
    env:
      CODEX: ${{ github.event_name == 'schedule' && 'latest' || '0.163.0' }}
      COPILOT: ${{ github.event_name == 'schedule' && 'latest' || '1.0.98' }}
      GEMINI: ${{ github.event_name == 'schedule' && 'latest' || '0.64.0' }}
      OPENCODE: ${{ github.event_name == 'schedule' && 'latest' || '1.19.3' }}
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: cli/.bun-version
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install
        working-directory: cli
        run: bun install --frozen-lockfile
      - name: Build the package and the skill archives
        working-directory: cli
        run: |
          bun run packages
          bun run skill:archives
      - name: Install the agents' CLIs (no sign-in)
        run: |
          npm install -g "@openai/codex@$CODEX" "@github/copilot@$COPILOT" "@google/gemini-cli@$GEMINI" "opencode-ai@$OPENCODE"
          curl https://cursor.com/install -fsS | bash
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
      - name: Each agent installs Motif from the build and lists its skill
        working-directory: cli
        run: bun scripts/agent-checks.ts --source local
```

Add to `cli/test/release.test.ts` (it already reads workflows):

```ts
describe("the agents workflow", () => {
  const wf = readFileSync(join(REPO, ".github/workflows/agents.yml"), "utf8").replace(/\r\n/g, "\n");

  test("installs every agent's CLI without signing in and checks Motif installs in each, from the build", () => {
    for (const s of ["@openai/codex@$CODEX", "@github/copilot@$COPILOT", "@google/gemini-cli@$GEMINI", "opencode-ai@$OPENCODE", "https://cursor.com/install", "bun run packages", "bun run skill:archives", "bun scripts/agent-checks.ts --source local"]) {
      expect(wf).toContain(s);
    }
    expect(wf).not.toContain("secrets.");
    expect(wf).toContain("permissions:\n  contents: read");
  });

  test("pins the agents' versions, and tries their latest versions every week", () => {
    expect(wf).toContain("cron:");
    expect(wf).toContain("github.event_name == 'schedule' && 'latest' || '0.163.0'");
  });
});
```

Run: `cd cli && bun test test/release.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/scripts/agent-checks.ts cli/test/agent-checks.test.ts .github/workflows/agents.yml cli/test/release.test.ts
git commit -m "test(agents): install Motif in each agent without signing in, on every push and weekly with their latest versions" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

The workflow first runs when `main` is pushed (approval A, after plan 3B). Cursor's commands and anything Task 1 couldn't check locally are confirmed there; a failure then is fixed before tagging.

---

### Task 9: The release workflow publishes the package

**Files:**
- Modify: `.github/workflows/release.yml` (`plugin`, `publish`, new `agents` job)
- Test: `cli/test/release.test.ts`

**Interfaces:**
- Consumes: `bun run packages`, `bun run skill:archives`, `cli/scripts/agent-checks.ts --source github --doctor`.
- Produces: release assets `motif-skill.zip`, `motif-skill.tar.gz`; the `plugins` branch and `plugins-v<version>` tag on releases without a suffix.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("the release workflow", …)` in `cli/test/release.test.ts`:

```ts
  test("builds the package for other agents and the skill archives, checks their versions, and keeps the branch's files for publishing", () => {
    const plugin = section("plugin");
    for (const s of [
      "bun run packages", "bun run skill:archives", "dist/agents/plugin.json", "dist/agents/gemini-extension.json",
      "tar -czf dist/plugins-tree.tar.gz -C dist/agents .", "dist/motif-skill.zip", "dist/motif-skill.tar.gz", "name: plugins-tree",
    ]) expect(plugin).toContain(s);
  });

  test("publishes the skill archives with the release, and the plugins branch only from its own artifact", () => {
    const publish = section("publish");
    for (const s of [
      "pattern: motif-*", "name: plugins-tree", 'tar -xzf plugins-tree/plugins-tree.tar.gz -C "$dir"',
      'commit -q -m "Motif $GITHUB_REF_NAME"', 'git -C "$dir" push origin "HEAD:refs/heads/plugins"', '"refs/tags/plugins-$GITHUB_REF_NAME"',
    ]) expect(publish).toContain(s);
    expect(publish.indexOf("gh release create")).toBeLessThan(publish.indexOf("refs/heads/plugins"));
  });

  test.skipIf(!sh)("moves the plugins branch only for a release without a suffix (review focus)", () => {
    const line = section("publish").split("\n").find((l) => l.trim().startsWith('case "$GITHUB_REF_NAME" in *-*)'));
    expect(line).toBeDefined();
    const moves = (tag: string) =>
      Bun.spawnSync([sh!, "-c", `${line!.trim()}\necho moved`], { env: { ...process.env, GITHUB_REF_NAME: tag } }).stdout.toString().includes("moved");
    expect([moves("v1.0.0-rc.1"), moves("v0.3.0-beta.2"), moves("v0.2.0"), moves("v1.0.0")]).toEqual([false, false, true, true]);
  });

  test("checks every agent's install from GitHub on Windows, macOS and Linux after publishing, without the token", () => {
    const agents = section("agents");
    expect(agents).toContain("needs: publish");
    for (const os of ["ubuntu-latest", "macos-latest", "windows-latest"]) expect(agents).toContain(os);
    for (const s of ["@openai/codex@$CODEX", "@github/copilot@$COPILOT", "@google/gemini-cli@$GEMINI", "opencode-ai@$OPENCODE", "https://cursor.com/install", "bun scripts/agent-checks.ts --source github --doctor", "persist-credentials: false"]) {
      expect(agents).toContain(s);
    }
    expect(agents).not.toContain("GH_TOKEN");
  });
```

(`sh` is already defined above these tests in that file, as `const sh = Bun.which("sh");`.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd cli && bun test test/release.test.ts`
Expected: FAIL — the new strings and the `agents` job aren't in the workflow (`section("agents")` finds nothing).

- [ ] **Step 3: Change `.github/workflows/release.yml`**

In the `plugin` job, after the Claude Code build step and before its upload, add:

```yaml
      - name: Build the package for other agents and the skill archives
        working-directory: cli
        run: |
          bun run packages
          bun run skill:archives
      - name: Every manifest carries the tag's version
        if: startsWith(github.ref, 'refs/tags/')
        shell: bash
        run: |
          v="${GITHUB_REF_NAME#v}"
          test "$(jq -r .version dist/agents/plugin.json)" = "$v"
          test "$(jq -r .version dist/agents/gemini-extension.json)" = "$v"
      - name: Pack the plugins branch's files (keeps the bootstrap's executable flag)
        run: tar -czf dist/plugins-tree.tar.gz -C dist/agents .
```

and after the existing `motif-claude-code.zip` upload add:

```yaml
      - uses: actions/upload-artifact@v4
        with:
          name: motif-skill
          path: |
            dist/motif-skill.zip
            dist/motif-skill.tar.gz
          if-no-files-found: error
      - uses: actions/upload-artifact@v4
        with:
          name: plugins-tree
          path: dist/plugins-tree.tar.gz
          if-no-files-found: error
```

In the `publish` job, replace the single download step with:

```yaml
      - uses: actions/download-artifact@v4
        with:
          pattern: motif-*
          path: dist
          merge-multiple: true
      - uses: actions/download-artifact@v4
        with:
          name: plugins-tree
          path: plugins-tree
```

and after "Create release" add:

```yaml
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

Add a new job after `check`:

```yaml
  agents:
    needs: publish
    # A pre-release leaves the plugins branch as it was, so there's nothing new to check.
    if: ${{ !contains(github.ref_name, '-') }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    env:
      CODEX: 0.163.0
      COPILOT: 1.0.98
      GEMINI: 0.64.0
      OPENCODE: 1.19.3
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: cli/.bun-version
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install
        working-directory: cli
        run: bun install --frozen-lockfile
      - name: Install the agents' CLIs (no sign-in)
        shell: bash
        run: npm install -g "@openai/codex@$CODEX" "@github/copilot@$COPILOT" "@google/gemini-cli@$GEMINI" "opencode-ai@$OPENCODE"
      - name: Install the Cursor CLI (macOS, Linux)
        if: runner.os != 'Windows'
        run: |
          curl https://cursor.com/install -fsS | bash
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
      - name: Install the Cursor CLI (Windows)
        if: runner.os == 'Windows'
        shell: pwsh
        run: irm 'https://cursor.com/install?win32=true' | iex
      - name: Each agent installs Motif from GitHub, lists its skill and runs its tool
        working-directory: cli
        run: bun scripts/agent-checks.ts --source github --doctor
```

(If Task 1's facts say the Windows Cursor installer puts `cursor-agent` somewhere not on PATH, add that folder with `Add-Content $env:GITHUB_PATH <folder>` in the same step and ledger it.)

- [ ] **Step 4: Run the tests**

Run: `cd cli && bun test test/release.test.ts`
Expected: PASS (including the existing least-privilege test: the new job has no `GH_TOKEN`, and only `publish` has `contents: write`).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml cli/test/release.test.ts
git commit -m "feat(release): publish the package to the plugins branch and the skill archives, and check every agent's install" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Docs

**Files:**
- Create: `plugin/agents/README.md` (the Develop guide)
- Create: `docs/decisions/0005-agent-packages.md`
- Modify: `docs/specs/2026-10-12-motif-core-design.md` (§4 Part 3 row, §5.5)
- Test: `cli/test/agents-package.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: docs only.

- [ ] **Step 1: Write the failing test**

Append to `cli/test/agents-package.test.ts`:

```ts
describe("the docs for the package", () => {
  const read = (rel: string) => readFileSync(join(REPO, rel), "utf8").replace(/\r\n/g, "\n");

  test("the Develop guide says how to build the package and try it in every agent", () => {
    const guide = read("plugin/agents/README.md");
    for (const s of [
      "bun run packages", "bun run skill:archives", "dist/agents-local", "codex plugin marketplace add", "copilot plugin marketplace add",
      "gemini extensions link", "cursor-agent", "install.sh", "install.ps1", "MOTIF_BIN", "bun scripts/agent-checks.ts --source local", "plugins branch",
    ]) expect(guide).toContain(s);
  });

  test("decision 0005 records the plugins branch, /motif and the install script, and the core spec links Part 3's spec", () => {
    const decision = read("docs/decisions/0005-agent-packages.md");
    for (const s of ["plugins", "/motif", "install.sh", "2026-10-17-motif-part3-agents-design.md"]) expect(decision).toContain(s);
    const core = read("docs/specs/2026-10-12-motif-core-design.md");
    expect(core).toContain("2026-10-17-motif-part3-agents-design.md");
    expect(core).toContain("skill/agents.md");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd cli && bun test test/agents-package.test.ts`
Expected: FAIL — `plugin/agents/README.md` doesn't exist.

- [ ] **Step 3: Write `plugin/agents/README.md`**

```markdown
# Motif for Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode

The files here, with `skill/`, make the package every agent but Claude Code installs Motif from. Each release builds it and commits it to the `plugins` branch; people install it as [the README](../../README.md#install) says. Nobody edits the plugins branch by hand.

- `commands/` are Gemini CLI's `/motif` commands.
- `opencode/commands/motif.md` is OpenCode's `/motif` command, which `install.sh` and `install.ps1` add.
- `branch-README.md` becomes the plugins branch's README.

## Build

From the repository's `cli` folder:

- `bun run packages` builds `dist/agents/` (the package) and `dist/agents-local/` (a local marketplace holding it, for every agent with a plugin system).
- `bun run skill:archives` builds `dist/motif-skill.zip` and `dist/motif-skill.tar.gz`, which the install scripts download.

## Try a build

Point the skill at a local build of the tool first: in `cli`, `bun run build`, then set `MOTIF_BIN` to `dist/motif` (`dist\motif.exe` on Windows) in the terminal you start the agent from. Then:

- **Codex:** `codex plugin marketplace add <repo>/dist/agents-local`, then `codex plugin add motif@motif`.
- **GitHub Copilot CLI:** `copilot plugin marketplace add <repo>/dist/agents-local`, then `copilot plugin install motif@motif`.
- **Cursor CLI:** `cursor-agent plugin marketplace add <repo>/dist/agents-local`, or start it with `--plugin-dir <repo>/dist/agents`.
- **Gemini CLI:** `gemini extensions link <repo>/dist/agents` (a link, so a rebuild shows up at once).
- **OpenCode, or any agent that reads `~/.agents/skills`:** copy `dist/agents/skills/motif` into `~/.config/opencode/skills/` or `~/.agents/skills/`. The install scripts (`install.sh`, `install.ps1` at the repository's root) do the same from a release.

Remove a marketplace or extension when you're done (`codex plugin marketplace remove motif`, `gemini extensions uninstall motif`, and so on).

## Check every agent

`bun scripts/agent-checks.ts --source local` installs the build in each agent whose CLI is on your PATH, in a throwaway home, and checks that it lists the motif skill. Nobody signs in. CI runs it on every push (`.github/workflows/agents.yml`), and after each release from GitHub on Windows, macOS and Linux.
```

- [ ] **Step 4: Write `docs/decisions/0005-agent-packages.md`**

```markdown
# 0005 — How other agents install Motif

- Date: 2026-10-17
- Status: Accepted
- Context: Part 3 brings Motif to Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode ([the Part 3 spec](../specs/2026-10-17-motif-part3-agents-design.md)). All five read Agent Skills; four have plugin systems that install from a git branch or tag, not from a release zip as Claude Code does. A skill installed from `main` between releases could describe features its downloaded tool doesn't have yet.

## Decisions

1. **A `plugins` branch holds only the built package**, replaced by the release workflow at each release without a suffix and tagged `plugins-v<version>`. Installs are small and always match a published tool. `main` stays the source; Claude Code keeps its checksum-pinned release zip.
2. **Each agent's marketplace file on `main` points at that branch** (`.agents/plugins/`, `.cursor-plugin/`, `.github/plugin/`), so nothing changes on `main` after a release. Gemini CLI installs the branch as an extension (`--ref plugins --auto-update`).
3. **`/motif` is the entry everywhere but Claude Code** (`$motif` in Codex): one name, which clashes with no agent's own `/init` or `/review`. Gemini CLI also gets `/motif:design`, `/motif:init`, `/motif:feature` and `/motif:review`, as Claude Code has.
4. **OpenCode and other agents without plugins use Motif's install script** (`install.sh`, `install.ps1`), which downloads the skill from the release, checks it against `SHA256SUMS`, and installs it where OpenCode reads skills or in `~/.agents/skills`.
5. **`skill/agents.md` is the one place in `skill/` that names agents' tools**: where each agent installs the skill, its question prompt, and its shell.

## Consequences

- Every release publishes `motif-skill.zip` and `motif-skill.tar.gz` too, and checks every agent's install from GitHub on Windows, macOS and Linux; CI checks them from the build on every push and with the agents' latest versions every week.
- The plugins branch is written by CI only; a fix ships as a new release.
```

- [ ] **Step 5: Edit the core spec**

In `docs/specs/2026-10-12-motif-core-design.md` §4's table, change the Part 3 row's contents cell to start with "Build step generating native packages for Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, OpenCode ([its spec](2026-10-17-motif-part3-agents-design.md), [decision 0005](../decisions/0005-agent-packages.md)); …" (keep the rest of the cell). In §5.5, append: "Per-agent notes live in one file, `skill/agents.md` (where each agent installs the skill, its question prompt, its shell); it is the only file in `skill/` that names an agent's tools."

- [ ] **Step 6: Run the tests**

Run: `cd cli && bun test test/agents-package.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the whole suite, then commit**

Run: `cd cli && bun run typecheck && bun test --timeout 300000 > ../.superpowers/3a-suite.log 2>&1; echo "exit $?"; tail -6 ../.superpowers/3a-suite.log`
Expected: `exit 0`, 0 fail.

```bash
git add plugin/agents/README.md docs/decisions/0005-agent-packages.md docs/specs/2026-10-12-motif-core-design.md cli/test/agents-package.test.ts
git commit -m "docs(packages): how to build and try the package in each agent, and decision 0005" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## After this plan

Plan 3B adds `motif connect` and `doctor` for every agent, `agents.md`'s sign-in section, the source notes' wording, the v0.2.0 release notes and the version bump. Then the approval points, as for v0.1.0:

- **A:** merge to `main`, push (the new `agents` workflow runs for the first time), and run the release workflow as a dry run.
- **B:** tag `v0.2.0`; the release publishes, the `plugins` branch is created, and every agent's install is checked from GitHub.
- **C:** Claude Code's marketplace and the README's install section (every agent's commands, with a test that they match `agent-checks.ts`), then a real install here in Claude Code.
