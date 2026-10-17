import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

  test("list the way each agent shows its skills (Copilot's plugin list drops some installs: Task 1 facts)", () => {
    const g = byId(agentChecks(github, { platform: "linux", repo: "/r" }));
    expect(g.codex!.list).toEqual(["codex", "plugin", "list"]);
    expect(g.copilot!.list).toEqual(["copilot", "skill", "list"]);
    expect(g.gemini!.list).toEqual(["gemini", "skills", "list"]);
    expect(g.opencode!.list).toEqual(["opencode", "debug", "skill"]);
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

  test("prepare each throwaway home: Codex's folder, and Gemini without its folder-trust prompt, which waits forever with no terminal", () => {
    const home = tempDir("motif-setup-");
    for (const c of agentChecks(github, { platform: "linux", repo: "/r" })) c.setup(home);
    expect(existsSync(join(home, ".codex"))).toBe(true);
    expect(JSON.parse(readFileSync(join(home, ".gemini", "settings.json"), "utf8"))).toEqual({ security: { folderTrust: { enabled: false } } });
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
