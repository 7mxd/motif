import { join } from "node:path";
import type { DoctorDeps, DoctorItem } from "../../commands/doctor";
import type { AppInfo } from "../../detect/stacks";
import { swiftUIApp } from "./project";

/** The oldest Xcode Motif's SwiftUI code and screenshots are built against. */
export const XCODE_MIN = 16;
const LABEL = "Xcode";

const item = (status: DoctorItem["status"], detail: string): DoctorItem => ({ id: "xcode", status, label: LABEL, detail });

interface Runtime {
  platform?: unknown;
  version?: unknown;
  isAvailable?: unknown;
}

/** The newest available iOS simulator runtime's version ("18.2") from `simctl list runtimes --json`: null when there is none, undefined when the output can't be read. */
function newestIosRuntime(output: string): string | null | undefined {
  // Warnings may come before the JSON.
  const start = output.indexOf("{");
  let runtimes: Runtime[];
  try {
    const parsed = JSON.parse(start >= 0 ? output.slice(start) : "") as { runtimes?: unknown };
    if (!Array.isArray(parsed.runtimes)) return undefined;
    runtimes = parsed.runtimes as Runtime[];
  } catch {
    return undefined;
  }
  // Only the numeric parts count ("27.0 beta" is 27.0).
  const key = (v: string) => v.split(".").map((n) => (/^[0-9]+/.test(n) ? parseInt(n, 10) : 0));
  const versions = runtimes
    .filter((r) => r && r.platform === "iOS" && r.isAvailable !== false && typeof r.version === "string")
    .map((r) => r.version as string);
  versions.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
    return 0;
  });
  return versions[0] ?? null;
}

/** One doctor item for Xcode: on a Mac, its version, Swift and (for an iOS app) an iOS simulator; elsewhere, that a Mac is needed. */
export function swiftUIDoctor(deps: DoctorDeps, ctx: { root: string; apps: AppInfo[]; platform?: "ios" | "macos" }): DoctorItem[] {
  if (deps.platform !== "darwin") {
    return [item("optional", "SwiftUI screenshots need a Mac with Xcode. Theme code, checks and drafts work here.")];
  }
  const missing = item("needed", "Xcode isn't installed. Theme code, checks and drafts work without it; screenshots need it: install Xcode from the App Store.");
  if (!deps.run) return [missing];

  const selected = deps.run(["xcode-select", "-p"]);
  if (selected.code === 0 && /CommandLineTools/.test(selected.stdout)) {
    return [item("needed", "Screenshots need Xcode, not only its command-line tools: install Xcode from the App Store, then run sudo xcode-select -s /Applications/Xcode.app.")];
  }
  const built = deps.run(["xcodebuild", "-version"]);
  if (built.code === 127) return [missing];
  if (built.code !== 0) return [item("needed", "Xcode is installed but didn't run: open it once, or run sudo xcodebuild -license accept.")];
  const version = /^Xcode\s+(\d+(?:\.\d+)*)/m.exec(built.stdout)?.[1];
  if (!version) return [item("optional", "Found Xcode, but couldn't read its version. Run xcodebuild -version to check it works.")];
  if (parseInt(version, 10) < XCODE_MIN) {
    return [item("needed", `Xcode ${version} is older than ${XCODE_MIN}, which Motif's theme code needs. Update Xcode from the App Store.`)];
  }

  const s = deps.run(["swift", "--version"]);
  const swift = s.code === 0 ? /Swift version (\d+(?:\.\d+)*)/.exec(`${s.stdout}\n${s.stderr ?? ""}`)?.[1] : undefined;
  const head = swift ? `Xcode ${version} (Swift ${swift})` : `Xcode ${version}`;

  // A macOS-only app runs on the Mac itself; any other needs an iOS simulator.
  // A run drawn on the Mac (a multiplatform app at window sizes) needs none either.
  const needsSimulator = ctx.platform !== "macos" && ctx.apps.some((a) => (swiftUIApp(join(ctx.root, a.path))?.platforms ?? ["ios"]).includes("ios"));
  if (!needsSimulator) return [item("ok", `${head}. A macOS app needs no simulator.`)];

  const r = deps.run(["xcrun", "simctl", "list", "runtimes", "--json"]);
  const runtime = r.code === 0 ? newestIosRuntime(r.stdout) : undefined;
  if (runtime === undefined) {
    return [item("optional", `Motif couldn't list the simulators (${head}): run xcrun simctl list runtimes to see why.`)];
  }
  if (runtime === null) {
    return [item("needed", `Xcode ${version} has no iOS simulator, which an iOS app's screenshots need: install an iOS simulator in Xcode › Settings › Components.`)];
  }
  return [item("ok", `${head}, with the iOS ${runtime} simulator.`)];
}
