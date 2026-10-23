import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { assemble } from "../../tests/fixtures/assemble";
import { runValidate } from "../src/commands/validate";
import { checkProjectFontFiles, readProjectFonts } from "../src/contract/fonts";
import { validateTokens } from "../src/contract/tokens";
import { buildThemeSet } from "../src/generate/theme";
import { themeFonts } from "../src/generate/theme-fonts";
import { runExtract } from "../src/commands/extract";
import { buildDraft } from "../src/extract/draft";
import { SWIFTUI } from "../src/stacks/swiftui";
import { collectSwiftUI } from "../src/stacks/swiftui/extract";
import { appFontFiles, isSystemFamily } from "../src/stacks/swiftui/font-files";
import type { AppInfo } from "../src/detect/stacks";
import { docFrom, FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const app = { path: ".", stack: "swiftui" } as AppInfo;
const files = (root: string) => [...SWIFTUI.sourceFiles!(root, app, {}), ...(SWIFTUI.extractFiles?.(root, app, {}) ?? [])];
const collect = (root: string) => collectSwiftUI(files(root));
const values = (samples: { value: string }[]) => samples.map((s) => s.value);
const hexOf = (tokens: any, alias: string) => tokens.primitive.color[alias.slice("{primitive.color.".length, -1)].$value.hex;
const colorset = (light: object, dark?: object) =>
  JSON.stringify({
    colors: [
      { idiom: "universal", color: light },
      ...(dark ? [{ idiom: "universal", appearances: [{ appearance: "luminosity", value: "dark" }], color: dark }] : []),
    ],
    info: { author: "xcode", version: 1 },
  });
const srgb = (red: string, green: string, blue: string, alpha = "1.000", space = "srgb") => ({ "color-space": space, components: { red, green, blue, alpha } });

describe("collectSwiftUI on the template's AccentColor", () => {
  const root = makeProject({
    "App/Assets.xcassets/AccentColor.colorset/Contents.json": colorset(srgb("0.404", "0.314", "0.643"), srgb("0.816", "0.737", "1.000")),
    "App/ContentView.swift": "import SwiftUI\nstruct ContentView: View { var body: some View { Text(\"Hi\") } }\n",
  });
  const occ = collect(root);

  test("AccentColor is --accent-color with light and dark, and the source is Swift", () => {
    expect(occ.variables).toEqual([{ name: "--accent-color", light: "#6750a4", dark: "#d0bcff" }]);
    expect(occ.source).toBe("swift");
  });

  test("it is the hint for action-primary, and the notes say Swift, not Dart", () => {
    const { tokens, report } = buildDraft(occ);
    expect(report.variables.find((v) => v.name === "--accent-color")).toMatchObject({ light: "#6750a4", dark: "#d0bcff", role: "color.action-primary" });
    expect(hexOf(tokens, (tokens as any).color["action-primary"].$extensions["dev.motif"].modes.dark)).toBe("#D0BCFF");
    const text = report.notes.join("\n");
    expect(text).toContain("your Swift theme code");
    expect(text).not.toContain("Dart");
  });
});

describe("collectSwiftUI on component formats", () => {
  test("floats, 0-255 integers, hex strings, alpha and grey are all read", () => {
    const root = makeProject({
      "A/Assets.xcassets/Float.colorset/Contents.json": colorset(srgb("0.200", "0.400", "0.600")),
      "A/Assets.xcassets/Int.colorset/Contents.json": colorset(srgb("51", "102", "153")),
      "A/Assets.xcassets/Hex.colorset/Contents.json": colorset(srgb("0x33", "0x66", "0x99")),
      "A/Assets.xcassets/See.colorset/Contents.json": colorset(srgb("0.000", "0.000", "0.000", "0.500")),
      "A/Assets.xcassets/Grey.colorset/Contents.json": colorset({ "color-space": "gray-gamma-22", components: { white: "0.500", alpha: "1.000" } }),
      "A/V.swift": "import SwiftUI\n",
    });
    const v = Object.fromEntries(collect(root).variables!.map((x) => [x.name, x.light]));
    expect(v).toEqual({ "--float": "#336699", "--int": "#336699", "--hex": "#336699", "--see": "#00000080", "--grey": "#808080" });
  });

  test("a colour set with no colour in it (Xcode's empty AccentColor) is skipped", () => {
    const root = makeProject({
      "A/Assets.xcassets/AccentColor.colorset/Contents.json": JSON.stringify({ colors: [{ idiom: "universal" }], info: { version: 1 } }),
      "A/V.swift": "import SwiftUI\n",
    });
    expect(collect(root).variables).toEqual([]);
  });

  test("a colour set that names a system colour (Landmarks's AccentColor) has no value to read, and a note says so (Task 15)", () => {
    const root = makeProject({
      "A/Assets.xcassets/AccentColor.colorset/Contents.json": JSON.stringify({
        colors: [{ color: { platform: "universal", reference: "systemIndigoColor" }, idiom: "universal" }],
        info: { author: "xcode", version: 1 },
      }),
      "A/V.swift": "import SwiftUI\n",
    });
    const occ = collect(root);
    expect(occ.variables).toEqual([]);
    expect(occ.notes).toEqual([
      "AccentColor is the system colour systemIndigoColor, which has no value in the catalogue to read, so the draft leaves it out: give its role (action-primary, for the accent colour) a value yourself.",
    ]);
    const system = (reference: string) => JSON.stringify({ colors: [{ color: { platform: "ios", reference }, idiom: "universal" }], info: { version: 1 } });
    const two = makeProject({
      "A/Assets.xcassets/Card.colorset/Contents.json": system("secondarySystemBackgroundColor"),
      "A/Assets.xcassets/Ink.colorset/Contents.json": system("labelColor"),
      "A/V.swift": "import SwiftUI\n",
    });
    expect(collect(two).notes).toEqual([
      "Card is the system colour secondarySystemBackgroundColor; Ink is the system colour labelColor. System colours have no value in the catalogue to read, so the draft leaves them out: give their roles values yourself.",
    ]);
  });
});

describe("collectSwiftUI on a catalogue with a namespaced pair", () => {
  const occ = collect(join(FIXTURES, "swiftui-palettes"));
  const { tokens, report } = buildDraft(occ);
  const t = tokens as any;

  test("colour sets and Color constants are variables in kebab case", () => {
    const by = Object.fromEntries(occ.variables!.map((x) => [x.name, x]));
    expect(by["--surface"]).toEqual({ name: "--surface", light: "#ffffff", dark: "#1c1b1f" });
    expect(by["--background"]).toEqual({ name: "--background", light: "#f8f7fa" });
    expect(by["--brand"]).toEqual({ name: "--brand", light: "#336699" });
    expect(by["--accent-color"]).toMatchObject({ light: "#6750a4", dark: "#d0bcff" });
  });

  test("Men/ and Women/ (namespaced folders) are variants beside the default", () => {
    expect(report.designVariants).toEqual([{ id: "default", label: "Default" }, { id: "men", label: "Men" }, { id: "women", label: "Women" }]);
    const role = t.color["action-primary"];
    expect(hexOf(t, role.$value)).toBe("#6750A4");
    expect(hexOf(t, role.$extensions["dev.motif"].modes.dark)).toBe("#D0BCFF");
    const v = role.$extensions["dev.motif"].variants;
    expect([hexOf(t, v.men.value), hexOf(t, v.men.dark)]).toEqual(["#0F766E", "#5EEAD4"]);
    expect([hexOf(t, v.women.value), hexOf(t, v.women.dark)]).toEqual(["#BE185D", "#F472B6"]);
  });

  test("views give spacing, radius, motion and type samples", () => {
    expect(values(occ.space)).toContain("13px");
    expect(values(occ.radius)).toContain("12px");
    expect(values(occ.duration)).toContain("250ms");
    expect(values(occ.easing)).toContain("cubic-bezier(0, 0, 0.58, 1)");
    expect(values(occ.fontFamily)).toContain("Inter");
    expect(values(occ.fontSize)).toContain("22px");
    expect(occ.followVariables).toBe(true);
  });

  test("a Color constant is one sample at its definition, not counted again for the literal", () => {
    expect(occ.colors.find((c) => c.value === "#336699")?.count).toBe(1);
  });
});

describe("collectSwiftUI on parallel catalogues and unrelated namespaces", () => {
  const set = (hex: [string, string, string], dark?: [string, string, string]) => colorset(srgb(...hex), dark && srgb(...dark));
  test("a second catalogue is a variant named after it", () => {
    const root = makeProject({
      "A/Assets.xcassets/Primary.colorset/Contents.json": set(["0.1", "0.2", "0.3"]),
      "A/PartnerAssets.xcassets/Primary.colorset/Contents.json": set(["0.5", "0.5", "0.5"]),
      "A/V.swift": "import SwiftUI\n",
    });
    const occ = collect(root);
    expect(occ.variantLabels).toEqual({ partner: "Partner" });
    expect(occ.variables).toEqual([{ name: "--primary", light: "#1a334d", variants: { partner: { light: "#808080" } } }]);
  });

  test("a namespace whose colours nothing else shares just prefixes the names", () => {
    const root = makeProject({
      "A/Assets.xcassets/Brand/Contents.json": JSON.stringify({ properties: { "provides-namespace": true } }),
      "A/Assets.xcassets/Brand/Ink.colorset/Contents.json": set(["0", "0", "0"]),
      "A/V.swift": "import SwiftUI\n",
    });
    const occ = collect(root);
    expect(occ.variables).toEqual([{ name: "--brand-ink", light: "#000000" }]);
    expect(occ.variantLabels).toBeUndefined();
  });
});

describe("collectSwiftUI: Any, Light and Dark appearances", () => {
  test("the explicit Light colour wins over the Any one", () => {
    const entry = (color: object, appearances?: object[]) => ({ idiom: "universal", ...(appearances ? { appearances } : {}), color });
    const json = JSON.stringify({
      colors: [
        entry(srgb("1.000", "0.000", "0.000")),
        entry(srgb("0.000", "1.000", "0.000"), [{ appearance: "luminosity", value: "light" }]),
        entry(srgb("0.000", "0.000", "1.000"), [{ appearance: "luminosity", value: "dark" }]),
      ],
    });
    const root = makeProject({ "A/Assets.xcassets/Tone.colorset/Contents.json": json, "A/V.swift": "import SwiftUI\n" });
    expect(collect(root).variables).toEqual([{ name: "--tone", light: "#00ff00", dark: "#0000ff" }]);
  });

  test("with no Light entry, the Any colour is the light one", () => {
    const root = makeProject({ "A/Assets.xcassets/Tone.colorset/Contents.json": colorset(srgb("1.000", "0.000", "0.000"), srgb("0.000", "0.000", "1.000")), "A/V.swift": "import SwiftUI\n" });
    expect(collect(root).variables).toEqual([{ name: "--tone", light: "#ff0000", dark: "#0000ff" }]);
  });
});

describe("collectSwiftUI: Color constants name roles", () => {
  const root = makeProject({
    "A/Colors.swift": [
      "import SwiftUI",
      "extension Color {",
      "    static let primary = Color(red: 0.4, green: 0.31, blue: 0.64)",
      "    static let background = Color(red: 0.97, green: 0.97, blue: 0.98)",
      "    static let surface = Color(red: 1, green: 1, blue: 1)",
      "}",
    ].join("\n"),
  });
  const occ = collect(root);
  const { report } = buildDraft(occ);

  test("they are role-name candidates with a sample each", () => {
    expect(occ.roleNames).toEqual(expect.arrayContaining(["--primary", "--background", "--surface"]));
    expect(values(occ.colors)).toEqual(expect.arrayContaining(["#664fa3", "#f7f7fa", "#ffffff"]));
  });

  test("primary, background and surface become action-primary, background and surface", () => {
    const role = (name: string) => report.variables.find((v) => v.name === name)?.role;
    expect([role("--primary"), role("--background"), role("--surface")]).toEqual(["color.action-primary", "color.background", "color.surface"]);
  });
});

describe("collectSwiftUI: sizes kept in a constants type (Landmarks's Constants, v0.5.0 sweep)", () => {
  const root = makeProject({
    "A/Constants.swift": [
      "import SwiftUI",
      "struct Constants {",
      "    static let cornerRadius: CGFloat = 15.0",
      "    static let leadingContentInset: CGFloat = 26.0",
      "    static let standardPadding: CGFloat = 14.0 // the app's padding",
      "    static let safeAreaPadding: CGFloat = 30",
      "    @MainActor static var itemSpacing: Double = 6.5",
      "    static let gridGap = 12",
      "    static let titleBottomMargin: CGFloat = -4",
      "    static let cardCorner: Float = 20",
      "    static let badgeImageSize: CGFloat = 46",
      "    static let animationDuration = 0.3",
      "    static let doublePadding: CGFloat = standardPadding * 2",
      "    let instancePadding: CGFloat = 99",
      "}",
    ].join("\n"),
  });
  const occ = collect(root);
  const sample = (samples: { value: string; count: number; examples: string[] }[], value: string) => samples.find((s) => s.value === value);

  test("a static size whose name says padding, spacing, inset, gap or margin is a spacing sample at its definition", () => {
    expect(sample(occ.space, "26px")).toMatchObject({ count: 1, examples: [expect.stringMatching(/A\/Constants\.swift:4$/)] });
    expect(sample(occ.space, "14px")).toMatchObject({ count: 1, examples: [expect.stringMatching(/Constants\.swift:5$/)] });
    for (const v of ["30px", "6.5px", "12px", "4px"]) expect([v, sample(occ.space, v)?.count]).toEqual([v, 1]);
  });

  test("one whose name says radius or corner is a corner sample", () => {
    expect(values(occ.radius).sort()).toEqual(["15px", "20px"]);
    expect(sample(occ.radius, "15px")?.examples[0]).toMatch(/Constants\.swift:3$/);
  });

  test("other names, other values, and instance properties aren't samples", () => {
    expect(values(occ.space).sort()).toEqual(["12px", "14px", "26px", "30px", "4px", "6.5px"]);
    expect(occ.space.some((s) => ["46px", "99px", "28px"].includes(s.value))).toBe(false);
    expect(values(occ.duration)).toEqual([]);
  });

  test("a name that also says shadow, blur, a multiplier, ratio, factor, scale, count, opacity, alpha, duration or delay isn't a size (fix round 1)", () => {
    const names = [
      "shadowRadius", "blurRadius", "paddingMultiplier", "spacingRatio", "cornerFactor", "radiusScale", "gapCount",
      "insetOpacity", "marginAlpha", "paddingDuration", "spacingDelay", "SHADOW_RADIUS",
    ];
    const other = collect(makeProject({ "A/K.swift": ["struct K {", ...names.map((n, i) => `    static let ${n}: CGFloat = ${i + 1}.5`), "}"].join("\n") }));
    expect([values(other.space), values(other.radius), other.notes ?? []]).toEqual([[], [], []]);
  });

  test("names with digits and runs of capitals are split into words: padding8, HPadding, cardRadius2, VSpacing_large (fix round 1)", () => {
    const occ2 = collect(makeProject({
      "A/K.swift": [
        "enum K {",
        "    static let padding8: CGFloat = 8",
        "    static let HPadding: CGFloat = 18",
        "    static let VSpacing_large: CGFloat = 22",
        "    static let cardRadius2: CGFloat = 9",
        "    static let UIInsetTop: CGFloat = 3",
        "}",
      ].join("\n"),
    }));
    expect(values(occ2.space).sort()).toEqual(["18px", "22px", "3px", "8px"]);
    expect(values(occ2.radius)).toEqual(["9px"]);
  });

  test("a note names them and says to use the theme's roles, since their uses aren't traced", () => {
    expect(occ.notes).toEqual([
      "8 sizes are kept as named constants (cornerRadius, leadingContentInset, standardPadding, safeAreaPadding, itemSpacing and 3 more), so each counts once, where it is defined: neither extract nor motif check sees where the views use them. Once the app uses Motif's theme, replace them with MotifSpace and MotifRadius roles.",
    ]);
  });
});

describe("collectSwiftUI: colour sets named Surface and Background name roles", () => {
  test("the fixture's Surface and Background sets", () => {
    const { report } = buildDraft(collect(join(FIXTURES, "swiftui-palettes")));
    const role = (name: string) => report.variables.find((v) => v.name === name)?.role;
    expect([role("--surface"), role("--background")]).toEqual(["color.surface", "color.background"]);
  });
});

describe("collectSwiftUI notes", () => {
  test("Display P3 counts each name once and names the namespace", () => {
    const text = buildDraft(collect(join(FIXTURES, "swiftui-palettes"))).report.notes.join("\n");
    expect(text).toContain("Men/Primary, Women/Primary are written in Display P3");
  });

  test("a default that is a namespace reads once", () => {
    const set = colorset(srgb("0.1", "0.1", "0.1"), srgb("0.9", "0.9", "0.9"));
    const root = makeProject({
      "A/Assets.xcassets/Men/Contents.json": JSON.stringify({ properties: { "provides-namespace": true } }),
      "A/Assets.xcassets/Women/Contents.json": JSON.stringify({ properties: { "provides-namespace": true } }),
      "A/Assets.xcassets/Men/Primary.colorset/Contents.json": set,
      "A/Assets.xcassets/Women/Primary.colorset/Contents.json": set,
      "A/V.swift": "import SwiftUI\n",
    });
    const notes = collect(root).notes!.join("\n");
    expect(notes).toContain("Men colours became the default");
    expect(notes).not.toContain("Men colours/Men colours");
  });

  test("extended linear sRGB is noted", () => {
    const root = makeProject({ "A/Assets.xcassets/Glow.colorset/Contents.json": colorset(srgb("0.5", "0.5", "0.5", "1.000", "extended-linear-srgb")), "A/V.swift": "import SwiftUI\n" });
    expect(collect(root).notes!.join("\n")).toContain("Glow is written in extended linear sRGB");
  });

  test("out-of-range values are clamped to 0 and noted, not dropped or malformed", () => {
    const root = makeProject({
      "A/Assets.xcassets/Neg.colorset/Contents.json": colorset(srgb("-0.100", "0.500", "1.200", "1.000", "extended-srgb")),
      "A/Assets.xcassets/NegNum.colorset/Contents.json": JSON.stringify({ colors: [{ idiom: "universal", color: { "color-space": "srgb", components: { red: -1, green: 0, blue: 0, alpha: 1 } } }] }),
      "A/V.swift": "import SwiftUI\n",
    });
    const occ = collect(root);
    const by = Object.fromEntries(occ.variables!.map((x) => [x.name, x.light]));
    expect(by["--neg"]).toBe("#0080ff");
    expect(by["--neg-num"]).toBe("#000000");
    expect(occ.notes!.join("\n")).toContain("outside 0 to 1");
  });
});

describe("motif extract on a SwiftUI app", () => {
  test("asset catalogue colours reach the draft and its notes", async () => {
    const root = makeProject({});
    cpSync(join(FIXTURES, "swiftui-min"), root, { recursive: true });
    cpSync(join(FIXTURES, "swiftui-palettes", "Shop"), join(root, "SwiftUIMin"), { recursive: true });
    const r = await runExtract(root, { positionals: [], flags: {} });
    expect(r.exitCode).toBe(0);
    const report = JSON.parse(readFileSync(join(root, "design", "extract-report.json"), "utf8"));
    expect(report.variables.find((v: any) => v.name === "--primary")).toMatchObject({ light: "#6750a4", dark: "#d0bcff", role: "color.action-primary" });
    expect(report.designVariants.map((v: any) => v.id)).toEqual(["default", "men", "women"]);
    expect(r.text).toContain("your Swift theme code");
  });
});

describe("collectSwiftUI: a font the app ships is drafted as its own, not as a Google font (sweep Task 3, SwiftUI)", () => {
  const READEX = join(import.meta.dir, "../../tests/fixtures/swiftui-contract-app/Qahwa/Fonts/ReadexPro.ttf");
  /** Each family the drafted roles use, with the source `motif tokens` gives it. */
  const sources = (tokens: unknown) => Object.fromEntries(themeFonts(buildThemeSet(docFrom(tokens)).base).map((f) => [f.family, f.source]));
  const fontsList = (tokens: any) => tokens.$extensions["dev.motif"].fonts;
  /** The draft is a valid guide whose project fonts' files are all there. */
  const valid = (root: string, tokens: unknown) => {
    const doc = docFrom(tokens);
    expect(validateTokens(doc)).toEqual([]);
    const { fonts, findings } = readProjectFonts(doc);
    expect(findings).toEqual([]);
    expect(checkProjectFontFiles(root, fonts, doc)).toEqual([]);
  };
  const shop = (files: Record<string, string>, fonts: Record<string, string> = {}) => {
    const root = makeProject(files);
    for (const [to, from] of Object.entries(fonts)) {
      mkdirSync(dirname(join(root, to)), { recursive: true });
      copyFileSync(from, join(root, to));
    }
    return root;
  };

  test("a Font.custom family whose file is in the app is a project font, by its family or its PostScript name", () => {
    const root = shop(
      {
        "Shop/CartView.swift": 'import SwiftUI\nstruct CartView: View {\n    var body: some View {\n        Text("Cart").font(.custom("Readex Pro", size: 22))\n        Text("Total").font(.custom("ReadexPro-Regular", size: 14))\n    }\n}\n',
      },
      { "Shop/Fonts/ReadexPro.ttf": READEX },
    );
    const occ = collect(root);
    // The PostScript name is the same family: one sample, counted twice.
    expect(occ.fontFamily.map((s) => [s.value, s.count])).toEqual([["Readex Pro", 2]]);
    expect(occ.projectFonts).toEqual([{ family: "Readex Pro", files: [{ path: "Shop/Fonts/ReadexPro.ttf", weight: 400, style: "normal" }] }]);
    // A variable font: its file serves the weights of its wght axis.
    expect(occ.fontWeightRanges).toEqual([{ family: "Readex Pro", min: 160, max: 700 }]);
    const { tokens, report } = buildDraft(occ);
    expect((tokens as any).primitive.font.sans.$value[0]).toBe("Readex Pro");
    expect(fontsList(tokens)).toEqual([{ family: "Readex Pro", files: [{ path: "Shop/Fonts/ReadexPro.ttf", weight: 400, style: "normal" }] }]);
    expect(sources(tokens)).toEqual({ "Readex Pro": "project" });
    expect(report.notes.join("\n")).not.toMatch(/weight 400 only|didn't find them|Google/);
    valid(root, tokens);
  });

  test("files Motif can't read are matched by their names: Inter-Regular.ttf and Inter-Bold.ttf for Font.custom(\"Inter\")", () => {
    const root = makeProject({
      "Shop/Type.swift": 'import SwiftUI\nlet body = Font.custom("Inter", size: 16)\nlet title = Font.custom("Inter-Bold", size: 22)\n',
      "Shop/Fonts/Inter-Regular.ttf": "font",
      "Shop/Fonts/Inter-Bold.ttf": "font",
      "build/Fonts/Inter-Black.ttf": "font",
    });
    const occ = collect(root);
    expect(occ.fontFamily.map((s) => [s.value, s.count])).toEqual([["Inter", 2]]);
    expect(occ.projectFonts).toEqual([
      { family: "Inter", files: [{ path: "Shop/Fonts/Inter-Bold.ttf", weight: 700, style: "normal" }, { path: "Shop/Fonts/Inter-Regular.ttf", weight: 400, style: "normal" }] },
    ]);
    expect(sources(buildDraft(occ).tokens)).toEqual({ Inter: "project" });
  });

  test("a Font.custom family with no files is noted; one of the system's own fonts isn't", () => {
    const root = makeProject({
      "Shop/Type.swift": 'import SwiftUI\nlet a = Font.custom("Brandon Grotesque", size: 16)\nlet b = Font.custom("Brandon Grotesque", size: 18)\nlet c = Font.custom("AvenirNext-Bold", size: 22)\n',
    });
    const occ = collect(root);
    expect(occ.projectFonts ?? []).toEqual([]);
    expect(occ.unfoundFonts).toEqual([{ family: "Brandon Grotesque", from: 'Font.custom("Brandon Grotesque")' }]);
    expect(buildDraft(occ).report.notes).toContain(
      'Brandon Grotesque comes from your app\'s font files (Font.custom("Brandon Grotesque")), but Motif didn\'t find them, so the draft treats it as a Google font. Add its files to the guide\'s fonts list, or check that Google Fonts has it.',
    );
  });

  test("a font the app registers (UIAppFonts) that covers Arabic, and no Font.custom names, is the companion", () => {
    const root = shop(
      {
        "Shop/Info.plist": '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>UIAppFonts</key>\n\t<array>\n\t\t<string>ReadexPro.ttf</string>\n\t</array>\n</dict>\n</plist>\n',
        "Shop/CartView.swift": 'import SwiftUI\nstruct CartView: View { var body: some View { Text("Cart").font(.title) } }\n',
      },
      { "Shop/Fonts/ReadexPro.ttf": READEX },
    );
    const occ = collect(root);
    expect(occ.companion).toBe("Readex Pro");
    expect(occ.fontFamily).toEqual([]);
    const { tokens, report } = buildDraft(occ);
    expect((tokens as any).primitive.font.sans.$value).toEqual(["system-ui", "Readex Pro", "sans-serif"]);
    // Fix round 2: the note says what happened, not "after system-ui".
    expect(report.notes).toContain(
      "Your app registers Readex Pro for Arabic text, so the draft makes it each type role's companion after the system font, and its font files are in the guide's fonts list.",
    );
    expect(sources(tokens)).toEqual({ "Readex Pro": "project" });
    valid(root, tokens);
  });

  test("Qahwa's Readex Pro, which only its Info.plist and generated theme name, drafts as a project font, and the draft validates", async () => {
    const root = join(makeProject({}), "Qahwa");
    assemble("swiftui-contract-app", root);
    const r = await runExtract(root, { positionals: [], flags: {} });
    expect(r.exitCode).toBe(0);
    const tokens = JSON.parse(readFileSync(join(root, "design", "tokens.draft.json"), "utf8"));
    expect(tokens.primitive.font.sans.$value).toEqual(["system-ui", "Readex Pro", "sans-serif"]);
    expect(fontsList(tokens)).toEqual([{ family: "Readex Pro", files: [{ path: "Qahwa/Fonts/ReadexPro.ttf", weight: 400, style: "normal" }] }]);
    expect(sources(tokens)).toEqual({ "Readex Pro": "project" });
    valid(root, tokens);
    expect((await runValidate(root, { tokens: "design/tokens.draft.json" })).exitCode).toBe(0);
  });
});

describe("collectSwiftUI's font files: fix round 1 (sweep Task 3, SwiftUI)", () => {
  const READEX_BYTES = readFileSync(join(import.meta.dir, "../../tests/fixtures/swiftui-contract-app/Qahwa/Fonts/ReadexPro.ttf"));
  const sources = (tokens: unknown) => Object.fromEntries(themeFonts(buildThemeSet(docFrom(tokens)).base).map((f) => [f.family, f.source]));
  /** The name table's records: [record offset, platform, nameID]. */
  const nameRecords = (b: Buffer) => {
    let at = -1;
    for (let i = 0, n = b.readUInt16BE(4); i < n; i++) if (b.toString("latin1", 12 + i * 16, 16 + i * 16) === "name") at = b.readUInt32BE(12 + i * 16 + 8);
    return Array.from({ length: b.readUInt16BE(at + 2) }, (_, i) => at + 6 + i * 12).map((rec) => [rec, b.readUInt16BE(rec), b.readUInt16BE(rec + 6)] as const);
  };
  /** A small TrueType file of a name table and a format 4 cmap with the given ranges: enough for Motif's reader. */
  const sfnt = (family: string, ranges: [number, number][]) => {
    const text = Buffer.from(family, "utf16le").swap16();
    const name = Buffer.alloc(18 + text.length);
    [0, 1, 18, 3, 1, 0x409, 1, text.length, 0].forEach((v, i) => name.writeUInt16BE(v, i * 2));
    text.copy(name, 18);
    const segs: [number, number][] = [...ranges, [0xffff, 0xffff]];
    const sub = Buffer.alloc(16 + segs.length * 8);
    sub.writeUInt16BE(4, 0);
    sub.writeUInt16BE(sub.length, 2);
    sub.writeUInt16BE(segs.length * 2, 6);
    segs.forEach(([start, end], k) => {
      sub.writeUInt16BE(end, 14 + k * 2);
      sub.writeUInt16BE(start, 16 + segs.length * 2 + k * 2);
      sub.writeUInt16BE(1, 16 + segs.length * 4 + k * 2);
    });
    const cmap = Buffer.concat([Buffer.from([0, 0, 0, 1, 0, 3, 0, 1, 0, 0, 0, 12]), sub]);
    const head = Buffer.alloc(12 + 2 * 16);
    head.writeUInt32BE(0x00010000, 0);
    head.writeUInt16BE(2, 4);
    const tables: [string, Buffer][] = [["cmap", cmap], ["name", name]];
    let offset = head.length;
    tables.forEach(([tag, data], i) => {
      head.write(tag, 12 + i * 16, "latin1");
      head.writeUInt32BE(offset, 12 + i * 16 + 8);
      head.writeUInt32BE(data.length, 12 + i * 16 + 12);
      offset += data.length;
    });
    return Buffer.concat([head, ...tables.map(([, data]) => data)]);
  };
  const withFonts = (swift: Record<string, string>, fonts: Record<string, Buffer>) => {
    const root = makeProject(swift);
    for (const [path, bytes] of Object.entries(fonts)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), bytes);
    }
    return root;
  };
  const PLIST = (file: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>UIAppFonts</key>\n\t<array>\n\t\t<string>${file}</string>\n\t</array>\n</dict>\n</plist>\n`;

  // The odd-length record (its family name) is skipped, so the family is its file's name; its other tables still give
  // its weight (Regular, 400, whatever its file says).
  test("a font with an odd-length name record, or cut short, doesn't stop extract: it's matched by its file's name", async () => {
    const odd = Buffer.from(READEX_BYTES);
    const [rec] = nameRecords(odd).find(([, platform, id]) => platform === 3 && id === 1)!;
    odd.writeUInt16BE(odd.readUInt16BE(rec + 8) - 1, rec + 8);
    const root = withFonts(
      { "Shop/Cart.swift": 'import SwiftUI\nlet a = Font.custom("ReadexPro", size: 16)\nlet b = Font.custom("Inter", size: 14)\n' },
      { "Shop/Fonts/ReadexPro-Bold.ttf": odd, "Shop/Fonts/Inter-Regular.ttf": READEX_BYTES.subarray(0, 200) },
    );
    expect(collect(root).projectFonts).toEqual([
      { family: "ReadexPro", files: [{ path: "Shop/Fonts/ReadexPro-Bold.ttf", weight: 400, style: "normal" }] },
      { family: "Inter", files: [{ path: "Shop/Fonts/Inter-Regular.ttf", weight: 400, style: "normal" }] },
    ]);
    // End to end, as the review saw it: extract drafts; it doesn't stop with "Motif hit an unexpected problem".
    const app = makeProject({});
    cpSync(join(FIXTURES, "swiftui-min"), app, { recursive: true });
    writeFileSync(join(app, "SwiftUIMin/Fonts/NotoNaskhArabic.ttf"), odd);
    expect((await runExtract(app, { positionals: [], flags: {} })).exitCode).toBe(0);
  });

  test("the reader never throws: 200 damaged copies of a real font, random bytes, and a file over 30 MB read by its name", () => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const fonts: Record<string, Buffer> = {};
    for (let s = 0; s < 200; s++) {
      const b = Buffer.from(READEX_BYTES.subarray(0, 4000 + s * 50));
      for (let k = 0; k < 40; k++) b[Math.floor(random() * Math.min(b.length, 4000))] = Math.floor(random() * 256);
      b.writeUInt32BE(0x00010000, 0);
      fonts[`F/M${s}.ttf`] = b;
    }
    const noise = Buffer.from(Array.from({ length: 3000 }, () => Math.floor(random() * 256)));
    noise.writeUInt32BE(0x00010000, 0);
    fonts["F/Noise.ttf"] = noise;
    const root = withFonts({ "F/V.swift": "import SwiftUI\n" }, fonts);
    // Larger than any real font: read as its name, not its tables (Readex Pro's tables at its head would say Readex Pro).
    writeFileSync(join(root, "F/Huge-Bold.ttf"), Buffer.concat([READEX_BYTES, Buffer.alloc(31 * 1024 * 1024)]));
    const files = appFontFiles(root);
    expect(files.length).toBe(202);
    expect(files.find((f) => f.path === "F/Huge-Bold.ttf")).toMatchObject({ family: "Huge", weight: 700 });
  });

  test("a registered Arabic font Motif doesn't know isn't the companion after the system font, which motif tokens would drop: a note says how to use it", () => {
    const root = withFonts(
      { "Shop/Info.plist": PLIST("ReqdexPro.ttf"), "Shop/Cart.swift": 'import SwiftUI\nstruct Cart: View { var body: some View { Text("Cart") } }\n' },
      { "Shop/Fonts/ReqdexPro.ttf": sfnt("Reqdex Pro", [[0x20, 0x7e], [0x0600, 0x06ff]]) },
    );
    const occ = collect(root);
    expect(occ.companion).toBeUndefined();
    expect(occ.notes).toContain(
      'Reqdex Pro is registered in your app\'s Info.plist and covers Arabic, but Motif can only treat a font it knows as the Arabic companion after the system font, so no type role uses it yet; its files are in the guide\'s fonts list. To use it, name a Latin font first ("SF Pro, Reqdex Pro").',
    );
    const tokens = buildDraft(occ).tokens as any;
    expect(tokens.primitive.font.sans.$value).toEqual(["system-ui", "sans-serif"]);
    // Fix round 2: its files stay in the guide's fonts list, ready for when a role names it.
    expect(tokens.$extensions["dev.motif"].fonts).toEqual([{ family: "Reqdex Pro", files: [{ path: "Shop/Fonts/ReqdexPro.ttf", weight: 400, style: "normal" }] }]);
    expect(validateTokens(docFrom(tokens))).toEqual([]);
    expect(checkProjectFontFiles(root, readProjectFonts(docFrom(tokens)).fonts, docFrom(tokens)).filter((f) => f.severity === "error")).toEqual([]);
  });

  test("a named Latin family beside a named shipped Arabic family: the Arabic one is the companion, both are the app's own", () => {
    const root = withFonts(
      { "Shop/Cart.swift": 'import SwiftUI\nlet a = Font.custom("Inter", size: 16)\nlet b = Font.custom("Inter", size: 22)\nlet c = Font.custom("Readex Pro", size: 16)\n' },
      { "Shop/Fonts/Inter.ttf": sfnt("Inter", [[0x20, 0x7e], [0xa0, 0x17f]]), "Shop/Fonts/ReadexPro.ttf": READEX_BYTES },
    );
    const occ = collect(root);
    expect(occ.companion).toBe("Readex Pro");
    const { tokens } = buildDraft(occ);
    expect((tokens as any).primitive.font.sans.$value).toEqual(["Inter", "Readex Pro", "system-ui", "sans-serif"]);
    expect(sources(tokens)).toEqual({ Inter: "project", "Readex Pro": "project" });
  });

  test("a Latin font's character map doesn't read as Arabic; Readex Pro's does", () => {
    const root = withFonts({ "F/V.swift": "import SwiftUI\n" }, { "F/Latin.ttf": sfnt("Latin Sans", [[0x20, 0x7e], [0xa0, 0x24f]]), "F/Readex.ttf": READEX_BYTES });
    expect(appFontFiles(root).map((f) => [f.family, f.arabic])).toEqual([["Latin Sans", false], ["Readex Pro", true]]);
  });

  test("UIFont(name:)'s family is noted as written in UIFont(name:)", () => {
    const occ = collect(makeProject({ "Shop/Kit.swift": 'import UIKit\nlet f = UIFont(name: "Brandon Grotesque", size: 16)\n' }));
    expect(occ.unfoundFonts).toEqual([{ family: "Brandon Grotesque", from: 'UIFont(name: "Brandon Grotesque")' }]);
  });

  test("the system's own families by their PostScript names aren't noted as missing (ArialMT, TimesNewRomanPS-BoldMT, SF Arabic…)", () => {
    const system = [
      "NewYorkMedium-Bold", "ArialMT", "Arial-BoldMT", "TimesNewRomanPSMT", "TimesNewRomanPS-BoldMT", "CourierNewPSMT", "SF Arabic", "SFArabic-Regular",
      "SF Arabic Rounded", "SF Compact Rounded", "SF Compact", "New York Small", "New York Extra Large", "Hiragino Kaku Gothic ProN", "Sinhala Sangam MN",
      "Gurmukhi MN", "Noto Sans Kannada", "BodoniSvtyTwoITCTT-Book",
    ];
    for (const n of system) expect([n, isSystemFamily(n)]).toEqual([n, true]);
    for (const n of ["Tajawal", "Brandon Grotesque", "Inter"]) expect([n, isSystemFamily(n)]).toEqual([n, false]);
  });
});
