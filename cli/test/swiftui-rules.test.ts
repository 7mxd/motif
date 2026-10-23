import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { buildScale } from "../src/check/scale";
import { suggestRole } from "../src/check/suggest";
import type { Hit } from "../src/check/types";
import { buildTheme } from "../src/generate/theme";
import { SWIFTUI } from "../src/stacks/swiftui";
import { swiftUIPaletteFile } from "../src/stacks/swiftui/palette";
import { scanSwift, swiftUIFix, swiftUIReducedMotion, swiftUIRole } from "../src/stacks/swiftui/rules";
import { docFrom, validTokens } from "./helpers";

const theme = buildTheme(docFrom(validTokens()));
const scale = buildScale(theme, "App/Design");
const file = (text: string, path = "App/Home.swift"): SourceFile => ({ path, abs: path, text, lang: "swift" });
const scan = (text: string) => scanSwift(file(text), scale);
const one = (src: string) => {
  const hits = scan(src);
  expect(hits).toHaveLength(1);
  return hits[0]!;
};
const at = (src: string, needle: string) => {
  const i = src.indexOf(needle);
  expect(i).toBeGreaterThanOrEqual(0);
  const before = src.slice(0, i).split("\n");
  return { line: before.length, column: before[before.length - 1]!.length + 1 };
};
const pick = (h: Hit) => ({
  rule: h.rule, line: h.line, column: h.column, kind: h.kind, text: h.text, violation: h.violation,
  ...(h.value !== undefined ? { value: h.value } : {}), ...(h.context !== undefined ? { context: h.context } : {}),
});
const raw = String.raw;

describe("the SwiftUI stack checks Swift", () => {
  test("is wired into the registry", () => {
    expect(SWIFTUI.scan).toBe(scanSwift);
    expect(SWIFTUI.fix).toBe(swiftUIFix);
    expect(SWIFTUI.role).toBe(swiftUIRole);
    expect(SWIFTUI.paletteFile).toBe(swiftUIPaletteFile);
    expect(SWIFTUI.appWide).toBeDefined();
  });
});

describe("raw-color in Swift", () => {
  test("Color(red:green:blue:) is #rrggbb; .background is a background", () => {
    const src = "Text(\"Hi\")\n    .background(Color(red: 0.2, green: 0.4, blue: 1))\n";
    expect(pick(one(src))).toEqual({
      rule: "raw-color", ...at(src, "Color(red"), kind: "color", text: "Color(red: 0.2, green: 0.4, blue: 1)", violation: true, value: "#3366ff", context: "background",
    });
  });

  test("Color(.sRGB, red:…, opacity:) keeps the opacity; foregroundStyle is text", () => {
    const src = ".foregroundStyle(Color(.sRGB, red: 1, green: 0, blue: 0, opacity: 0.5))";
    expect(pick(one(src))).toMatchObject({ rule: "raw-color", value: "#ff000080", context: "text" });
  });

  test("Color(hex: \"#…\"), Color(\"#…\") and hex integers", () => {
    expect(pick(one('Rectangle().fill(Color(hex: "#3B82F6"))'))).toMatchObject({ rule: "raw-color", value: "#3b82f6", context: "background", text: 'Color(hex: "#3B82F6")' });
    expect(pick(one('.border(Color("#fff"))'))).toMatchObject({ value: "#ffffff", context: "border" });
    expect(pick(one("let c = Color(hex: 0xFF8800)"))).toMatchObject({ value: "#ff8800" });
  });

  test("a colour built from variables is data, not a typed colour", () => {
    expect(scan(["let c = Color(hex: brand)", "let d = Color(red: r, green: g, blue: b)"].join("\n"))).toEqual([]);
  });

  test("UIColor(red:…) and NSColor(white:…)", () => {
    expect(pick(one("let c = UIColor(red: 1, green: 1, blue: 1, alpha: 1)"))).toMatchObject({ rule: "raw-color", value: "#ffffff" });
    expect(pick(one("let c = Color(white: 0)"))).toMatchObject({ rule: "raw-color", value: "#000000" });
  });

  test("named colours: Color.red, Color(uiColor: .systemRed), and .red given to a colour modifier", () => {
    const src = "Text(\"x\").foregroundColor(Color.red)\n";
    expect(pick(one(src))).toMatchObject({ rule: "raw-color", ...at(src, "Color.red"), text: "Color.red", context: "text" });
    expect(pick(one("let c = Color(uiColor: .systemRed)"))).toMatchObject({ rule: "raw-color", text: "Color(uiColor: .systemRed)" });
    expect(pick(one("let c = UIColor.systemBlue"))).toMatchObject({ rule: "raw-color", text: "UIColor.systemBlue" });
    const implicit = "Text(\"x\").foregroundStyle(.white)\n";
    expect(pick(one(implicit))).toMatchObject({ rule: "raw-color", ...at(implicit, ".white"), text: ".white", context: "text" });
    expect(pick(one("Circle().fill(.blue)"))).toMatchObject({ rule: "raw-color", text: ".blue", context: "background" });
  });

  test("colour used inside a gradient in a background is a background", () => {
    expect(pick(one("v.background(LinearGradient(colors: [Color(red: 1, green: 0, blue: 0)], startPoint: .top, endPoint: .bottom))"))).toMatchObject({ context: "background" });
  });

  test("not findings: clear, primary, secondary, accentColor, semantic Color(.label), asset-catalogue names", () => {
    const src = [
      "Text(\"x\").foregroundColor(Color.primary)",
      "Text(\"x\").foregroundStyle(.secondary)",
      "Color.clear",
      "Rectangle().fill(.clear)",
      "Color.accentColor",
      "Color(.label)",
      "Color(.systemBackground)",
      "Color(\"Brand\")",
      "Color(uiColor: .label)",
      "Image(\"photo\").foregroundStyle(.tint)",
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });

  test("not findings: colour code in a comment or a multi-line string", () => {
    const src = [
      "// Color(red: 0.2, green: 0.4, blue: 1)",
      "/* .foregroundColor(.red) */",
      'let docs = """',
      "    Color(red: 0.2, green: 0.4, blue: 1)",
      '    Use Color.red for errors, .padding(13) for gaps',
      '    """',
      'let raw = #"Color(hex: "#fff")"#',
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });

  test("a colour call inside an interpolation is code", () => {
    const src = raw`Text("\(Color(red: 1, green: 0, blue: 0))")`;
    expect(one(src).rule).toBe("raw-color");
  });

  test("an import line is never a finding", () => {
    expect(scan("import SwiftUI\n")).toEqual([]);
  });
});

describe("off-scale in Swift", () => {
  test(".padding(13) is off the scale; .padding(16) is seen and allowed", () => {
    const src = "Text(\"x\").padding(13)\n";
    expect(pick(one(src))).toEqual({ rule: "off-scale", ...at(src, ".padding"), kind: "space", text: ".padding(13)", violation: true, value: "13px" });
    expect(pick(one("Text(\"x\").padding(16)"))).toMatchObject({ rule: "off-scale", violation: false, value: "16px" });
  });

  test(".padding(.horizontal, N), edge sets, and EdgeInsets", () => {
    expect(pick(one("v.padding(.horizontal, 15)"))).toMatchObject({ kind: "space", violation: true, value: "15px", text: ".padding(.horizontal, 15)" });
    expect(pick(one("v.padding([.top, .bottom], 7)"))).toMatchObject({ kind: "space", violation: true, value: "7px", text: ".padding([.top, .bottom], 7)" });
    const insets = scan("v.padding(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))");
    expect(insets.map((h) => [h.value, h.violation])).toEqual([["5px", true], ["16px", false], ["5px", true], ["16px", false]]);
  });

  test("spacing: N in stacks and grids", () => {
    const src = "VStack(alignment: .leading, spacing: 10) {\n}\n";
    expect(pick(one(src))).toEqual({ rule: "off-scale", ...at(src, "spacing"), kind: "space", text: "spacing: 10", violation: true, value: "10px" });
    expect(pick(one("HStack(spacing: 8) { }"))).toMatchObject({ violation: false, value: "8px" });
  });

  test(".cornerRadius(7) and RoundedRectangle(cornerRadius:) are radius", () => {
    const src = "v.cornerRadius(7)\n";
    expect(pick(one(src))).toEqual({ rule: "off-scale", ...at(src, ".cornerRadius"), kind: "radius", text: ".cornerRadius(7)", violation: true, value: "7px" });
    expect(pick(one("v.clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))"))).toMatchObject({ kind: "radius", violation: true, value: "12px" });
    expect(pick(one("v.clipShape(RoundedRectangle(cornerRadius: 8))"))).toMatchObject({ kind: "radius", violation: false });
  });

  test(".font(.system(size: 15)) is off the text roles; a role's own size is allowed", () => {
    const src = "Text(\"x\").font(.system(size: 15))\n";
    expect(pick(one(src))).toEqual({ rule: "off-scale", ...at(src, ".system"), kind: "font-size", text: ".system(size: 15)", violation: true, value: "15px" });
    expect(pick(one("Text(\"x\").font(.system(size: 16, weight: .bold))"))).toMatchObject({ kind: "font-size", violation: false });
    expect(pick(one("let f = Font.system(size: 13)"))).toMatchObject({ kind: "font-size", violation: true });
  });

  test("not findings: bare .padding(), .padding(.horizontal), Spacer(minLength: 0), semantic fonts", () => {
    const src = [
      "v.padding()",
      "v.padding(.horizontal)",
      "v.padding([.top, .bottom])",
      "Spacer(minLength: 0)",
      "Spacer()",
      "Text(\"x\").font(.body)",
      "Text(\"x\").font(.system(.body, design: .rounded))",
      "v.padding(MotifSpace.s4)",
      "v.padding(.horizontal, spacing)",
      "HStack(spacing: MotifSpace.s2) { }",
      "v.cornerRadius(MotifRadius.md)",
      "// v.padding(13)",
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });

  test("a negative size keeps its sign in the message, and is on the scale when its size is (as the other stacks judge it)", () => {
    const src = "v.padding(.bottom, -2)\n";
    const hit = one(src);
    expect(pick(hit)).toEqual({ rule: "off-scale", ...at(src, ".padding"), kind: "space", text: ".padding(.bottom, -2)", violation: true, value: "2px" });
    expect(hit.message).toBe("Spacing -2pt isn't on your spacing scale.");
    expect(one("v.padding(.top, -8)")).toMatchObject({ violation: false, value: "8px", message: "Spacing -8pt isn't on your spacing scale." });
    expect(one("HStack(spacing: -6) { }")).toMatchObject({ violation: true, value: "6px", message: "Spacing -6pt isn't on your spacing scale." });
    expect(one("v.padding(EdgeInsets(top: -3, leading: MotifSpace.s0))")).toMatchObject({
      violation: true, message: "Spacing -3pt isn't on your spacing scale.",
    });
    expect(one("v.padding(13)").message).toBe("Spacing 13pt isn't on your spacing scale.");
  });

  test("zero is on every scale", () => {
    expect(pick(one("v.padding(0)"))).toMatchObject({ kind: "space", violation: false, value: "0px" });
  });

  test("a call over several lines is one hit, in one line", () => {
    const hits = scan("v.padding(\n    13\n)");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.text).toBe(".padding(13)");
  });

  test("without a scale (extract) every size is seen and none judged", () => {
    const hits = scanSwift(file("v.padding(13)"), null);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.violation).toBe(false);
  });
});

describe("raw-font in Swift", () => {
  test(".font(.custom(\"…\", size:)) names the family", () => {
    const src = 'Text("x").font(.custom("Georgia", size: 18))\n';
    expect(pick(one(src))).toEqual({ rule: "raw-font", ...at(src, '.custom'), kind: "font-family", text: '.custom("Georgia", size: 18)', violation: true, value: "Georgia" });
    expect(pick(one('let f = Font.custom("Inter-Bold", size: 14, relativeTo: .body)'))).toMatchObject({ rule: "raw-font", value: "Inter-Bold" });
    expect(pick(one('let f = UIFont(name: "Menlo", size: 12)'))).toMatchObject({ rule: "raw-font", value: "Menlo" });
  });

  test("not findings: .custom of something else, system fonts", () => {
    expect(scan("v.presentationDetents([.custom(MyDetent.self)])\nText(\"x\").font(.title)")).toEqual([]);
  });
});

describe("raw-motion in Swift", () => {
  test(".animation(.easeIn(duration: 0.3), value:) is a hard-coded curve and an off-scale duration", () => {
    const src = "v.animation(.easeIn(duration: 0.3), value: on)\n";
    const hits = scan(src);
    expect(hits.map(pick)).toEqual([
      { rule: "raw-motion", ...at(src, ".easeIn"), kind: "duration", text: ".easeIn(duration: 0.3)", violation: true, value: "300ms" },
      { rule: "raw-motion", ...at(src, ".easeIn"), kind: "easing", text: ".easeIn(duration: 0.3)", violation: true, value: "easeIn" },
    ]);
  });

  test("a duration on the guide's scale is seen and allowed; the curve is still a finding", () => {
    const hits = scan("withAnimation(.easeInOut(duration: 0.2)) { on.toggle() }");
    expect(hits.map((h) => [h.kind, h.violation, h.value])).toEqual([["duration", false, "200ms"], ["easing", true, "easeInOut"]]);
  });

  test(".linear(duration:) and .easeOut with no duration", () => {
    expect(scan("v.animation(.linear(duration: 1), value: x)").map((h) => [h.kind, h.violation])).toEqual([["duration", true], ["easing", true]]);
    expect(scan("withAnimation(.easeOut) { }").map((h) => [h.kind, h.violation])).toEqual([["easing", true]]);
  });

  test(".timingCurve gives its cubic-bezier", () => {
    const hits = scan("withAnimation(.timingCurve(0.2, 0, 0, 1, duration: 0.2)) { }");
    expect(hits.find((h) => h.kind === "easing")).toMatchObject({ value: "cubic-bezier(0.2, 0, 0, 1)", violation: true });
    expect(hits.find((h) => h.kind === "duration")).toMatchObject({ value: "200ms", violation: false });
  });

  test("spring literals, both forms", () => {
    const src = "withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) { }\n";
    expect(pick(one(src))).toEqual({ rule: "raw-motion", ...at(src, ".spring"), kind: "spring", text: ".spring(response: 0.4, dampingFraction: 0.7)", violation: true, value: ".spring(response: 0.4, dampingFraction: 0.7)" });
    expect(pick(one("v.animation(.spring(duration: 0.5, bounce: 0.2), value: x)"))).toMatchObject({ kind: "spring", violation: true });
    expect(pick(one("v.animation(.bouncy(duration: 0.5), value: x)"))).toMatchObject({ kind: "spring" });
  });

  test("withAnimation(.default)", () => {
    const src = "withAnimation(.default) { x = 1 }\n";
    expect(pick(one(src))).toMatchObject({ rule: "raw-motion", ...at(src, ".default"), kind: "easing", violation: true });
    expect(one("v.animation(.default, value: x)").rule).toBe("raw-motion");
  });

  test("SwiftUI's own curve on Animation is still a hard-coded easing; only MotifCurves' are the theme's", () => {
    expect(scan("withAnimation(Animation.easeIn(duration: 0.3)) { }")).toContainEqual(expect.objectContaining({ rule: "raw-motion", kind: "easing" }));
  });

  test("not findings: the theme's own, a sleep, a spring with no numbers", () => {
    const src = [
      "withAnimation(MotifSprings.snappy) { }",
      "v.animation(MotifCurves.standard, value: x)",
      // A curve role named like SwiftUI's own, run over another duration as the guide teaches (Task 11 re-review).
      "withAnimation(MotifCurves.linear(over: MotifDurations.slow)) { }",
      "v.animation(MotifCurves .easeInOut(over: MotifDurations.base), value: x)",
      "withAnimation(MotifMotion.animation(MotifSprings.smooth, reduceMotion: reduceMotion)) { }",
      "try await Task.sleep(for: .seconds(2))",
      "v.animation(.spring, value: x)",
      "withAnimation(.spring()) { }",
      "withAnimation { x = 1 }",
      "v.opacity(0.5)",
      "// withAnimation(.easeIn(duration: 0.3))",
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });

  test("without a scale every duration is seen and none judged", () => {
    const hits = scanSwift(file("withAnimation(.easeIn(duration: 0.3)) { }"), null);
    expect(hits.find((h) => h.kind === "duration")!.violation).toBe(false);
  });
});

describe("reduced-motion in Swift", () => {
  const files = (...texts: string[]) => texts.map((t, i) => file(t, `App/File${i}.swift`));
  test("an app that animates and never reads the setting gets one hit, at the first animation", () => {
    const src = "struct A: View {\n    var body: some View {\n        Text(\"x\").animation(MotifSprings.snappy, value: on)\n    }\n}\n";
    const hits = swiftUIReducedMotion(files(src));
    expect(hits.map((h) => [h.rule, h.file, h.line, h.column, h.violation])).toEqual([["reduced-motion", "App/File0.swift", 3, 18, true]]);
    expect(hits[0]!.message).toContain("Reduce Motion");
    expect(hits[0]!.fix).toContain("accessibilityReduceMotion");
  });
  test("reading accessibilityReduceMotion, or using MotifMotion, in any file clears it", () => {
    const animates = "withAnimation(MotifSprings.snappy) { }";
    expect(swiftUIReducedMotion(files(animates, "@Environment(\\.accessibilityReduceMotion) private var reduce"))).toEqual([]);
    expect(swiftUIReducedMotion(files(animates, "let a = MotifMotion.animation(x, reduceMotion: r)"))).toEqual([]);
    expect(swiftUIReducedMotion(files("UIAccessibility.isReduceMotionEnabled\n" + animates))).toEqual([]);
  });
  test("a mention in a comment or a string does not count; no animation, no hit", () => {
    expect(swiftUIReducedMotion(files("// accessibilityReduceMotion\nlet s = \"MotifMotion.\"\nwithAnimation(MotifSprings.snappy) { }"))).toHaveLength(1);
    expect(swiftUIReducedMotion(files("Text(\"x\")"))).toEqual([]);
  });
});

describe("fixes and roles, in Swift", () => {
  const fix = (src: string) => swiftUIFix(scan(src)[0]!);
  test("each rule says what to use in Swift", () => {
    expect(fix("let c = Color(red: 1, green: 0, blue: 0)")).toBe("Use colors.<role> from @Environment(\\.motifColors).");
    expect(fix("v.padding(13)")).toBe("Use MotifSpace.s<N>.");
    expect(fix("v.cornerRadius(7)")).toBe("Use MotifRadius.<role>.");
    expect(fix("Text(\"x\").font(.system(size: 15))")).toBe("Use .motifFont(.<role>).");
    expect(fix('Text("x").font(.custom("Georgia", size: 18))')).toBe("Use .motifFont(.<role>).");
    const motion = scan("withAnimation(.easeIn(duration: 0.3)) { }");
    expect(swiftUIFix(motion.find((h) => h.kind === "duration")!)).toBe("Use MotifDurations.<role> (seconds).");
    expect(swiftUIFix(motion.find((h) => h.kind === "easing")!)).toBe("Use MotifCurves.<role>.");
    expect(fix("withAnimation(.spring(duration: 0.5, bounce: 0.2)) { }")).toBe("Use MotifSprings.<role>.");
  });

  test("roles are written as the generated file names them", () => {
    expect(swiftUIRole("color", "text-secondary")).toBe("colors.textSecondary");
    expect(swiftUIRole("space", "4")).toBe("MotifSpace.s4");
    expect(swiftUIRole("radius", "md")).toBe("MotifRadius.md");
    expect(swiftUIRole("font-size", "body")).toBe(".motifFont(.body)");
    expect(swiftUIRole("duration", "fast")).toBe("MotifDurations.fast");
    expect(swiftUIRole("easing", "standard")).toBe("MotifCurves.standard");
    expect(swiftUIRole("spring", "snappy")).toBe("MotifSprings.snappy");
    expect(swiftUIRole("shadow", "md")).toBe("MotifShadows.md");
  });

  test("a close colour is suggested by its Swift role", () => {
    const hit = scan("Rectangle().fill(Color(red: 1, green: 1, blue: 1))")[0]!;
    const s = suggestRole(hit, theme, { variants: [], role: swiftUIRole });
    expect(s).toMatch(/^colors\./);
  });
});

describe("palette files in Swift", () => {
  const pal = (text: string, path = "App/Colors.swift") => {
    const f = file(text, path);
    return swiftUIPaletteFile(f, scanSwift(f, scale));
  };
  test("an extension Color of static lets is a palette", () => {
    expect(pal('import SwiftUI\n\nextension Color {\n    static let brand = Color(red: 0.2, green: 0.4, blue: 1)\n    static let accent2 = Color(hex: "#FF8800")\n}\n')).toBe(true);
  });
  test("a struct of colour constants is a palette", () => {
    expect(pal("enum Palette {\n    static let a = Color(red: 1, green: 0, blue: 0)\n    static let b = Color(red: 0, green: 1, blue: 0)\n}\n")).toBe(true);
  });
  test("a view with a colour is not", () => {
    expect(pal("struct V: View {\n    var body: some View { Text(\"x\").foregroundColor(Color(red: 1, green: 0, blue: 0)) }\n}\n")).toBe(false);
  });
  test("the app's entry point is never a palette", () => {
    expect(pal("@main\nstruct A: App {\n    var body: some Scene { WindowGroup { V() } }\n}\nextension Color {\n    static let a = Color(red: 1, green: 0, blue: 0)\n}\n")).toBe(false);
  });
  test("a file with no colour findings is not", () => {
    expect(pal("extension Color {\n    static let brand = Color(\"Brand\")\n}\n")).toBe(false);
  });
});
