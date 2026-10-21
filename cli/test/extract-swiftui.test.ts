import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
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

  test("the Color constant's own definition is not counted as a use", () => {
    expect(occ.colors.find((c) => c.value === "#336699")).toBeUndefined();
  });
});

describe("collectSwiftUI on parallel catalogues and unrelated namespaces", () => {
  const set = (name: string, hex: [string, string, string], dark?: [string, string, string]) => colorset(srgb(...hex), dark && srgb(...dark));
  test("a second catalogue is a variant named after it", () => {
    const root = makeProject({
      "A/Assets.xcassets/Primary.colorset/Contents.json": set("p", ["0.1", "0.2", "0.3"]),
      "A/PartnerAssets.xcassets/Primary.colorset/Contents.json": set("p", ["0.5", "0.5", "0.5"]),
      "A/V.swift": "import SwiftUI\n",
    });
    const occ = collect(root);
    expect(occ.variantLabels).toEqual({ partner: "Partner" });
    expect(occ.variables).toEqual([{ name: "--primary", light: "#1a334d", variants: { partner: { light: "#808080" } } }]);
  });

  test("a namespace whose colours nothing else shares just prefixes the names", () => {
    const root = makeProject({
      "A/Assets.xcassets/Brand/Contents.json": JSON.stringify({ properties: { "provides-namespace": true } }),
      "A/Assets.xcassets/Brand/Ink.colorset/Contents.json": set("i", ["0", "0", "0"]),
      "A/V.swift": "import SwiftUI\n",
    });
    const occ = collect(root);
    expect(occ.variables).toEqual([{ name: "--brand-ink", light: "#000000" }]);
    expect(occ.variantLabels).toBeUndefined();
  });
});
