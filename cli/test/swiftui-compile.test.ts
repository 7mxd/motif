import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildThemeSet } from "../src/generate/theme";
import { generateSwiftUI } from "../src/stacks/swiftui/generate";
import { docFrom, FIXTURES, heavyStackTests, isMacWithXcode, partnerTokens, twoVariantTokens, validTokens, withCompanion } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

/** Code that uses every part of the generated API, so the compiler checks it the way an app calls it. */
const USAGE = `import SwiftUI

struct MotifExample: View {
    @Environment(\\.motifColors) private var colors
    @Environment(\\.motifVariant) private var variant
    @Environment(\\.accessibilityReduceMotion) private var reduceMotion
    @State private var open = false

    var body: some View {
        VStack(spacing: MotifSpace.s0p5) {
            Text("Hi").motifFont(.body).foregroundStyle(colors.textPrimary)
            Text("\\u{0645}\\u{0631}\\u{062D}\\u{0628}\\u{0627}").font(MotifType.body.font(arabic: true))
            Text("Heading").font(MotifType.heading.font())
            Text(variant.rawValue).motifFont(.caption)
        }
        .padding(open ? MotifSpace.s16 : MotifSpace.s4)
        .background(colors.surface, in: RoundedRectangle(cornerRadius: MotifRadius.full))
        .motifShadow(MotifShadows.md)
        .motifShadow(MotifShadows.sm)
        .onTapGesture {
            withAnimation(MotifMotion.animation(MotifSprings.snappy, reduceMotion: reduceMotion)) { open.toggle() }
            withAnimation(MotifCurves.standard) { open.toggle() }
            withAnimation(.easeOut(duration: MotifDurations.base)) { open.toggle() }
        }
    }
}

struct MotifRoot: View {
    var body: some View {
        MotifExample()
            .motifTheme(variant: .partner)
            .onAppear {
                MotifTheme.debugVariantOverride = .partner
                MotifTheme.debugVariantOverride = nil
                let all: [MotifVariant] = MotifVariant.allCases
                _ = all.map { MotifColors.resolve(.dark, variant: $0) } == [MotifColors.dark, MotifColors.partnerDark]
                _ = MotifColors.resolve(.light) == MotifColors.light && MotifColors.partnerLight != MotifColors.light
                _ = MotifVariant(rawValue: "default") ?? .defaultVariant
                _ = MotifType.isArabic(Locale(identifier: "ar")) && MotifType.body.size > MotifType.body.lineSpacing + MotifType.body.tracking
            }
    }
}

struct MotifOtherRoot: View {
    var body: some View {
        MotifExample().motifTheme()
    }
}
`;

/** The other shape: no variants, no companion, a project font. */
const PLAIN_USAGE = `import SwiftUI

struct PlainExample: View {
    @Environment(\\.motifColors) private var colors

    var body: some View {
        Text("Hi")
            .motifFont(.body)
            .foregroundStyle(colors.textSecondary)
            .background(MotifColors.resolve(.light).background)
            .motifTheme()
    }
}
`;

/** Two variants, women (the default) and men: the defaults the theme's functions take. */
const WOMEN_USAGE = `import SwiftUI

struct WomenExample: View {
    @Environment(\\.motifColors) private var colors
    @Environment(\\.motifVariant) private var variant

    var body: some View {
        VStack {
            Text(variant.rawValue).foregroundStyle(colors.surface)
            Text("Men").motifTheme(variant: .men)
        }
        .background(MotifColors.resolve(.dark).surface)
        .motifTheme()
        .onAppear {
            MotifTheme.debugVariantOverride = .men
            _ = MotifColors.resolve(.light) == MotifColors.light && MotifColors.menDark != MotifColors.dark
        }
    }
}
`;

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

const sdk = (name: string) => run(["xcrun", "--sdk", name, "--show-sdk-path"], "/").out.trim();

/** Warnings and errors the compiler gives for these files. */
const diagnostics = (out: string, files: RegExp) => out.split(/\r?\n/).filter((l) => files.test(l) && /: (warning|error): /.test(l));

const heavy = heavyStackTests("swiftui", isMacWithXcode());
if (!heavy.run) console.log(`[swiftui-compile] Xcode builds skipped: ${heavy.reason}`);

describe("the generated Swift", () => {
  const tokens = withCompanion(partnerTokens());
  tokens.space["0-5"] = { $value: { value: 2, unit: "px" } };
  tokens.shadow.md.$value = [{ ...tokens.shadow.md.$value, spread: { value: -1, unit: "px" } }, tokens.shadow.sm.$value, { ...tokens.shadow.sm.$value, inset: true }];
  tokens.font.caption.$value.letterSpacing = { value: 0.02, unit: "rem" };

  test.skipIf(!heavy.run)("builds with the app in Xcode for the iOS simulator, in Swift 5, Swift 6 and the main actor by default, with no warnings", () => {
    const [theme] = generateSwiftUI(buildThemeSet(docFrom(tokens)));
    expect(theme!.content).toContain('case defaultVariant = "default"');
    expect(theme!.content).toContain("@Entry var motifVariant");
    expect(theme!.content).toContain('arabic: Font.custom("Readex Pro"');
    const dir = tempDir("motif-swiftui-");
    cpSync(join(FIXTURES, "swiftui-min"), dir, { recursive: true });
    mkdirSync(join(dir, "SwiftUIMin/Design"), { recursive: true });
    writeFileSync(join(dir, "SwiftUIMin/Design/MotifTheme.swift"), theme!.content);
    writeFileSync(join(dir, "SwiftUIMin/MotifUsage.swift"), USAGE);

    // The fixture as it is (Swift 5, modelled on Xcode 16's App template), Swift 6, and Xcode 26's template (the main actor by default).
    const modes = [[], ["SWIFT_VERSION=6"], ["SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor", "SWIFT_APPROACHABLE_CONCURRENCY=YES"]];
    for (const mode of modes) {
      const build = run(
        [
          "xcodebuild", "-project", "SwiftUIMin.xcodeproj", "-scheme", "SwiftUIMin", "-destination", "generic/platform=iOS Simulator",
          "-derivedDataPath", join(dir, `.build-${modes.indexOf(mode)}`), "-quiet", "CODE_SIGNING_ALLOWED=NO", ...mode, "build",
        ],
        dir,
      );
      if (build.code !== 0) console.log(build.out);
      expect(build.code).toBe(0);
      expect(diagnostics(build.out, /MotifTheme\.swift|MotifUsage\.swift/)).toEqual([]);
    }
  }, 900_000);

  test.skipIf(!heavy.run)("typechecks for macOS 14 and iOS 17, with and without variants (and a default not called default), with no warnings", () => {
    const dir = tempDir("motif-swiftui-tc-");
    const [full] = generateSwiftUI(buildThemeSet(docFrom(tokens)));
    mkdirSync(join(dir, "full"));
    writeFileSync(join(dir, "full/MotifTheme.swift"), full!.content);
    writeFileSync(join(dir, "full/MotifUsage.swift"), USAGE);

    const plainTokens = validTokens();
    plainTokens.$extensions["dev.motif"].fonts = [{ family: "Brand Sans", files: [{ path: "design/fonts/Brand.ttf", weight: 400, style: "normal" }] }];
    plainTokens.font.body.$value.fontFamily = ["Brand Sans", "sans-serif"];
    const [plain] = generateSwiftUI(buildThemeSet(docFrom(plainTokens)));
    expect(plain!.content).not.toContain("MotifVariant");
    mkdirSync(join(dir, "plain"));
    writeFileSync(join(dir, "plain/MotifTheme.swift"), plain!.content);
    writeFileSync(join(dir, "plain/PlainUsage.swift"), PLAIN_USAGE);

    // Variants whose default isn't called "default": every default argument names the guide's own.
    const [women] = generateSwiftUI(buildThemeSet(docFrom(twoVariantTokens())));
    expect(women!.content).toContain("variant: MotifVariant = .women");
    mkdirSync(join(dir, "women"));
    writeFileSync(join(dir, "women/MotifTheme.swift"), women!.content);
    writeFileSync(join(dir, "women/WomenUsage.swift"), WOMEN_USAGE);

    const targets = [
      ["macosx", "arm64-apple-macos14"],
      ["iphonesimulator", "arm64-apple-ios17.0-simulator"],
    ];
    const usage: Record<string, string> = { full: "MotifUsage.swift", plain: "PlainUsage.swift", women: "WomenUsage.swift" };
    for (const shape of ["full", "plain", "women"]) {
      for (const [name, target] of targets) {
        for (const mode of [["-swift-version", "5"], ["-swift-version", "6"], ["-swift-version", "6", "-default-isolation", "MainActor"]]) {
          const files = ["MotifTheme.swift", usage[shape]!];
          const tc = run(["xcrun", "swiftc", "-typecheck", "-sdk", sdk(name!), "-target", target!, ...mode, ...files], join(dir, shape));
          if (tc.code !== 0) console.log(`${shape} ${target} ${mode.join(" ")}\n${tc.out}`);
          expect(tc.code).toBe(0);
          expect(diagnostics(tc.out, /\.swift:\d+/)).toEqual([]);
        }
      }
    }
  }, 600_000);
});
