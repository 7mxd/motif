import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL_TGZ, SKILL_ZIP, skillArchiveEntries, skillTarGz, skillZip } from "../scripts/skill-archive";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO, "skill/VERSION"), "utf8").trim();
const COMMAND = readFileSync(join(REPO, "plugin/agents/opencode/commands/motif.md"), "utf8");
const slash = (p: string) => p.replace(/\\/g, "/");

let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  const entries = skillArchiveEntries();
  const tgz = new Uint8Array(skillTarGz(entries));
  const zip = new Uint8Array(skillZip(entries));
  const sum = (data: Uint8Array, name: string) => `${createHash("sha256").update(data).digest("hex")}  ${name}\n`;
  const sums = `${sum(tgz, SKILL_TGZ)}${sum(zip, SKILL_ZIP)}`;
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const path = new URL(req.url).pathname;
      // Served as bytes, as a server may label it: install.ps1 must still read it as text (the local agent check, Task 8).
      if (path === "/raw/skills/motif/VERSION") return new Response(`${VERSION}\n`, { headers: { "content-type": "application/octet-stream" } });
      if (path === `/ok/${SKILL_TGZ}` || path === `/bad/${SKILL_TGZ}`) return new Response(tgz);
      if (path === `/ok/${SKILL_ZIP}` || path === `/bad/${SKILL_ZIP}`) return new Response(zip);
      if (path === "/ok/SHA256SUMS") return new Response(sums);
      if (path === "/bad/SHA256SUMS") return new Response(`${"0".repeat(64)}  ${SKILL_TGZ}\n${"0".repeat(64)}  ${SKILL_ZIP}\n`);
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
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      HOME: home,
      MOTIF_RAW_BASE: `http://127.0.0.1:${server.port}/raw`,
      MOTIF_DOWNLOAD_BASE: `http://127.0.0.1:${server.port}/${base}`,
    };
    delete env.XDG_CONFIG_HOME;
    Object.assign(env, extra);
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
    expect(existsSync(join(config, "opencode/commands/motif.md"))).toBe(true);
    const r = await run(home, ["--agent", "opencode", "--uninstall"], "ok", { XDG_CONFIG_HOME: config });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(config, "opencode/skills/motif"))).toBe(false);
    expect(existsSync(join(config, "opencode/commands/motif.md"))).toBe(false);
    expect(existsSync(join(config, "opencode/skills/other"))).toBe(true);
  }, 60_000);

  test("--version pins a version without asking which is the latest", async () => {
    const r = await run(freshHome(), ["--agent", "agents", "--version", VERSION], "ok", { MOTIF_RAW_BASE: `http://127.0.0.1:${server.port}/nowhere` });
    expect({ code: r.exitCode, out: r.output }).toMatchObject({ code: 0 });
  }, 60_000);

  test("an unknown option is refused in plain words", async () => {
    const r = await run(freshHome(), ["--everything"]);
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain('unknown option "--everything"');
  }, 60_000);

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
});

const isWin = process.platform === "win32";

describe.skipIf(!isWin)("install.ps1", () => {
  const freshHome = () => {
    const home = join(tempDir("motif-install-ps-"), "home with space");
    mkdirSync(home, { recursive: true });
    return home;
  };
  const envFor = (home: string, base = "ok", extra: Record<string, string> = {}) => {
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      USERPROFILE: home,
      HOME: home,
      MOTIF_RAW_BASE: `http://127.0.0.1:${server.port}/raw`,
      MOTIF_DOWNLOAD_BASE: `http://127.0.0.1:${server.port}/${base}`,
    };
    delete env.XDG_CONFIG_HOME;
    return Object.assign(env, extra);
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
    expect({ code: r.exitCode, out: r.output }).toMatchObject({ code: 0 });
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
    mkdirSync(join(other, ".agents/skills/mine"), { recursive: true });
    await run(file(["-Agent", "agents"]), envFor(other));
    const u = await run(file(["-Agent", "agents", "-Uninstall"]), envFor(other));
    expect(u.exitCode).toBe(0);
    expect(existsSync(join(other, ".agents/skills/motif"))).toBe(false);
    expect(existsSync(join(other, ".agents/skills/mine"))).toBe(true);
  }, 180_000);

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
});

describe("install.sh reads SHA256SUMS in either form (backlog)", () => {
  test('a "hash *name" line is accepted', () => {
    const script = readFileSync(join(import.meta.dir, "../../install.sh"), "utf8");
    expect(script).not.toContain('grep " $ASSET\\$"');
    expect(script).toContain("sub(/^\\*/");
  });
});
