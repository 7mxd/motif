import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AgentCheck, agentChecks, checkAgent, findSkills, localRelease, run } from "../scripts/agent-checks";
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

describe("what counts as installed (final review)", () => {
  const checks = byId(agentChecks(github, { platform: "linux", repo: "/r" }));
  // Outputs as the agents printed them in Task 1, and failures that still mention "motif" in a path or a URL.
  const seen: Record<string, [string, string]> = {
    codex: [
      "Marketplace `motif`\nC:\\x\\.agents\\plugins\\marketplace.json\n\nPLUGIN       STATUS              VERSION  SOURCE\nmotif@motif  installed, enabled  0.1.0    C:\\x\\motif\n",
      "Marketplace `motif`\nC:\\Temp\\motif-codex-1\\.agents\\plugins\\marketplace.json\n\nPLUGIN  STATUS  VERSION  SOURCE\n",
    ],
    copilot: [
      "Plugin skills:\n  motif - Designs and builds polished, consistent app UI.\n\nBuiltin skills:\n  github-pr-media - Upload an image.\n",
      "Builtin skills:\n  github-pr-media - Upload an image. Logs: C:\\Temp\\motif-copilot-1\\.copilot\\logs\n",
    ],
    gemini: [
      "motif [Enabled]\n  Description: Designs and builds polished UI.\n  Location:    C:\\h\\.gemini\\extensions\\motif\\skills\\motif\\SKILL.md\n",
      "Loaded extension from C:\\Temp\\motif-gemini-1\\.gemini\\extensions\\motif\nNo skills discovered.\n",
    ],
    opencode: [
      'INFO starting\n[{"name":"customize-opencode","location":"<built-in>"},{"name":"motif","location":"C:\\\\h\\\\.config\\\\opencode\\\\skills\\\\motif\\\\SKILL.md"}]',
      '[{"name":"customize-opencode","location":"<built-in>","content":"see C:\\\\Temp\\\\motif-opencode-1"}]',
    ],
    cursor: ['[{"name":"motif","scope":"user","url":"https://github.com/7mxd/motif"}]', '[{"name":"other","scope":"user","url":"https://github.com/7mxd/motif"}]'],
  };

  test("each agent's listing must name the motif skill (or Cursor's marketplace) itself, not just mention the word", () => {
    for (const [id, [yes, no]] of Object.entries(seen)) {
      expect([id, checks[id]!.listed(yes)]).toEqual([id, true]);
      expect([id, checks[id]!.listed(no)]).toEqual([id, false]);
    }
  });
});

describe("running a check (final review)", () => {
  const bun = process.execPath;
  const homes: string[] = [];
  const fake = (steps: string[][], listOutput: string, cli = bun): AgentCheck => ({
    id: "codex",
    label: "Fake agent",
    installsSkill: false,
    steps,
    list: [cli, "-e", `console.log(${JSON.stringify(listOutput)})`],
    listed: (out) => /^motif@motif\s+installed/m.test(out),
    env: (h) => {
      homes.push(h);
      return { HOME: h, USERPROFILE: h };
    },
    setup: () => {},
  });

  test("a command that isn't on PATH is reported, not thrown", async () => {
    const r = await run(["no-such-agent-cli-for-motif-checks", "--version"], {});
    expect(r.code).toBe(127);
    expect(r.output).toContain("isn't on PATH");
  });

  test("an agent whose CLI isn't installed is skipped in a local run and fails a release check", async () => {
    const missing = fake([["no-such-agent-cli-for-motif-checks"]], "", "no-such-agent-cli-for-motif-checks");
    expect((await checkAgent(missing, { doctor: false, missingIsSkip: true })).status).toBe("skipped");
    const failed = await checkAgent(missing, { doctor: false, missingIsSkip: false });
    expect(failed.status).toBe("failed");
    expect(failed.detail).toContain("isn't on PATH");
  });

  test("passes when the listing names the plugin, fails when a step fails, and removes its home either way", async () => {
    const ok = await checkAgent(fake([[bun, "-e", "process.exit(0)"]], "motif@motif  installed, enabled  0.2.0"), { doctor: false, missingIsSkip: false });
    expect(ok).toMatchObject({ status: "ok" });
    const bad = await checkAgent(fake([[bun, "-e", "console.log('no luck'); process.exit(3)"]], ""), { doctor: false, missingIsSkip: false });
    expect(bad.status).toBe("failed");
    expect(bad.detail).toContain("no luck");
    expect(homes.length).toBeGreaterThanOrEqual(2);
    for (const h of homes) expect([h, existsSync(h)]).toEqual([h, false]);
    expect(homes.every((h) => !/motif/i.test(h.split(/[\\/]/).pop()!))).toBe(true);
  });
});

describe("leaving an agent out of a run", () => {
  test("--skip leaves an agent out and says so (the release check on CI's macOS machine)", () => {
    const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "../scripts/agent-checks.ts"), "--source", "github", "--agents", "cursor", "--skip", "cursor"]);
    expect({ code: r.exitCode, out: r.stdout.toString() }).toMatchObject({ code: 0 });
    expect(r.stdout.toString()).toContain("○ Cursor CLI: skipped (--skip cursor)");
  });
});

describe("Cursor's check and its key (Cursor's CLI needs a sign-in even to add a marketplace)", () => {
  test("Cursor signs in with the key it's given, and no other agent gets it", () => {
    const checks = byId(agentChecks(github, { platform: "linux", repo: "/r", cursorKey: "cursor-key-1" }));
    expect(checks.cursor!.env("/h").CURSOR_API_KEY).toBe("cursor-key-1");
    expect(checks.cursor!.unavailable).toBeUndefined();
    for (const id of ["codex", "copilot", "gemini", "opencode"]) expect([id, "CURSOR_API_KEY" in checks[id]!.env("/h")]).toEqual([id, false]);
  });

  test("without a key, the release check of Cursor fails and names the secret", async () => {
    const cursor = byId(agentChecks(github, { platform: "linux", repo: "/r" })).cursor!;
    expect(cursor.unavailable).toContain("CURSOR_API_KEY");
    const failed = await checkAgent(cursor, { doctor: false, missingIsSkip: false });
    expect(failed.status).toBe("failed");
    expect(failed.detail).toContain("CURSOR_API_KEY");
  });

  test("on a push, Cursor waits for the release check: its CLI adds marketplaces only from a git URL (second agents run)", async () => {
    const cursor = byId(agentChecks(local, { platform: "linux", repo: "/r", cursorKey: "cursor-key-1" })).cursor!;
    expect(cursor.unavailable).toContain("git URL");
    const skipped = await checkAgent(cursor, { doctor: false, missingIsSkip: true });
    expect(skipped).toMatchObject({ status: "skipped" });
    expect(skipped.detail).toContain("after a release");
  });

  test("the key never reaches another agent's processes, nor the tool the skill downloads", async () => {
    const before = { motif: process.env.MOTIF_CURSOR_API_KEY, cursor: process.env.CURSOR_API_KEY };
    process.env.MOTIF_CURSOR_API_KEY = "secret-cursor-key";
    process.env.CURSOR_API_KEY = "secret-cursor-key";
    try {
      const script = "console.log([process.env.MOTIF_CURSOR_API_KEY, process.env.CURSOR_API_KEY].join('|'))";
      expect((await run([process.execPath, "-e", script], {})).output).toBe("|");
      expect((await run([process.execPath, "-e", script], { CURSOR_API_KEY: "given" })).output).toBe("|given");
    } finally {
      for (const [k, v] of [["MOTIF_CURSOR_API_KEY", before.motif], ["CURSOR_API_KEY", before.cursor]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
