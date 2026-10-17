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
});
