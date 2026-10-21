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
