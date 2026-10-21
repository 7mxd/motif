import { afterAll, describe, expect, test } from "bun:test";
import type { DoctorDeps } from "../src/commands/doctor";
import { detectApps } from "../src/detect/stacks";
import { SWIFTUI } from "../src/stacks/swiftui";
import { swiftUIDoctor } from "../src/stacks/swiftui/doctor";
import { SWIFTUI_FIRST_RUN, swiftUIShotRefusal } from "../src/stacks/swiftui/shot";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const MANIFEST =
  '// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(name: "Rafiq", platforms: [.iOS(.v17)], targets: [.executableTarget(name: "Rafiq")])\n';
const root = makeProject({
  "Package.swift": MANIFEST,
  "Sources/Rafiq/RafiqApp.swift": 'import SwiftUI\n@main struct RafiqApp: App { var body: some Scene { WindowGroup { Text("x") } } }\n',
});
const [app] = detectApps(root).apps;

/** A fake machine: what each command answers. */
function machine(opts: { platform?: NodeJS.Platform; xcode?: "ok" | "missing" | "tools" | "old"; simulator?: boolean } = {}): DoctorDeps {
  const { platform = "darwin", xcode = "ok", simulator = true } = opts;
  return {
    platform,
    arch: "arm64",
    home: "/h",
    findBrowser: () => null,
    which: () => null,
    run: (cmd) => {
      const c = cmd.join(" ");
      if (c === "xcode-select -p") return { code: 0, stdout: xcode === "tools" ? "/Library/Developer/CommandLineTools\n" : "/Applications/Xcode.app/Contents/Developer\n" };
      if (c === "xcodebuild -version") {
        if (xcode === "missing") return { code: 127, stdout: "" };
        return { code: 0, stdout: `Xcode ${xcode === "old" ? "15.4" : "16.4"}\nBuild version 16F6\n` };
      }
      if (c === "swift --version") return { code: 0, stdout: "Swift version 6.1.2\n" };
      if (c.startsWith("xcrun simctl list runtimes")) {
        return { code: 0, stdout: JSON.stringify({ runtimes: simulator ? [{ platform: "iOS", version: "18.5", isAvailable: true }] : [] }) };
      }
      return { code: 127, stdout: "" };
    },
  };
}

describe("motif shot's refusals for a SwiftUI app", () => {
  test("a Mac with Xcode and a simulator is not refused", () => {
    expect(swiftUIShotRefusal(root, app!, machine())).toBeNull();
    expect(SWIFTUI.shotRefusal?.(root, app!, () => null, machine())).toBeNull();
  });

  test("not a Mac: needs-mac, with doctor's line and what to do", () => {
    const deps = machine({ platform: "win32" });
    const doctor = swiftUIDoctor(deps, { root, apps: [app!] })[0]!.detail;
    expect(doctor).toBe("SwiftUI screenshots need a Mac with Xcode. Theme code, checks and drafts work here.");
    expect(swiftUIShotRefusal(root, app!, deps)).toEqual({ error: "needs-mac", text: `${doctor} Run motif shot on a Mac that has Xcode.` });
    expect(SWIFTUI.shotRefusal?.(root, app!, () => null, deps)?.error).toBe("needs-mac");
  });

  test("no Xcode, only the command-line tools, an old Xcode, or no simulator: needs-xcode with doctor's line", () => {
    for (const xcode of ["missing", "tools", "old"] as const) {
      const deps = machine({ xcode });
      const doctor = swiftUIDoctor(deps, { root, apps: [app!] })[0]!.detail;
      expect(swiftUIShotRefusal(root, app!, deps)).toEqual({ error: "needs-xcode", text: `${doctor} Then run motif shot again.` });
    }
    const none = swiftUIShotRefusal(root, app!, machine({ simulator: false }));
    expect(none?.error).toBe("needs-xcode");
    expect(none?.text).toContain("has no iOS simulator");
  });

  test("a check that could not be made is not a refusal", () => {
    const base = machine();
    const deps = { ...base, run: (cmd: string[]) => (cmd[0] === "xcrun" ? { code: 1, stdout: "" } : base.run!(cmd)) };
    expect(swiftUIShotRefusal(root, app!, deps)).toBeNull();
  });

  test("the first-run note", () => {
    expect(SWIFTUI_FIRST_RUN).toBe("The first SwiftUI screenshots build the app for a simulator, which takes a few minutes; later runs reuse the build.");
  });
});
