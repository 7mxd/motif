import { cpSync, readFileSync } from "node:fs";
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runExtract } from "../src/commands/extract";
import { buildDraft } from "../src/extract/draft";
import { SWIFTUI } from "../src/stacks/swiftui";
import { collectSwiftUI } from "../src/stacks/swiftui/extract";
import type { AppInfo } from "../src/detect/stacks";
import { FIXTURES } from "./helpers";
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
