// Checks before a run: Claude Code signed in with a Claude account (never an API key), this checkout's motif tool and plugin built,
// Node.js for the apps, a browser for the cases that need one (the React Native cases among them: Expo's web target; and the Vue, Svelte and Angular ones: their pages), Flutter for the Flutter cases,
// a JDK and the Android SDK for the Compose ones, and a Mac with Xcode and an iOS simulator for the SwiftUI ones. Nothing is downloaded or installed for
// the developer.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { defaultDoctorDeps, type DoctorDeps } from "../../cli/src/commands/doctor";
import { composeDoctor } from "../../cli/src/stacks/compose/doctor";
import { FLUTTER_INSTALL, FLUTTER_MIN, olderThanFlutterMin } from "../../cli/src/stacks/flutter/doctor";
import { swiftUIDoctor, XCODE_MIN } from "../../cli/src/stacks/swiftui/doctor";
import { CASES, isCompose, isFlutter, isSwiftUI, needsAngular22, needsBrowser as caseNeedsBrowser, needsSvelteKit3, needsVite8 } from "./cases";
import { supportsPurge } from "./purge";
import { resolveClaude, sessionEnv } from "./claude";
import { tail, type Run } from "./tools";

export interface Paths { repo: string; cli: string; motifBin: string; pluginDir: string }

export function paths(repo: string): Paths {
  return { repo, cli: join(repo, "cli"), motifBin: join(repo, "dist", process.platform === "win32" ? "motif.exe" : "motif"), pluginDir: join(repo, "dist", "claude-code") };
}

export interface Ready {
  claude: string;
  claudeVersion: string;
  browser: boolean;
  /** Whether this Claude Code has `claude purge`; older ones don't, and the runner removes a case's transcripts itself. */
  purge: boolean;
}

export interface PreflightDeps {
  which: (cmd: string) => string | null;
  run: Run;
  env: Record<string, string | undefined>;
  /** This Bun, for `bun run build` and `bun run plugin`. */
  bun: string;
  claudeOverride?: string;
  /** Compose and SwiftUI: how doctor looks for the JDK and the Android SDK, and for Xcode (this computer's own when not given; tests give a fake). */
  doctor?: DoctorDeps;
  /** The platform the evals run on (this one when not given): the SwiftUI cases need macOS. */
  platform?: NodeJS.Platform;
}

/**
 * The cases to run instead when Flutter or the Android SDK is missing: the web and Expo ones, and on a Mac the SwiftUI
 * ones too, with what to call them.
 */
function otherCases(d: PreflightDeps): { ids: string[]; what: string } {
  const mac = (d.platform ?? process.platform) === "darwin";
  return {
    ids: CASES.filter((c) => !isFlutter(c) && !isCompose(c) && (mac || !isSwiftUI(c))).map((c) => c.id),
    what: mac ? "the web, Expo and SwiftUI cases" : "the web and Expo cases",
  };
}

/**
 * Why the SwiftUI cases can't run here, naming the cases that can: off a Mac, that they need one; on a Mac, doctor's own
 * line for Xcode and the iOS simulator. Nothing when Xcode 16 or later and a simulator are there.
 */
function xcodeProblem(d: PreflightDeps, repo: string): string | null {
  const swiftUICases = CASES.filter(isSwiftUI).map((c) => c.id).join(", ");
  const others = CASES.filter((c) => !c.mac).map((c) => c.id).join(",");
  const platform = d.platform ?? process.platform;
  if (platform !== "darwin") {
    return `The SwiftUI cases (${swiftUICases}) need a Mac with Xcode, since SwiftUI apps build and draw only on macOS. Run them on a Mac, or run the others here: --cases ${others}`;
  }
  const deps = { ...(d.doctor ?? { ...defaultDoctorDeps(), which: d.which, vars: d.env }), platform };
  // The repository's root isn't an app, so doctor takes it as an iOS one and looks for a simulator too.
  const needed = swiftUIDoctor(deps, { root: repo, apps: [{ path: ".", stack: "swiftui", source: "detected" }] }).filter((i) => i.status === "needed");
  if (needed.length === 0) return null;
  return `The SwiftUI cases (${swiftUICases}) need Xcode ${XCODE_MIN} or later with an iOS simulator. ${needed.map((i) => i.detail).join(" ")} Then run this again. Or run the others without them: --cases ${others}`;
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
  const others = otherCases(d);
  const found = version ? `This is Flutter ${version}; run flutter upgrade, or ${FLUTTER_INSTALL}` : `Flutter wasn't found on the PATH (or didn't say its version): ${FLUTTER_INSTALL}`;
  return `The Flutter cases (${flutterCases.join(", ")}) need Flutter ${FLUTTER_MIN} or later. ${found}, then run this again. Or run ${others.what} without it: --cases ${others.ids.join(",")}`;
}

/** Why the Compose cases can't run here (doctor's own lines for the JDK and the SDK), naming the cases that can; nothing when both are found. */
function androidProblem(d: PreflightDeps, repo: string): string | null {
  const deps = d.doctor ?? { ...defaultDoctorDeps(), which: d.which, vars: d.env };
  const needed = composeDoctor(deps, { root: repo, apps: [{ path: ".", stack: "compose", source: "detected" }] }).filter((i) => i.status === "needed");
  if (needed.length === 0) return null;
  const composeCases = CASES.filter(isCompose).map((c) => c.id);
  const others = otherCases(d);
  return `The Compose cases (${composeCases.join(", ")}) need a JDK 17 or later and the Android SDK. ${needed.map((i) => i.detail).join(" ")} Then run this again. Or run ${others.what} without them: --cases ${others.ids.join(",")}`;
}

/** Vite 8's Node.js: 20.19 or later on Node 20, 22.12 or later from Node 22 on (Node 21 isn't one). */
function runsVite8(major: number, minor: number): boolean {
  return (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
}

/**
 * The cases chosen that raise Node.js's floor: Vue's and Svelte's Vite 8, d-nuzha's SvelteKit 3 (`npx sv create` installs
 * it) and d-sanad's Angular 22 (`ng new` installs it).
 */
export interface NodeNeeds { vite8?: boolean; svelteKit3?: boolean; angular22?: boolean }

/** SvelteKit 3's Node.js: 22.17 or later. */
function runsSvelteKit3(major: number, minor: number): boolean {
  return (major === 22 && minor >= 17) || major > 22;
}

/** Angular 22's Node.js (its engines): ^22.22.3 || ^24.15.0 || >=26. Node 23 and 25 aren't among them. */
function runsAngular22(major: number, minor: number, patch: number): boolean {
  return (major === 22 && (minor > 22 || (minor === 22 && patch >= 3))) || (major === 24 && minor >= 15) || major >= 26;
}

export async function preflight(
  p: Paths, needsBrowser: boolean, d: PreflightDeps, needsFlutter = false, needsAndroid = false, needsXcode = false, needsNode = true, nodeNeeds: NodeNeeds = {},
): Promise<Ready | { error: string }> {
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
  // "oauth_token" is a Claude account's own token from claude setup-token (CLAUDE_CODE_OAUTH_TOKEN), for a machine
  // you reach without a browser; each session still has to report no API key.
  if (status?.loggedIn !== true || !["claude.ai", "oauth_token"].includes(status.authMethod)) {
    return { error: "The evals run on your Claude plan through Claude Code, never with an API key. Sign in with your Claude account (claude auth login), then run this again." };
  }
  // Claude Code before purge existed prints its main usage for "purge --help".
  const help = await d.run([found.exe, "purge", "--help"], p.repo, 60_000, env);
  const purge = help.code === 0 && supportsPurge(`${help.stdout}\n${help.stderr}`);
  // Before the builds, which take a while.
  if (needsFlutter) {
    const problem = await flutterProblem(d, p.repo);
    if (problem) return { error: problem };
  }
  if (needsAndroid) {
    const problem = androidProblem(d, p.repo);
    if (problem) return { error: problem };
  }
  if (needsXcode) {
    const problem = xcodeProblem(d, p.repo);
    if (problem) return { error: problem };
  }

  for (const [script, what] of [["build", "the motif tool"], ["plugin", "the Claude Code plugin"]] as const) {
    const r = await d.run([d.bun, "run", script], p.cli, 600_000);
    if (r.code !== 0) return { error: `Building ${what} failed (bun run ${script} in cli):\n${tail(r)}` };
  }
  if (!existsSync(p.motifBin) || !existsSync(join(p.pluginDir, "skills", "motif", "SKILL.md"))) {
    return { error: "The build didn't produce dist/motif and dist/claude-code; run bun run build and bun run plugin in cli to see why." };
  }

  // Only the cases that install or build with npm (web, React Native, Vue, Svelte, Angular) need Node. Flutter, Compose and SwiftUI don't, and
  // the tool and plugin builds above run on Bun.
  if (needsNode) {
    const node = await d.run(["node", "--version"], p.repo, 30_000);
    const [major = 0, minor = 0, patch = 0] = node.stdout.trim().replace(/^v/, "").split(".").map(Number);
    if (node.code !== 0 || !d.which("npm") || major < 20 || (major === 20 && minor < 9)) {
      return { error: "Node.js 20.9 or later, with npm, is needed to install and build the eval apps. Install it, then run this again." };
    }
    const mac = (d.platform ?? process.platform) === "darwin";
    const nodeVersion = node.stdout.trim().replace(/^v/, "");
    const named = (pick: (c: (typeof CASES)[number]) => boolean) => CASES.filter(pick).map((c) => c.id).join(", ");
    const others = CASES.filter((c) => !needsVite8(c) && !needsSvelteKit3(c) && !needsAngular22(c) && (mac || !c.mac)).map((c) => c.id).join(",");
    if (nodeNeeds.vite8 && !runsVite8(major, minor)) {
      return {
        error: `The Vue and Svelte cases (${named(needsVite8)}) need Node.js 20.19 or later, or 22.12 or later on Node 22 (Bustan's and Adawat's Vite 8 needs it). This is Node.js ${nodeVersion}: install a newer one from nodejs.org, then run this again. Or run the others without them: --cases ${others}`,
      };
    }
    if (nodeNeeds.svelteKit3 && !runsSvelteKit3(major, minor)) {
      return {
        error: `The new Svelte app (${named(needsSvelteKit3)}) needs Node.js 22.17 or later, since npx sv create makes a SvelteKit 3 app and SvelteKit 3 needs it. This is Node.js ${nodeVersion}: install a newer one from nodejs.org, then run this again. Or run the others without it: --cases ${others}`,
      };
    }
    if (nodeNeeds.angular22 && !runsAngular22(major, minor, patch)) {
      return {
        error: `The new Angular app (${named(needsAngular22)}) needs Node.js 22.22.3 or later on Node 22, 24.15 or later on Node 24, or 26 or later, since ng new makes an Angular 22 app and Angular 22 needs it. This is Node.js ${nodeVersion}: install a newer one from nodejs.org, then run this again. Or run the others without it: --cases ${others}`,
      };
    }
  }

  const doctor = await d.run([p.motifBin, "doctor", "--json"], p.repo, 60_000);
  let browser = false;
  let doctorLine = "";
  try {
    const item = JSON.parse(doctor.stdout).items.find((i: any) => i.id === "browser");
    browser = item?.status === "ok";
    doctorLine = typeof item?.detail === "string" ? item.detail : "";
  } catch {
    browser = false;
  }
  if (needsBrowser && !browser) {
    // The SwiftUI cases need no browser either, but they run only on a Mac.
    const noBrowser = (mac: boolean) => CASES.filter((c) => !caseNeedsBrowser(c) && Boolean(c.mac) === mac).map((c) => c.id).join(",");
    const onMac = (d.platform ?? process.platform) === "darwin" ? ` On this Mac, the SwiftUI cases don't need one either: --cases ${noBrowser(true)}.` : "";
    return {
      error: `No Chrome or Edge was found${doctorLine ? ` (motif doctor says: ${doctorLine})` : ""}. Test C's web reviews check what the browser shows, test D's web apps and b-plain's page are checked in a browser, the React Native cases draw their screens through Expo's web target in one, and the Vue, Svelte and Angular cases draw their pages in one. Install Chrome or Edge, or run motif browser install yourself (it downloads about 120 MB, about 300 MB on disk), then run this again. Test B on Larder and the Flutter and Compose cases (--cases ${noBrowser(false)}) don't need one.${onMac}`,
    };
  }
  return { claude: found.exe, claudeVersion: version.stdout.trim(), browser, purge };
}
