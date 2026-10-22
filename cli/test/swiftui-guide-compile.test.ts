// The SwiftUI guide's Swift examples compile against the theme motif tokens writes today (Task 11, fix round 1), so a
// change to the generator that breaks what the guide teaches fails here. Mac only.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildThemeSet } from "../src/generate/theme";
import { generateSwiftUI } from "../src/stacks/swiftui/generate";
import { docFrom, heavyStackTests, isMacWithXcode, twoVariantTokens, validTokens, withCompanion } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const GUIDE = join(import.meta.dir, "../../skill/adapters/swiftui");
const FILES = ["README.md", "tokens.md", "components.md", "motion.md", "platform.md", "checks.md"];

/** What an example uses from the app without declaring it: the smallest stand-ins that compile. */
const STUBS: Record<string, string> = {
  ContentView: `struct ContentView: View { var body: some View { Text("Home") } }`,
  AppButton: `struct AppButton: View { let title: String; var isLoading = false; let action: () -> Void; var body: some View { Button(title, action: action) } }`,
  Skeleton: `struct Skeleton: View { var body: some View { Rectangle() } }`,
  SettingsScreen: `struct SettingsScreen: View { var body: some View { Text("Settings") } }`,
  SettingsModel: `@MainActor @Observable final class SettingsModel { static let preview = SettingsModel() }`,
  // The harness's own API (cli/src/stacks/swiftui/harness/MotifStates.swift), as a state file sees it.
  MotifHarness: `@MainActor final class MotifHarness {
    func tap(_ label: String, timeout: Double = 5) async throws {}
    func type(_ text: String, into label: String? = nil, timeout: Double = 5) async throws {}
    func wait(_ seconds: Double) async {}
    func waitFor(_ label: String, timeout: Double = 5) async throws {}
    func exists(_ label: String) -> Bool { false }
    var labels: [String] { [] }
    func settle() async {}
}`,
};

interface Example {
  name: string;
  code: string;
  declares: Set<string>;
  main: boolean;
  variants: boolean;
}

/** The guide's examples, with the top-level names each declares. */
function examples(): Example[] {
  return FILES.flatMap((file) => {
    const text = readFileSync(join(GUIDE, file), "utf8").replace(/\r\n/g, "\n");
    return [...text.matchAll(/```swift\n([\s\S]*?)```/g)].map((m, i) => {
      const code = m[1]!;
      const declares = new Set([...code.matchAll(/^(?:@\w+(?:\([^)]*\))?\s+)*(?:final\s+)?(?:struct|enum|class|let|var|func)\s+(\w+)/gm)].map((d) => d[1]!));
      return { name: `${file.replace(".md", "")}-${i + 1}`, code, declares, main: /^@main\b/m.test(code), variants: /MotifVariant|motifVariant|\.women\b|\.men\b/.test(code) };
    });
  });
}

/** Examples packed into as few files' worth of modules as can compile together: no name twice, one @main. */
function batches(list: Example[]): Example[][] {
  const out: { items: Example[]; names: Set<string>; main: boolean }[] = [];
  for (const e of list) {
    const fits = out.find((b) => !(e.main && b.main) && [...e.declares].every((n) => !b.names.has(n)));
    const batch = fits ?? (out.push({ items: [], names: new Set(), main: false }), out[out.length - 1]!);
    batch.items.push(e);
    for (const n of e.declares) batch.names.add(n);
    batch.main ||= e.main;
  }
  return out.map((b) => b.items);
}

function stubsFor(batch: Example[]): string {
  const declared = new Set(batch.flatMap((e) => [...e.declares]));
  const used = (n: string) => batch.some((e) => new RegExp(String.raw`\b${n}\b`).test(e.code));
  return ["import SwiftUI", "import Observation", ...Object.entries(STUBS).filter(([n]) => !declared.has(n) && used(n)).map(([, s]) => s), ""].join("\n");
}

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

const sdk = (name: string) => run(["xcrun", "--sdk", name, "--show-sdk-path"], "/").out.trim();

/** Swift 6.2 or later has -default-isolation (Xcode 26's template: the main actor by default); Xcode 16.4's 6.1 hasn't. */
function hasDefaultIsolation(): boolean {
  const m = /Swift version (\d+)\.(\d+)/.exec(run(["xcrun", "swiftc", "--version"], "/").out);
  return m !== null && (Number(m[1]) > 6 || (Number(m[1]) === 6 && Number(m[2]) >= 2));
}

const heavy = heavyStackTests("swiftui", isMacWithXcode());
if (!heavy.run) console.log(`[swiftui-guide-compile] skipped: ${heavy.reason}`);

describe("the SwiftUI guide's Swift examples", () => {
  test("are found and packed for the compiler, on any computer", () => {
    const list = examples();
    expect(list.length).toBeGreaterThan(20);
    expect(list.some((e) => e.declares.has("motifState"))).toBe(true);
    expect(list.some((e) => e.declares.has("motifSetup"))).toBe(true);
    const packed = batches(list);
    expect(packed.flat().length).toBe(list.length);
    for (const b of packed) {
      const names = b.flatMap((e) => [...e.declares]);
      expect(new Set(names).size).toBe(names.length);
      expect(b.filter((e) => e.main).length).toBeLessThanOrEqual(1);
    }
  });

  test.skipIf(!heavy.run)("typecheck against the generated theme on iOS 17 and macOS 14, in Swift 5 and 6 (and the main actor by default from Swift 6.2), with and without variants, with no warnings", () => {
    const dir = tempDir("motif-swiftui-guide-");
    // With variants (women, the default, and men, as the format's example) and an Arabic companion; and without either.
    const themes = {
      variants: generateSwiftUI(buildThemeSet(docFrom(withCompanion(twoVariantTokens()))))[0]!.content,
      plain: generateSwiftUI(buildThemeSet(docFrom(validTokens())))[0]!.content,
    };
    const targets = [
      ["iphonesimulator", "arm64-apple-ios17.0-simulator"],
      ["macosx", "arm64-apple-macos14"],
    ] as const;
    const modes = [["-swift-version", "5"], ["-swift-version", "6"], ...(hasDefaultIsolation() ? [["-swift-version", "6", "-default-isolation", "MainActor"]] : [])];
    if (modes.length < 3) console.log("[swiftui-guide-compile] Swift is older than 6.2: the main-actor-by-default typecheck is skipped.");
    const list = examples();
    let runs = 0;
    for (const [shape, theme] of Object.entries(themes)) {
      // Without variants, the examples that choose one can't compile: they are the variants theme's.
      const packed = batches(shape === "plain" ? list.filter((e) => !e.variants) : list);
      for (const [b, batch] of packed.entries()) {
        const at = join(dir, `${shape}-${b}`);
        mkdirSync(at, { recursive: true });
        writeFileSync(join(at, "MotifTheme.swift"), theme);
        writeFileSync(join(at, "Stubs.swift"), stubsFor(batch));
        for (const e of batch) writeFileSync(join(at, `${e.name}.swift`), e.code);
        const files = ["MotifTheme.swift", "Stubs.swift", ...batch.map((e) => `${e.name}.swift`)];
        for (const [name, target] of targets) {
          for (const mode of modes) {
            const tc = run(["xcrun", "swiftc", "-typecheck", "-parse-as-library", "-sdk", sdk(name), "-target", target, ...mode, ...files], at);
            const said = tc.out.split(/\r?\n/).filter((l) => /\.swift:\d+:\d+: (warning|error): /.test(l));
            if (tc.code !== 0 || said.length > 0) console.log(`${shape} ${batch.map((e) => e.name).join(", ")} ${target} ${mode.join(" ")}\n${tc.out}`);
            expect([shape, b, target, mode.join(" "), tc.code]).toEqual([shape, b, target, mode.join(" "), 0]);
            expect(said).toEqual([]);
            runs++;
          }
        }
      }
    }
    console.log(`[swiftui-guide-compile] ${list.length} examples, ${runs} typechecks.`);
  }, 900_000);
});
