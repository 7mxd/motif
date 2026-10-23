import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emit } from "../src/cli/output";
import { runCheck } from "../src/commands/check";
import { runTokens } from "../src/commands/tokens";
import { FIXTURES, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

// Motif's own font cache is an empty folder here, whatever this computer has downloaded.
const ownHome = process.env.MOTIF_HOME;
beforeAll(() => {
  process.env.MOTIF_HOME = tempDir("motif-home-");
});
afterAll(() => {
  if (ownHome === undefined) delete process.env.MOTIF_HOME;
  else process.env.MOTIF_HOME = ownHome;
  cleanupTempDirs();
});

const fixture = (path: string) => readFileSync(join(FIXTURES, "swiftui-min", path), "utf8");
const PBXPROJ = "SwiftUIMin.xcodeproj/project.pbxproj";
const THEME = "SwiftUIMin/Design/MotifTheme.swift";
const TOKENS = JSON.stringify(validTokens());

const HOME = `import SwiftUI

struct Home: View {
    var body: some View {
        Text("Hi")
            .padding(13)
            .background(Color(red: 0.2, green: 0.4, blue: 1))
            // motif-ok: partner brand
            .foregroundStyle(Color(red: 1, green: 0, blue: 0.67))
    }
}
`;
const FADE = `import SwiftUI

struct Fade: View {
    @State private var on = false
    var body: some View {
        Text("x").opacity(on ? 1 : 0).animation(MotifSprings.snappy, value: on)
    }
}
`;
const MOTION = `import SwiftUI

struct Calm: View {
    @Environment(\\.accessibilityReduceMotion) private var reduceMotion
    var body: some View { Text("x") }
}
`;

/** The Xcode 16 App template's project (SwiftUIMin is a synchronized folder), with its theme code written by motif tokens. */
async function swiftApp(files: Record<string, string> = {}): Promise<string> {
  const root = makeProject({
    [PBXPROJ]: fixture(PBXPROJ),
    "SwiftUIMin/SwiftUIMinApp.swift": fixture("SwiftUIMin/SwiftUIMinApp.swift"),
    "SwiftUIMin/ContentView.swift": fixture("SwiftUIMin/ContentView.swift"),
    "design/tokens.json": TOKENS,
    ...files,
  });
  expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
  return root;
}
const check = (root: string, positionals: string[] = []) => runCheck(root, { positionals });
const where = (r: any) => (r.data.violations as any[]).map((h) => `${h.rule} ${h.file}:${h.line}:${h.column}`);

describe("motif check on a SwiftUI app", () => {
  test("a fresh template app passes; Motif's own theme file is never scanned", async () => {
    const r = await check(await swiftApp());
    expect(r.exitCode).toBe(0);
    expect(r.text).toStartWith("✓ No design problems found in 2 files.");
    expect(r.data.warnings).toEqual([]);
  });

  test("reports typed colours and sizes with Swift fixes, and honours a reasoned motif-ok", async () => {
    const r = await check(await swiftApp({ "SwiftUIMin/Home.swift": HOME }));
    expect(r.exitCode).toBe(1);
    expect(where(r)).toEqual(["off-scale SwiftUIMin/Home.swift:6:13", "raw-color SwiftUIMin/Home.swift:7:25"]);
    expect(r.text).toContain("Use MotifSpace.s<N>.");
    expect(r.text).toContain("Use colors.<role> from @Environment(\\.motifColors).");
    expect(r.text).not.toContain("var(--motif");
    expect(r.text).not.toContain("MotifTheme.colors");
    expect((r.data.exceptions as any[]).map((e) => [e.rule, e.file, e.line, e.reason])).toEqual([["raw-color", "SwiftUIMin/Home.swift", 9, "partner brand"]]);
    expect(r.text).toContain("SwiftUIMin/Home.swift:9  raw-color  Color(red: 1, green: 0, blue: 0.67) — motif-ok: partner brand");
  });

  test("--json lists each hit with its file, line and column", async () => {
    const r = await check(await swiftApp({ "SwiftUIMin/Home.swift": HOME }));
    let out = "";
    emit(r, true, (s) => void (out += s));
    const hits = JSON.parse(out).violations as any[];
    expect(hits.map((h) => `${h.file}:${h.line}:${h.column}`)).toEqual(["SwiftUIMin/Home.swift:6:13", "SwiftUIMin/Home.swift:7:25"]);
    expect(hits[1]).toMatchObject({ rule: "raw-color", kind: "color", value: "#3366ff", context: "background", fix: "Use colors.<role> from @Environment(\\.motifColors)." });
  });

  test("a path limits the check to that file", async () => {
    const root = await swiftApp({ "SwiftUIMin/Home.swift": HOME });
    const r = await check(root, ["SwiftUIMin/ContentView.swift"]);
    expect(r.exitCode).toBe(0);
    expect((r.data.summary as any).files).toBe(1);
  });

  test("the generated theme file, edited by hand, is a warning", async () => {
    const root = await swiftApp();
    const theme = join(root, THEME);
    writeFileSync(theme, readFileSync(theme, "utf8").replace("struct MotifColors", "struct  MotifColors"));
    const r = await check(root);
    expect(r.data.violations).toEqual([]);
    expect((r.data.warnings as any[]).map((w) => [w.rule, w.file])).toEqual([["generated-edited", THEME]]);
    expect(r.text).toContain("Warnings:");
  });

  test("build output, Swift packages' .build, tests and Package.swift are not read", async () => {
    const root = await swiftApp({
      "SwiftUIMinTests/HomeTests.swift": HOME,
      "SwiftUIMinUITests/HomeUITests.swift": HOME,
      ".build/checkouts/x/Sources/X.swift": HOME,
      "DerivedData/Build/Home.swift": HOME,
      "SwiftUIMin/Home.generated.swift": HOME,
    });
    const r = await check(root);
    expect(r.exitCode).toBe(0);
  });

  test("reduce motion: reported when the app animates without reading the setting, gone once it does", async () => {
    const bare = await check(await swiftApp({ "SwiftUIMin/Fade.swift": FADE }));
    expect(where(bare)).toEqual(["reduced-motion SwiftUIMin/Fade.swift:6:38"]);
    expect(bare.text).toContain('Animations here ignore the "Reduce Motion" setting.');
    expect(bare.text).toContain("Read @Environment(\\.accessibilityReduceMotion)");

    const reads = await check(await swiftApp({ "SwiftUIMin/Fade.swift": FADE, "SwiftUIMin/Calm.swift": MOTION }));
    expect(reads.data.violations).toEqual([]);
    expect(reads.exitCode).toBe(0);
  });

  test("many problems are grouped with the closest generated member", async () => {
    const lines = Array.from({ length: 26 }, (_, i) => `    let c${i} = Color(red: 0.29412, green: 0.33333, blue: 0.38824)`);
    const src = ["import SwiftUI", "", "struct Many {", ...lines, "    let p = Text(\"x\").padding(13)", "    let o = Color(red: 1, green: 0, blue: 0.667)", "}", ""].join("\n");
    const r = await check(await swiftApp({ "SwiftUIMin/Many.swift": src }));
    expect(r.text).toContain("26× Color(red: 0.29412, green: 0.33333, blue: 0.38824)");
    expect(r.text).toContain("Closest: colors.textSecondary.");
    expect(r.text).toContain("Closest: MotifSpace.s3 (12px).");
    // An off-brand colour has no role close to it: the plain fix, not a misleading "closest".
    expect(r.text).toContain("1× Color(red: 1, green: 0, blue: 0.667)  Raw colour Color(red: 1, green: 0, blue: 0.667). Use colors.<role> from @Environment(\\.motifColors). At SwiftUIMin/Many.swift:31.");
  });

  test("a negative size's closest role keeps the minus, so the fix doesn't flip its direction (fix round 1)", async () => {
    const pulls = ["import SwiftUI", "", "struct Pull {", ...Array.from({ length: 26 }, (_, i) => `    let p${i} = Text("x").padding(.bottom, -13)`), "    let q = Text(\"x\").padding(.top, -2)", "    let r = Text(\"x\").padding(13)", "}", ""].join("\n");
    const r = await check(await swiftApp({ "SwiftUIMin/Pull.swift": pulls }));
    expect(r.text).toContain("26× .padding(.bottom, -13)  Spacing -13pt isn't on your spacing scale. Closest: -MotifSpace.s3 (-12px).");
    // The step of 0 has no direction to keep.
    expect(r.text).toContain("1× .padding(.top, -2)  Spacing -2pt isn't on your spacing scale. Closest: MotifSpace.s0 (0px) or -MotifSpace.s1 (-4px).");
    expect(r.text).toContain("1× .padding(13)  Spacing 13pt isn't on your spacing scale. Closest: MotifSpace.s3 (12px).");
  });

  test("typed colours in the app's own palette are still flagged, with one hint line per palette file", async () => {
    const palette = `import SwiftUI

extension Color {
    static let brand = Color(red: 0.2, green: 0.4, blue: 1)
    static let sand = Color(hex: "#F1E9DA")
}
`;
    const r = await check(await swiftApp({ "SwiftUIMin/Colors.swift": palette, "SwiftUIMin/Home.swift": HOME }));
    expect(where(r)).toContain("raw-color SwiftUIMin/Colors.swift:4:24");
    expect(r.text).toContain("SwiftUIMin/Colors.swift is your own theme's palette");
    expect(r.text).not.toContain("SwiftUIMin/Home.swift is your own theme's palette");
  });

  test("a SwiftUI app without a guide is sent to motif extract", async () => {
    const root = makeProject({ [PBXPROJ]: fixture(PBXPROJ), "SwiftUIMin/SwiftUIMinApp.swift": fixture("SwiftUIMin/SwiftUIMinApp.swift"), "SwiftUIMin/ContentView.swift": fixture("SwiftUIMin/ContentView.swift") });
    const r = await check(root);
    expect(r.exitCode).toBe(2);
  });

  test("names SwiftUI among the stacks it reads when it can't read an app", async () => {
    const root = makeProject({ "design/tokens.json": TOKENS, "package.json": JSON.stringify({ dependencies: { vue: "^3" } }), "src/App.vue": "" });
    const r = await check(root);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("motif check works on Flutter apps, Jetpack Compose apps, React Native (Expo) apps, SwiftUI apps, React web apps and plain web sites in this version.");
  });
});
