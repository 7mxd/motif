import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DoctorDeps } from "../../cli/src/commands/doctor";
import { paths, preflight, type PreflightDeps } from "../../tests/evals/preflight";
import type { RunResult } from "../../tests/evals/tools";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const ok = (stdout = ""): RunResult => ({ code: 0, stdout, stderr: "", timedOut: false });
type Step = "version" | "auth" | "build" | "plugin" | "node" | "doctor" | "flutter";
// Flutter prints an "upgrade available" banner before the JSON at times.
const flutterVersion = (v: string) => ok(`A new version of Flutter is available!\n{\n  "frameworkVersion": "${v}",\n  "dartSdkVersion": "3.10.0"\n}\n`);

function setup(answers: Partial<Record<Step, RunResult>> = {}, which: Record<string, string | null> = {}) {
  const p = paths(tempDir("motif-pre-"));
  const seen: { authEnv?: Record<string, string | undefined>; flutter?: string[] } = {};
  const deps: PreflightDeps = {
    which: (c) => (c in which ? which[c]! : `/bin/${c}`),
    run: async (cmd, _cwd, _t, env) => {
      if (cmd[0] === "node") return answers.node ?? ok("v22.14.0\n");
      if (cmd[0] === "/bin/flutter") {
        seen.flutter = cmd;
        return answers.flutter ?? flutterVersion("3.44.8");
      }
      if (cmd[1] === "--version") return answers.version ?? ok("2.1.289 (Claude Code)\n");
      if (cmd[1] === "auth") {
        seen.authEnv = env;
        return answers.auth ?? ok(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", subscriptionType: "max" }));
      }
      if (cmd[2] === "build") {
        mkdirSync(dirname(p.motifBin), { recursive: true });
        writeFileSync(p.motifBin, "");
        return answers.build ?? ok();
      }
      if (cmd[2] === "plugin") {
        mkdirSync(join(p.pluginDir, "skills", "motif"), { recursive: true });
        writeFileSync(join(p.pluginDir, "skills", "motif", "SKILL.md"), "");
        return answers.plugin ?? ok();
      }
      if (cmd[1] === "doctor") return answers.doctor ?? ok(JSON.stringify({ items: [{ id: "browser", status: "ok" }] }));
      return { code: 1, stdout: "", stderr: `unexpected: ${cmd.join(" ")}`, timedOut: false };
    },
    env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-x" },
    bun: "/bin/bun",
    // Off a Mac unless a test says otherwise: on a Mac the other cases offered include the SwiftUI ones.
    platform: "linux",
  };
  return { p, deps, seen };
}

describe("before a run", () => {
  test("ready: Claude Code signed in with a Claude account, this checkout built, Node.js, a browser", async () => {
    const { p, deps, seen } = setup();
    expect(await preflight(p, true, deps)).toEqual({ claude: "/bin/claude", claudeVersion: "2.1.289 (Claude Code)", browser: true });
    expect(seen.authEnv?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  test("Claude Code not installed", async () => {
    const { p, deps } = setup({}, { claude: null });
    expect(await preflight(p, false, deps)).toEqual({ error: expect.stringContaining("isn't installed") });
  });

  test("never an API key, and never signed out", async () => {
    for (const auth of [{ loggedIn: true, authMethod: "api_key" }, { loggedIn: false }]) {
      const { p, deps } = setup({ auth: ok(JSON.stringify(auth)) });
      expect(await preflight(p, false, deps)).toEqual({ error: expect.stringContaining("never with an API key") });
    }
  });

  test("a failed build says which", async () => {
    const { p, deps } = setup({ build: { code: 1, stdout: "", stderr: "error: boom", timedOut: false } });
    expect(await preflight(p, false, deps)).toEqual({ error: expect.stringContaining("bun run build") });
  });

  test("Node.js older than 20.9", async () => {
    const { p, deps } = setup({ node: ok("v18.19.0") });
    expect(await preflight(p, false, deps)).toEqual({ error: expect.stringContaining("Node.js 20.9") });
  });

  test("a browser is needed only for tests C and D, and is never downloaded for you", async () => {
    const noBrowser = ok(JSON.stringify({ items: [{ id: "browser", status: "needed" }] }));
    const a = setup({ doctor: noBrowser });
    expect(await preflight(a.p, true, a.deps)).toEqual({ error: expect.stringContaining("motif browser install") });
    const b = setup({ doctor: noBrowser });
    expect(await preflight(b.p, false, b.deps)).toMatchObject({ browser: false });
  });

  test("a missing browser stops the React Native cases too, with doctor's own line and the cases that need none", async () => {
    const line = "No Chrome or Edge found. Previews and screenshots need one.";
    const noBrowser = ok(JSON.stringify({ items: [{ id: "browser", status: "needed", detail: line }] }));
    const { p, deps } = setup({ doctor: noBrowser });
    const r = await preflight(p, true, deps);
    expect(r).toEqual({ error: expect.stringContaining("React Native") });
    expect(r).toEqual({ error: expect.stringContaining(line) });
    expect(r).toEqual({ error: expect.stringContaining("--cases b-settings,b-search,b-profile,b-notifications,b-checkout,b-flutter-reserve,b-flutter-search,b-compose-reminder,b-compose-stats,c-flutter,c-compose,d-sahm,d-nabta") });
  });

  test("the cases that need no browser name the SwiftUI ones only on a Mac, where they can run", async () => {
    const noBrowser = ok(JSON.stringify({ items: [{ id: "browser", status: "needed" }] }));
    const others = "--cases b-settings,b-search,b-profile,b-notifications,b-checkout,b-flutter-reserve,b-flutter-search,b-compose-reminder,b-compose-stats,c-flutter,c-compose,d-sahm,d-nabta) don't need one.";
    const pc = setup({ doctor: noBrowser });
    const here = (await preflight(pc.p, true, { ...pc.deps, platform: "win32" })) as { error: string };
    expect(here.error).toContain(others);
    expect(here.error).not.toContain("swiftui");
    const mac = setup({ doctor: noBrowser });
    const there = (await preflight(mac.p, true, { ...mac.deps, platform: "darwin" })) as { error: string };
    expect(there.error).toContain(others);
    expect(there.error).toContain("On this Mac, the SwiftUI cases don't need one either: --cases b-swiftui-orders,b-swiftui-rewards,c-swiftui,d-masar.");
  });
});

describe("before a run with SwiftUI cases", () => {
  const swiftUICases = "b-swiftui-orders, b-swiftui-rewards, c-swiftui, d-masar";
  const others = "--cases b-settings,b-search,b-profile,b-notifications,b-checkout,b-plain,b-flutter-reserve,b-flutter-search,b-compose-reminder,b-compose-stats,b-rn-orders,b-rn-favourites,c-review,c-plain,c-flutter,c-compose,c-rn,d-stride,d-ledgerly,d-bloom,d-sahm,d-nabta,d-rihla";
  /** A Mac with (or without) Xcode and an iOS simulator, as doctor sees it. */
  function mac(opts: { xcode?: string; simulator?: boolean }): DoctorDeps {
    return {
      platform: "darwin", arch: "arm64", home: "/Users/dev", findBrowser: () => null, which: () => null, vars: {},
      run: (cmd) => {
        const line = cmd.join(" ");
        if (line === "xcode-select -p") return { code: 0, stdout: "/Applications/Xcode.app/Contents/Developer\n" };
        if (line === "xcodebuild -version") return opts.xcode ? { code: 0, stdout: `Xcode ${opts.xcode}\nBuild version 16F6\n` } : { code: 127, stdout: "" };
        if (line === "swift --version") return { code: 0, stdout: "Apple Swift version 6.1 (swiftlang-6.1.0.110.21)\n" };
        if (line === "xcrun simctl list runtimes --json") {
          return { code: 0, stdout: JSON.stringify({ runtimes: opts.simulator ? [{ platform: "iOS", version: "18.5", isAvailable: true }] : [] }) };
        }
        return { code: 127, stdout: "" };
      },
    };
  }

  test("ready on a Mac with Xcode 16 or later and an iOS simulator", async () => {
    const { p, deps } = setup();
    expect(await preflight(p, false, { ...deps, platform: "darwin", doctor: mac({ xcode: "16.4", simulator: true }) }, false, false, true)).toMatchObject({ claude: "/bin/claude" });
  });

  test("off a Mac: they need one, said plainly, with the cases to run here instead", async () => {
    for (const platform of ["win32", "linux"] as const) {
      const { p, deps } = setup();
      const r = (await preflight(p, false, { ...deps, platform }, false, false, true)) as { error: string };
      expect(r.error).toBe(
        `The SwiftUI cases (${swiftUICases}) need a Mac with Xcode, since SwiftUI apps build and draw only on macOS. Run them on a Mac, or run the others here: ${others}`,
      );
    }
  });

  test("a Mac without Xcode, with an old one, or with no iOS simulator: doctor's own words, and the cases to run instead", async () => {
    for (const [doctor, words] of [
      [mac({}), "Xcode isn't installed."],
      [mac({ xcode: "15.4", simulator: true }), "Xcode 15.4 is older than 16"],
      [mac({ xcode: "16.4" }), "has no iOS simulator"],
    ] as const) {
      const { p, deps } = setup();
      const r = (await preflight(p, false, { ...deps, platform: "darwin", doctor }, false, false, true)) as { error: string };
      expect(r.error).toStartWith(`The SwiftUI cases (${swiftUICases}) need Xcode 16 or later with an iOS simulator.`);
      expect(r.error).toContain(words);
      expect(r.error).toEndWith(`Then run this again. Or run the others without them: ${others}`);
    }
  });

  test("on a Mac, a missing Flutter or Android SDK offers the SwiftUI cases among the others", async () => {
    const withSwiftUI =
      "--cases b-settings,b-search,b-profile,b-notifications,b-checkout,b-plain,b-rn-orders,b-rn-favourites,b-swiftui-orders,b-swiftui-rewards,c-review,c-plain,c-rn,c-swiftui,d-stride,d-ledgerly,d-bloom,d-rihla,d-masar";
    const a = setup({}, { flutter: null });
    const flutter = (await preflight(a.p, false, { ...a.deps, platform: "darwin" }, true)) as { error: string };
    expect(flutter.error).toEndWith(`Or run the web, Expo and SwiftUI cases without it: ${withSwiftUI}`);
    const b = setup();
    const noSdk: DoctorDeps = { ...mac({ xcode: "16.4", simulator: true }), which: () => null, files: { exists: () => false, read: () => null, list: () => [] } };
    const android = (await preflight(b.p, false, { ...b.deps, platform: "darwin", doctor: noSdk }, false, true)) as { error: string };
    expect(android.error).toEndWith(`Or run the web, Expo and SwiftUI cases without them: ${withSwiftUI}`);
  });

  test("not checked without a SwiftUI case, wherever it runs", async () => {
    const { p, deps } = setup();
    expect(await preflight(p, false, { ...deps, platform: "win32", doctor: mac({}) })).toMatchObject({ claude: "/bin/claude" });
  });
});

describe("before a run with Flutter cases", () => {
  const otherCases = "b-settings,b-search,b-profile,b-notifications,b-checkout,b-plain,b-rn-orders,b-rn-favourites,c-review,c-plain,c-rn,d-stride,d-ledgerly,d-bloom,d-rihla";

  test("ready: Flutter 3.27 or later on the PATH", async () => {
    const { p, deps, seen } = setup();
    expect(await preflight(p, false, deps, true)).toMatchObject({ claude: "/bin/claude" });
    expect(seen.flutter).toEqual(["/bin/flutter", "--version", "--machine"]);
    const exact = setup({ flutter: flutterVersion("3.27.0") });
    expect(await preflight(exact.p, false, exact.deps, true)).toMatchObject({ claude: "/bin/claude" });
  });

  test("no Flutter: how to install it, and the cases to run instead", async () => {
    const { p, deps } = setup({}, { flutter: null });
    const r = await preflight(p, false, deps, true);
    expect(r).toEqual({ error: expect.stringContaining("https://docs.flutter.dev/get-started/install") });
    expect((r as { error: string }).error).toContain(`--cases ${otherCases}`);
  });

  test("a Flutter older than 3.27, or one that doesn't answer, is the same", async () => {
    for (const flutter of [flutterVersion("3.24.5"), { code: 1, stdout: "", stderr: "boom", timedOut: false }]) {
      const { p, deps } = setup({ flutter });
      const r = await preflight(p, false, deps, true);
      expect(r).toEqual({ error: expect.stringContaining("3.27") });
      expect((r as { error: string }).error).toContain(`--cases ${otherCases}`);
    }
    const old = setup({ flutter: flutterVersion("3.24.5") });
    expect(await preflight(old.p, false, old.deps, true)).toEqual({ error: expect.stringContaining("Flutter 3.24.5") });
  });

  test("not needed without a Flutter case", async () => {
    const { p, deps, seen } = setup({}, { flutter: null });
    expect(await preflight(p, false, deps)).toMatchObject({ claude: "/bin/claude" });
    expect(seen.flutter).toBeUndefined();
  });
});

describe("before a run with Compose cases", () => {
  const webCases = "b-settings,b-search,b-profile,b-notifications,b-checkout,b-plain,b-rn-orders,b-rn-favourites,c-review,c-plain,c-rn,d-stride,d-ledgerly,d-bloom,d-rihla";
  const java = (v: string) => ({ code: 0, stdout: "", stderr: `openjdk version "${v}" 2024-07-16
` });
  /** A computer with (or without) a JDK and an SDK, as doctor sees it. */
  function android(opts: { jdk?: string; sdk?: boolean }): DoctorDeps {
    const present = new Set<string>(opts.sdk ? ["/sdk", "/sdk/platforms/android-35/android.jar"] : []);
    return {
      platform: "linux", arch: "x64", home: "/home/dev", findBrowser: () => null,
      which: (c) => (c === "java" && opts.jdk ? "/usr/bin/java" : null),
      vars: opts.sdk ? { ANDROID_HOME: "/sdk" } : {},
      run: (cmd) => (opts.jdk && cmd[0] === "/usr/bin/java" ? java(opts.jdk) : { code: 127, stdout: "" }),
      files: { exists: (p) => present.has(p), read: () => null, list: (p) => (p === "/sdk/platforms" ? ["android-35"] : []) },
    };
  }

  test("ready: a JDK 17 or later and an Android SDK", async () => {
    const { p, deps } = setup();
    expect(await preflight(p, false, { ...deps, doctor: android({ jdk: "17.0.12", sdk: true }) }, false, true)).toMatchObject({ claude: "/bin/claude" });
  });

  test("no JDK or no SDK: doctor's own words, and the cases to run instead", async () => {
    const { p, deps } = setup();
    const noJdk = await preflight(p, false, { ...deps, doctor: android({ sdk: true }) }, false, true);
    expect(noJdk).toEqual({ error: expect.stringContaining("No JDK found.") });
    expect((noJdk as { error: string }).error).toContain("https://adoptium.net");
    expect((noJdk as { error: string }).error).toContain(`--cases ${webCases}`);
    const noSdk = await preflight(p, false, { ...deps, doctor: android({ jdk: "21.0.3" }) }, false, true);
    expect(noSdk).toEqual({ error: expect.stringContaining("No Android SDK found.") });
    const old = await preflight(p, false, { ...deps, doctor: android({ jdk: "11.0.2", sdk: true }) }, false, true);
    expect(old).toEqual({ error: expect.stringContaining("JDK 11.0.2 is older than 17") });
  });

  test("not checked without a Compose case", async () => {
    const { p, deps } = setup();
    expect(await preflight(p, false, { ...deps, doctor: android({}) })).toMatchObject({ claude: "/bin/claude" });
  });
});
