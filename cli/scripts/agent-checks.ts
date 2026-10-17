// Installs Motif in each agent the way its README says, in a throwaway home, and checks that the agent lists the motif
// skill; with --doctor, it also runs the installed skill's tool through its bootstrap. Nobody signs in.
//   bun scripts/agent-checks.ts --source local     from dist/agents-local and dist/ (bun run packages, skill:archives first)
//   bun scripts/agent-checks.ts --source github    from GitHub, as people install it (after a release)
// Options: --agents codex,gemini (some agents only), --doctor (also run the tool).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  /** Prepares the throwaway home before the first step. */
  setup(home: string): void;
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
  const nothing = () => {};
  const marketplace = source.kind === "local" ? source.marketplace : source.repo;
  const gitUrl = source.kind === "local" ? source.marketplace : `https://github.com/${source.repo}`;
  const gemini = source.kind === "local" ? [source.agents] : [`https://github.com/${source.repo}`, "--ref", source.branch, "--auto-update"];
  const installer = platform === "win32"
    ? ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(repo, "install.ps1"), "-Agent", "opencode"]
    : ["sh", join(repo, "install.sh"), "--agent", "opencode"];
  const release: Record<string, string> = opts.release ? { MOTIF_DOWNLOAD_BASE: opts.release.base, MOTIF_RAW_BASE: opts.release.raw } : {};
  return [
    {
      id: "codex", label: "Codex", installsSkill: true,
      steps: [["codex", "plugin", "marketplace", "add", marketplace], ["codex", "plugin", "add", "motif@motif"]],
      list: ["codex", "plugin", "list"],
      env: (h) => ({ ...home(h), CODEX_HOME: join(h, ".codex") }),
      setup: (h) => mkdirSync(join(h, ".codex"), { recursive: true }),
    },
    {
      id: "copilot", label: "GitHub Copilot CLI", installsSkill: true,
      steps: [["copilot", "plugin", "marketplace", "add", marketplace], ["copilot", "plugin", "install", "motif@motif"]],
      list: ["copilot", "skill", "list"],
      env: (h) => ({ ...home(h), COPILOT_HOME: join(h, ".copilot") }),
      setup: nothing,
    },
    {
      id: "gemini", label: "Gemini CLI", installsSkill: true,
      steps: [["gemini", "extensions", "install", ...gemini, "--consent", "--skip-settings"]],
      list: ["gemini", "skills", "list"],
      env: (h) => ({ ...home(h), GEMINI_CLI_HOME: h }),
      setup: (h) => {
        mkdirSync(join(h, ".gemini"), { recursive: true });
        writeFileSync(join(h, ".gemini", "settings.json"), `${JSON.stringify({ security: { folderTrust: { enabled: false } } })}\n`);
      },
    },
    {
      id: "cursor", label: "Cursor CLI", installsSkill: false,
      steps: [["cursor-agent", "plugin", "marketplace", "add", gitUrl]],
      list: ["cursor-agent", "plugin", "marketplace", "list", "--format", "json"],
      env: (h) => home(h),
      setup: nothing,
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
      setup: (h) => mkdirSync(join(h, ".config"), { recursive: true }),
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
    check.setup(home);
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
