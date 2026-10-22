import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../../tests/evals/cases";
import { runCmd, type Run } from "../../tests/evals/tools";
import { changes, findApp, patch, prepareWorkspace } from "../../tests/evals/workspace";
import { swiftUIApp } from "../../cli/src/stacks/swiftui/project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const npmCalls: string[][] = [];
// Real git; npm is stubbed, so CI never installs packages.
const run: Run = async (cmd, cwd, t, env) => {
  if (cmd[0] === "npm") {
    npmCalls.push(cmd);
    return { code: 0, stdout: "", stderr: "", timedOut: false };
  }
  return runCmd(cmd, cwd, t, env);
};
const byId = (id: string) => CASES.find((c) => c.id === id)!;
const sorted = <T extends { path: string }>(xs: T[]) => [...xs].sort((a, b) => a.path.localeCompare(b.path));

describe("a case's folder", () => {
  test("B and C: a fresh copy of the app, its packages installed, its starting state recorded beside it", async () => {
    const ws = await prepareWorkspace(byId("b-settings"), join(tempDir("motif-ws-"), "b-settings"), run);
    expect(existsSync(join(ws.app, "DESIGN.md"))).toBe(true);
    expect(npmCalls.at(-1)).toEqual(["npm", "ci", "--no-audit", "--no-fund"]);
    expect(ws.baseline).toMatch(/^[0-9a-f]{40}$/);
    expect(existsSync(join(ws.app, ".git"))).toBe(false);
    expect(await changes(ws, run)).toEqual([]);
  });

  test("lists what the session added, changed and deleted, ignoring installed packages and build output", async () => {
    const ws = await prepareWorkspace(byId("b-settings"), join(tempDir("motif-ws-"), "b"), run);
    mkdirSync(join(ws.app, "src/app/settings"), { recursive: true });
    writeFileSync(join(ws.app, "src/app/settings/page.tsx"), "export default function Settings() { return null; }\n");
    writeFileSync(join(ws.app, "src/app/page.tsx"), "export default function Home() { return null; }\n");
    rmSync(join(ws.app, "src/components/Badge.tsx"));
    mkdirSync(join(ws.app, "node_modules/x"), { recursive: true });
    writeFileSync(join(ws.app, "node_modules/x/index.js"), "");
    mkdirSync(join(ws.app, ".next"), { recursive: true });
    writeFileSync(join(ws.app, ".next/trace"), "");
    expect(sorted(await changes(ws, run))).toEqual(sorted([
      { status: "added", path: "src/app/settings/page.tsx" },
      { status: "modified", path: "src/app/page.tsx" },
      { status: "deleted", path: "src/components/Badge.tsx" },
    ]));
    expect(await patch(ws, run, ["src/app/settings/page.tsx"])).toContain("+export default function Settings()");
  });

  test("a git repository the session makes inside the app doesn't change the record", async () => {
    const ws = await prepareWorkspace(byId("b-search"), join(tempDir("motif-ws-"), "g"), run);
    await runCmd(["git", "init", "-q"], ws.app, 60_000);
    await runCmd(["git", "add", "-A"], ws.app, 60_000);
    writeFileSync(join(ws.app, "src/app/new.ts"), "export {};\n");
    expect(await changes(ws, run)).toEqual([{ status: "added", path: "src/app/new.ts" }]);
  });

  test("a plain site: a fresh copy with its state scripts, nothing installed, its starting state recorded", async () => {
    const before = npmCalls.length;
    const ws = await prepareWorkspace(byId("b-plain"), join(tempDir("motif-ws-"), "b-plain"), run);
    expect(existsSync(join(ws.app, "index.html"))).toBe(true);
    expect(existsSync(join(ws.app, "design/states/sent.js"))).toBe(true);
    expect(npmCalls.length).toBe(before);
    expect(ws.baseline).toMatch(/^[0-9a-f]{40}$/);
    const seeded = await prepareWorkspace(byId("c-plain"), join(tempDir("motif-ws-"), "c-plain"), run);
    expect(existsSync(join(seeded.app, "design/states"))).toBe(false);
  });

  test("a Flutter app: a fresh copy, its packages got with flutter pub get, what that writes left out of the record", async () => {
    const pubGets: string[][] = [];
    const flutter: Run = async (cmd, cwd, t, env) => {
      if (cmd[0] !== "flutter") return run(cmd, cwd, t, env);
      pubGets.push(cmd);
      mkdirSync(join(cwd, ".dart_tool"), { recursive: true });
      writeFileSync(join(cwd, ".dart_tool/package_config.json"), "{}");
      writeFileSync(join(cwd, "lib/l10n/app_localizations.dart"), "// generated\n");
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    };
    const before = npmCalls.length;
    for (const id of ["b-flutter-reserve", "c-flutter"]) {
      const ws = await prepareWorkspace(byId(id), join(tempDir("motif-ws-"), id), flutter);
      expect(existsSync(join(ws.app, "pubspec.yaml"))).toBe(true);
      expect(pubGets.at(-1)).toEqual(["flutter", "pub", "get"]);
      expect(ws.baseline).toMatch(/^[0-9a-f]{40}$/);
      writeFileSync(join(ws.app, ".dart_tool/package_config.json"), "{ }");
      expect(await changes(ws, run)).toEqual([]);
    }
    expect(npmCalls.length).toBe(before);
    const failing: Run = async (cmd, cwd, t) => (cmd[0] === "flutter" ? { code: 1, stdout: "", stderr: "Because maktaba depends on go_router, version solving failed.", timedOut: false } : runCmd(cmd, cwd, t));
    await expect(prepareWorkspace(byId("b-flutter-search"), join(tempDir("motif-ws-"), "f"), failing)).rejects.toThrow("version solving failed");
  });

  test("a Compose app: a fresh copy with a local.properties pointing at the SDK, nothing installed, that file left out of the record", async () => {
    const sdk = tempDir("motif-sdk-");
    mkdirSync(join(sdk, "platforms"), { recursive: true });
    const saved = process.env.ANDROID_HOME;
    process.env.ANDROID_HOME = sdk;
    try {
      const before = npmCalls.length;
      for (const id of ["b-compose-reminder", "c-compose"]) {
        const ws = await prepareWorkspace(byId(id), join(tempDir("motif-ws-"), id), run);
        expect(existsSync(join(ws.app, "gradlew"))).toBe(true);
        expect(readFileSync(join(ws.app, "local.properties"), "utf8")).toBe(`sdk.dir=${sdk.replace(/\\/g, "\\\\").replace(/:/g, "\\:")}\n`);
        expect(ws.baseline).toMatch(/^[0-9a-f]{40}$/);
        expect(await changes(ws, run)).toEqual([]);
      }
      expect(npmCalls.length).toBe(before);
    } finally {
      if (saved === undefined) delete process.env.ANDROID_HOME;
      else process.env.ANDROID_HOME = saved;
    }
  });

  test("a SwiftUI app: a fresh copy of Qahwa, nothing installed or resolved (it has no packages), its starting state recorded", async () => {
    const commands: string[][] = [];
    const recording: Run = async (cmd, cwd, t, env) => {
      if (cmd[0] !== "git") commands.push(cmd);
      return runCmd(cmd, cwd, t, env);
    };
    for (const id of ["b-swiftui-orders", "c-swiftui"]) {
      const ws = await prepareWorkspace(byId(id), join(tempDir("motif-ws-"), id), recording);
      expect(existsSync(join(ws.app, "Qahwa.xcodeproj", "project.pbxproj"))).toBe(true);
      expect(existsSync(join(ws.app, "Qahwa", "QahwaApp.swift"))).toBe(true);
      expect(ws.baseline).toMatch(/^[0-9a-f]{40}$/);
      expect(await changes(ws, recording)).toEqual([]);
    }
    expect(commands).toEqual([]);
  });

  test("D on SwiftUI: the brief beside a starter Xcode App project, as Xcode's iOS App template makes it; nothing recorded", async () => {
    const ws = await prepareWorkspace(byId("d-masar"), join(tempDir("motif-ws-"), "d-masar"), run);
    expect(readdirSync(ws.app).sort()).toEqual(["Masar", "Masar.xcodeproj", "brief.md"]);
    expect(readdirSync(join(ws.app, "Masar")).sort()).toEqual(["Assets.xcassets", "ContentView.swift", "MasarApp.swift"]);
    expect(swiftUIApp(ws.app)).toEqual({ kind: "xcodeproj", name: "Masar", project: "Masar.xcodeproj", platforms: ["ios"], sourceRoot: "Masar" });
    const pbx = readFileSync(join(ws.app, "Masar.xcodeproj", "project.pbxproj"), "utf8");
    for (const s of ["objectVersion = 77;", "isa = PBXFileSystemSynchronizedRootGroup;", "IPHONEOS_DEPLOYMENT_TARGET = 17.0;", "SWIFT_VERSION = 5.0;", "GENERATE_INFOPLIST_FILE = YES;"]) expect(pbx).toContain(s);
    // No design guide yet, and nothing of Motif's: the session starts it.
    expect(existsSync(join(ws.app, "DESIGN.md"))).toBe(false);
    expect(findApp(ws.app)).toBeNull();
    expect(ws.baseline).toBeUndefined();
    // The other briefs still start from an empty folder.
    for (const id of ["d-stride", "d-sahm", "d-nabta", "d-rihla"]) {
      expect(readdirSync((await prepareWorkspace(byId(id), join(tempDir("motif-ws-"), id), run)).app)).toEqual(["brief.md"]);
    }
  });

  test("D: an empty folder holding the brief, nothing recorded", async () => {
    const ws = await prepareWorkspace(byId("d-stride"), join(tempDir("motif-ws-"), "d"), run);
    expect(readdirSync(ws.app)).toEqual(["brief.md"]);
    expect(ws.baseline).toBeUndefined();
    expect(await changes(ws, run)).toEqual([]);
  });

  test("a failed install stops the case with npm's own words", async () => {
    const failing: Run = async (cmd, cwd, t) => (cmd[0] === "npm" ? { code: 1, stdout: "", stderr: "npm ERR! network unreachable", timedOut: false } : runCmd(cmd, cwd, t));
    await expect(prepareWorkspace(byId("b-search"), join(tempDir("motif-ws-"), "s"), failing)).rejects.toThrow("network unreachable");
  });

  test("preparing again starts from scratch", async () => {
    const dir = join(tempDir("motif-ws-"), "again");
    const first = await prepareWorkspace(byId("d-bloom"), dir, run);
    writeFileSync(join(first.app, "leftover.txt"), "x");
    const second = await prepareWorkspace(byId("d-bloom"), dir, run);
    expect(readdirSync(second.app)).toEqual(["brief.md"]);
  });
});

describe("test D's new app", () => {
  test("is the folder with a design guide: this one, or the one inside it", () => {
    const dir = tempDir("motif-find-");
    expect(findApp(dir)).toBeNull();
    mkdirSync(join(dir, "stride"));
    writeFileSync(join(dir, "stride", "DESIGN.md"), "");
    expect(findApp(dir)).toBe(join(dir, "stride"));
    writeFileSync(join(dir, "DESIGN.md"), "");
    expect(findApp(dir)).toBe(dir);
  });

  test("among several folders with a design guide, the one with an Xcode project or a Swift package is the app", () => {
    for (const make of [(d: string) => mkdirSync(join(d, "Masar.xcodeproj")), (d: string) => writeFileSync(join(d, "Package.swift"), "")]) {
      const dir = tempDir("motif-find-");
      for (const name of ["notes", "masar"]) {
        mkdirSync(join(dir, name));
        writeFileSync(join(dir, name, "DESIGN.md"), "");
      }
      expect(findApp(dir)).toBeNull();
      make(join(dir, "masar"));
      expect(findApp(dir)).toBe(join(dir, "masar"));
    }
  });
});
