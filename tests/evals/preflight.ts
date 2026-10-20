// Checks before a run: Claude Code signed in with a Claude account (never an API key), this checkout's motif tool and plugin built,
// Node.js for the apps, a browser for the cases that need one, and Flutter for the Flutter cases. Nothing is downloaded or installed for the developer.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { FLUTTER_INSTALL, FLUTTER_MIN, olderThanFlutterMin } from "../../cli/src/stacks/flutter/doctor";
import { CASES, isFlutter, needsBrowser as caseNeedsBrowser } from "./cases";
import { resolveClaude, sessionEnv } from "./claude";
import { tail, type Run } from "./tools";

export interface Paths { repo: string; cli: string; motifBin: string; pluginDir: string }

export function paths(repo: string): Paths {
  return { repo, cli: join(repo, "cli"), motifBin: join(repo, "dist", process.platform === "win32" ? "motif.exe" : "motif"), pluginDir: join(repo, "dist", "claude-code") };
}

export interface Ready { claude: string; claudeVersion: string; browser: boolean }

export interface PreflightDeps {
  which: (cmd: string) => string | null;
  run: Run;
  env: Record<string, string | undefined>;
  /** This Bun, for `bun run build` and `bun run plugin`. */
  bun: string;
  claudeOverride?: string;
}

/** Flutter's version from flutter --version --machine (an "upgrade available" banner may come first), or null. */
async function flutterVersion(d: PreflightDeps, cwd: string): Promise<string | null> {
  const exe = d.which("flutter");
  if (!exe) return null;
  const r = await d.run([exe, "--version", "--machine"], cwd, 300_000);
  if (r.code !== 0) return null;
  try {
    const v = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))).frameworkVersion;
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

/** Why the Flutter cases can't run here, naming the cases that can; nothing when Flutter 3.27 or later is on the PATH. */
async function flutterProblem(d: PreflightDeps, cwd: string): Promise<string | null> {
  const version = await flutterVersion(d, cwd);
  if (version && !olderThanFlutterMin(version)) return null;
  const flutterCases = CASES.filter(isFlutter).map((c) => c.id);
  const others = CASES.filter((c) => !isFlutter(c)).map((c) => c.id);
  const found = version ? `This is Flutter ${version}; run flutter upgrade, or ${FLUTTER_INSTALL}` : `Flutter wasn't found on the PATH (or didn't say its version): ${FLUTTER_INSTALL}`;
  return `The Flutter cases (${flutterCases.join(", ")}) need Flutter ${FLUTTER_MIN} or later. ${found}, then run this again. Or run the other cases without it: --cases ${others.join(",")}`;
}

export async function preflight(p: Paths, needsBrowser: boolean, d: PreflightDeps, needsFlutter = false): Promise<Ready | { error: string }> {
  const found = resolveClaude(d.claudeOverride ?? d.which("claude"));
  if ("error" in found) return found;
  const { env } = sessionEnv(d.env, p.motifBin);

  const version = await d.run([found.exe, "--version"], p.repo, 60_000, env);
  if (version.code !== 0) return { error: `Claude Code didn't start (${found.exe} --version):\n${tail(version)}` };
  const auth = await d.run([found.exe, "auth", "status"], p.repo, 60_000, env);
  let status: any = null;
  try {
    status = JSON.parse(auth.stdout);
  } catch {
    status = null;
  }
  if (status?.loggedIn !== true || status.authMethod !== "claude.ai") {
    return { error: "The evals run on your Claude plan through Claude Code, never with an API key. Sign in with your Claude account (claude auth login), then run this again." };
  }
  // Before the builds, which take a while.
  if (needsFlutter) {
    const problem = await flutterProblem(d, p.repo);
    if (problem) return { error: problem };
  }

  for (const [script, what] of [["build", "the motif tool"], ["plugin", "the Claude Code plugin"]] as const) {
    const r = await d.run([d.bun, "run", script], p.cli, 600_000);
    if (r.code !== 0) return { error: `Building ${what} failed (bun run ${script} in cli):\n${tail(r)}` };
  }
  if (!existsSync(p.motifBin) || !existsSync(join(p.pluginDir, "skills", "motif", "SKILL.md"))) {
    return { error: "The build didn't produce dist/motif and dist/claude-code; run bun run build and bun run plugin in cli to see why." };
  }

  const node = await d.run(["node", "--version"], p.repo, 30_000);
  const [major = 0, minor = 0] = node.stdout.trim().replace(/^v/, "").split(".").map(Number);
  if (node.code !== 0 || !d.which("npm") || major < 20 || (major === 20 && minor < 9)) {
    return { error: "Node.js 20.9 or later, with npm, is needed to install and build the eval apps. Install it, then run this again." };
  }

  const doctor = await d.run([p.motifBin, "doctor", "--json"], p.repo, 60_000);
  let browser = false;
  try {
    browser = JSON.parse(doctor.stdout).items.some((i: any) => i.id === "browser" && i.status === "ok");
  } catch {
    browser = false;
  }
  if (needsBrowser && !browser) {
    return {
      error: `No Chrome or Edge was found. Test C's web reviews check what the browser shows, and test D's web apps and b-plain's page are checked in a browser. Install Chrome or Edge, or run motif browser install yourself (it downloads about 120 MB, about 300 MB on disk), then run this again. Test B on Larder and the Flutter cases (--cases ${CASES.filter((c) => !caseNeedsBrowser(c)).map((c) => c.id).join(",")}) don't need one.`,
    };
  }
  return { claude: found.exe, claudeVersion: version.stdout.trim(), browser };
}
