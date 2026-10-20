import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { buildScale } from "../src/check/scale";
import type { Hit } from "../src/check/types";
import { buildTheme } from "../src/generate/theme";
import { REACT_NATIVE } from "../src/stacks/react-native";
import { rnFix, rnPaletteFile, rnReducedMotion, rnRole, scanReactNative } from "../src/stacks/react-native/rules";
import { docFrom, validTokens } from "./helpers";

const scale = buildScale(buildTheme(docFrom(validTokens())), "src/design");
const file = (text: string, path = "src/app/index.tsx"): SourceFile => ({ path, abs: path, text, lang: "script" });
const scan = (text: string, opts: { nativewind?: boolean } = {}) => scanReactNative(file(text), scale, opts);
const at = (src: string, needle: string) => {
  const i = src.indexOf(needle);
  expect(i).toBeGreaterThanOrEqual(0);
  const before = src.slice(0, i).split("\n");
  return { line: before.length, column: before[before.length - 1]!.length + 1 };
};
const one = (src: string): Hit => {
  const hits = scan(src);
  expect(hits).toHaveLength(1);
  return hits[0]!;
};
const pick = (h: Hit) => ({ rule: h.rule, line: h.line, column: h.column, kind: h.kind, text: h.text, value: h.value, violation: h.violation });

describe("off-scale in style objects", () => {
  test("StyleSheet.create: spacing, radius and font size, each at its key", () => {
    const src = "const styles = StyleSheet.create({\n  card: { padding: 13, borderRadius: 10, marginTop: 8 },\n  title: { fontSize: 17 },\n});\n";
    const hits = scan(src);
    expect(hits.map(pick)).toEqual([
      { rule: "off-scale", ...at(src, "padding"), kind: "space", text: "padding: 13", value: "13px", violation: true },
      { rule: "off-scale", ...at(src, "borderRadius"), kind: "radius", text: "borderRadius: 10", value: "10px", violation: true },
      { rule: "off-scale", ...at(src, "marginTop"), kind: "space", text: "marginTop: 8", value: "8px", violation: false },
      { rule: "off-scale", ...at(src, "fontSize"), kind: "font-size", text: "fontSize: 17", value: "17px", violation: true },
    ]);
  });

  test("a style={{ … }} object is reported once, with the others of its kind", () => {
    const src = "const a = <View style={{ padding: 13, gap: 6, rowGap: 4, columnGap: 7 }} />;\n";
    expect(scan(src).map((h) => [h.kind, h.value, h.violation])).toEqual([
      ["space", "13px", true], ["space", "6px", true], ["space", "4px", false], ["space", "7px", true],
    ]);
  });

  test("style arrays, conditional styles and *Style props are style objects", () => {
    const src = [
      "const a = <View style={[styles.a, { marginLeft: 5 }]} />;",
      "const b = <View style={ok ? { paddingHorizontal: 9 } : null} />;",
      "const c = <FlatList contentContainerStyle={{ paddingBottom: 21 }} />;",
      "const d = <Tabs screenOptions={{ tabBarStyle: { height: 80, paddingTop: 3 } }} />;",
      "",
    ].join("\n");
    expect(scan(src).map((h) => [h.line, h.text])).toEqual([[1, "marginLeft: 5"], [2, "paddingHorizontal: 9"], [3, "paddingBottom: 21"], [4, "paddingTop: 3"]]);
  });

  test("corner variants and negative numbers (by magnitude)", () => {
    const src = "const s = StyleSheet.create({ a: { borderTopLeftRadius: 5, borderBottomEndRadius: 8, marginTop: -4, marginBottom: -5 } });\n";
    const hits = scan(src);
    expect(hits.map((h) => [h.kind, h.text, h.violation])).toEqual([
      ["radius", "borderTopLeftRadius: 5", true], ["radius", "borderBottomEndRadius: 8", false], ["space", "marginTop: -4", false], ["space", "marginBottom: -5", true],
    ]);
    expect(hits[3]!.value).toBe("5px");
  });

  test("a value on the scale is seen but allowed; zero is always allowed", () => {
    const hits = scan("const s = StyleSheet.create({ a: { padding: 16, margin: 0, fontSize: 14 } });\n");
    expect(hits.map((h) => h.violation)).toEqual([false, false, false]);
  });

  test("not positions, sizes, flex, line height or border width", () => {
    const src =
      "const s = StyleSheet.create({ a: { top: 13, left: 7, right: 3, bottom: 9, width: 101, height: 33, flex: 2, zIndex: 5, opacity: 0.5, aspectRatio: 1.5, lineHeight: 23, borderWidth: 3 } });\n";
    expect(scan(src)).toEqual([]);
  });

  test("not numbers outside a style: scrollTo, chart margins, plain objects, expressions and strings", () => {
    const src = [
      "scroll.scrollTo({ x: 0, y: 13 });",
      "const chart = { margin: 13, padding: 7 };",
      "const s = StyleSheet.create({ a: { padding: SIZE, margin: 4 * 3, gap: '10%', marginTop: 'auto' } });",
      "const t = 'style={{ padding: 13 }}';",
      "// style={{ padding: 13 }}",
      "const label = <Text>don't use padding: 13 here</Text>;",
      "",
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });

  test("a property of another object is not the key (theme.padding)", () => {
    expect(scan("const s = StyleSheet.create({ a: { x: theme.padding, y: other.fontSize } });\n")).toEqual([]);
  });
});

describe("raw-font", () => {
  test("fontFamily with a literal is reported with the family", () => {
    const src = "const s = StyleSheet.create({ t: { fontFamily: 'Inter-Bold', fontSize: 16 } });\n";
    const hits = scan(src).filter((h) => h.rule === "raw-font");
    expect(hits.map(pick)).toEqual([{ rule: "raw-font", ...at(src, "fontFamily"), kind: "font-family", text: "fontFamily: 'Inter-Bold'", value: "Inter-Bold", violation: true }]);
  });

  test("a font from the theme is not", () => {
    expect(scan("const s = { fontFamily: type.body.fontFamily };\nconst t = <Text style={{ ...type.body }} />;\n")).toEqual([]);
  });
});

describe("raw-motion", () => {
  test("withTiming / withDelay / Animated.timing durations", () => {
    const src = [
      "a.value = withTiming(1, { duration: 300 });",
      "b.value = withDelay(100, withTiming(1, { duration: 200, easing: Easing.linear }));",
      "Animated.timing(v, { toValue: 1, duration: 450, useNativeDriver: true }).start();",
      "",
    ].join("\n");
    const hits = scan(src);
    expect(hits.map((h) => [h.line, h.rule, h.kind, h.text, h.value, h.violation])).toEqual([
      [1, "raw-motion", "duration", "duration: 300", "300ms", true],
      [2, "raw-motion", "duration", "duration: 200", "200ms", false],
      [3, "raw-motion", "duration", "duration: 450", "450ms", true],
    ]);
    expect(hits[0]).toMatchObject(at(src, "duration: 300"));
  });

  test("a layout animation's .duration(N)", () => {
    const src = "const a = <Animated.View entering={FadeIn.duration(500)} exiting={SlideOutLeft.delay(50).duration(120)} />;\n";
    expect(scan(src).map((h) => [h.kind, h.text, h.value, h.violation])).toEqual([["duration", ".duration(500)", "500ms", true], ["duration", ".duration(120)", "120ms", false]]);
  });

  test("a duration that isn't an animation is not: toasts, other libraries, timers", () => {
    expect(scan("toast.show('hi', { duration: 4000 });\nconst d = moment.duration(5, 'minutes');\nconst e = dayjs.duration(500);\nsetTimeout(f, 300);\n")).toEqual([]);
  });

  test("easings: bezier, ease, in/out/inOut; not linear, nor the curve inside Easing.out", () => {
    const src = [
      "withTiming(1, { easing: Easing.bezier(0.4, 0, 0.2, 1) });",
      "withTiming(1, { easing: Easing.ease });",
      "withTiming(1, { easing: Easing.out(Easing.cubic) });",
      "withTiming(1, { easing: Easing.inOut(Easing.ease) });",
      "withTiming(1, { easing: Easing.linear });",
      "",
    ].join("\n");
    const hits = scan(src).filter((h) => h.kind === "easing");
    expect(hits.map((h) => [h.line, h.text, h.violation])).toEqual([
      [1, "Easing.bezier(0.4, 0, 0.2, 1)", true], [2, "Easing.ease", true], [3, "Easing.out(Easing.cubic)", true], [4, "Easing.inOut(Easing.ease)", true],
    ]);
    expect(hits[0]).toMatchObject({ value: "cubic-bezier(0.4, 0, 0.2, 1)", ...at(src, "Easing.bezier") });
  });

  test("springs: literal damping, stiffness and mass in withSpring, and after .springify()", () => {
    const src = [
      "x.value = withSpring(1, { damping: 12, stiffness: 180 });",
      "y.value = withSpring(1, spring.snappy);",
      "const a = <Animated.View layout={LinearTransition.springify().damping(14).mass(2)} />;",
      "const b = { damping: 3 };",
      "",
    ].join("\n");
    expect(scan(src).map((h) => [h.line, h.kind, h.text, h.violation])).toEqual([
      [1, "spring", "damping: 12", true], [1, "spring", "stiffness: 180", true], [3, "spring", ".damping(14)", true], [3, "spring", ".mass(2)", true],
    ]);
  });

  test("durations, easings and springs from the theme are not", () => {
    expect(scan("x.value = withTiming(1, { duration: duration.base, easing: easing.standard });\ny.value = withSpring(1, spring.snappy);\n")).toEqual([]);
  });
});

describe("colours and Tailwind", () => {
  test("a colour in a style is reported with its context; Tailwind only with nativewind", () => {
    const src = "const s = StyleSheet.create({ a: { color: '#333333', backgroundColor: '#3b82f6' } });\nconst b = <View className=\"bg-blue-500 p-[13px]\" />;\n";
    expect(scan(src).map((h) => [h.rule, h.value, h.context])).toEqual([["raw-color", "#333333", "text"], ["raw-color", "#3b82f6", "background"]]);
    expect(scan(src, { nativewind: true }).map((h) => h.rule)).toContain("tailwind-palette");
  });
});

describe("fixes and roles", () => {
  const fix = (src: string) => rnFix(one(src));
  test("each kind names the theme file's export", () => {
    expect(fix("StyleSheet.create({ a: { color: '#333333' } });")).toBe("Use colors.<role> from useMotifTheme().");
    expect(fix("StyleSheet.create({ a: { padding: 13 } })")).toBe("Use space.s<N>.");
    expect(fix("StyleSheet.create({ a: { borderRadius: 10 } })")).toBe("Use radius.<role>.");
    expect(fix("StyleSheet.create({ a: { fontSize: 17 } })")).toBe("Use type.<role>.");
    expect(fix("StyleSheet.create({ a: { fontFamily: 'Inter' } })")).toBe("Use type.<role>.");
    expect(fix("withTiming(1, { duration: 333 })")).toBe("Use duration.<role>.");
    expect(fix("withTiming(1, { easing: Easing.ease })")).toBe("Use easing.<role>.");
    expect(fix("withSpring(1, { damping: 9 })")).toBe("Use spring.<role>.");
    expect(one("StyleSheet.create({ a: { padding: 13 } })").fix).toBe("Use space.s<N>.");
  });

  test("role names the theme file's members", () => {
    expect(rnRole("space", "4")).toBe("space.s4");
    expect(rnRole("radius", "md")).toBe("radius.md");
    expect(rnRole("font-size", "body")).toBe("type.body");
    expect(rnRole("color", "text-secondary")).toBe("colors.textSecondary");
    expect(rnRole("duration", "base")).toBe("duration.base");
    expect(rnRole("easing", "standard")).toBe("easing.standard");
    expect(rnRole("spring", "snappy")).toBe("spring.snappy");
    expect(REACT_NATIVE.role).toBe(rnRole);
    expect(REACT_NATIVE.fix).toBe(rnFix);
  });
});

describe("reduced motion", () => {
  const files = (...texts: string[]) => texts.map((t, i) => file(t, `src/f${i}.tsx`));
  test("an app that animates and never reads the setting is reported at the first animation", () => {
    const hits = rnReducedMotion(files("export const a = 1;\n", "const v = useSharedValue(0);\n"));
    expect(hits.map((h) => [h.rule, h.file, h.line, h.column, h.violation])).toEqual([["reduced-motion", "src/f1.tsx", 1, 11, true]]);
    expect(hits[0]!.message).toBe('Animations here ignore the "reduce motion" setting.');
  });

  test.each([
    "const r = useReducedMotion();",
    "withTiming(1, { reduceMotion: ReduceMotion.System });",
    "const { reducedMotion } = useMotifTheme();",
    "const d = useMotifTheme().reducedMotion ? 0 : 200;",
  ])("%s anywhere in the app is enough", (use) => {
    expect(rnReducedMotion(files("withTiming(1, { duration: 200 });\n", `${use}\n`))).toEqual([]);
  });

  test("each kind of animation counts; comments and an app with no animation do not", () => {
    for (const a of ["useSharedValue(0)", "withSpring(1)", "Animated.timing(v, {})", "<View entering={FadeIn} />", "<View exiting={FadeOut} />", "LayoutAnimation.configureNext(x)"]) {
      expect(rnReducedMotion(files(`${a};\n`))).toHaveLength(1);
    }
    expect(rnReducedMotion(files("// useSharedValue(0)\nconst a = 1;\n"))).toEqual([]);
    expect(rnReducedMotion(files("export const a = 1;\n"))).toEqual([]);
  });
});

describe("palette files", () => {
  const palette = (text: string, path = "src/constants/Colors.ts") => {
    const f = file(text, path);
    return rnPaletteFile(f, scanReactNative(f, scale, {}));
  };
  test("the starter's constants/Colors.ts with light and dark sub-objects", () => {
    expect(palette("export const Colors = {\n  light: { text: '#11181C', background: '#ffffff', tint: '#0a7ea4' },\n  dark: { text: '#ECEDEE', background: '#151718', tint: '#ffffff' },\n};\n")).toBe(true);
  });
  test("a flat exported object of colours, with as const", () => {
    expect(palette("export const palette = {\n  ink: '#111111',\n  paper: '#fafafa',\n} as const;\n")).toBe(true);
  });
  test("a screen with a few colours among styles is not", () => {
    expect(palette("export const styles = StyleSheet.create({ a: { color: '#333333', padding: 4 } });\nexport default function S() { return null; }\n", "src/app/index.tsx")).toBe(false);
  });
  test("an exported object that is mostly sizes is not", () => {
    expect(palette("export const theme = { primary: '#111111', a: 1, b: 2, c: 3, d: 4 };\n")).toBe(false);
  });
});
