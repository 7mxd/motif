import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runTokens } from "../src/commands/tokens";
import { FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");
const pkg = (deps: Record<string, string> = {}) =>
  JSON.stringify({
    name: "shop",
    main: "expo-router/entry",
    dependencies: { expo: "~54.0.1", "expo-router": "~6.0.0", react: "19.1.0", "react-native": "0.81.4", "react-native-reanimated": "~3.16.0", ...deps },
  });
const HOME = `import { StyleSheet, View } from "react-native";

export default function Home() {
  return <View style={{ padding: 13, backgroundColor: "#3b82f6" }} />;
}

export const styles = StyleSheet.create({
  // motif-ok: partner brand
  card: { color: "#ff00aa", marginTop: 8 },
  title: { fontFamily: "Inter-Bold", fontSize: 17, borderRadius: 10 },
});
`;
const FADE = `import { useSharedValue, withTiming } from "react-native-reanimated";

export function useFade() {
  const v = useSharedValue(0);
  v.value = withTiming(1, { duration: 333 });
  return v;
}
`;
const REDUCED = `import { useReducedMotion } from "react-native-reanimated";

export const useQuiet = () => useReducedMotion();
`;

/** An Expo app at the project's root as create-expo-app lays it out, with its theme code written by motif tokens. */
async function expoApp(files: Record<string, string>, deps: Record<string, string> = {}): Promise<string> {
  const root = makeProject({
    "package.json": pkg(deps),
    "app.json": JSON.stringify({ expo: { name: "shop" } }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, paths: { "@/*": ["./*"] } } }),
    "app/_layout.tsx": "export default function Layout() { return null; }\n",
    "design/tokens.json": TOKENS,
    ...files,
  });
  expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
  return root;
}
const check = (root: string) => runCheck(root, { positionals: [] });
const where = (r: any) => (r.data.violations as any[]).map((h) => `${h.rule} ${h.file}:${h.line}:${h.column}`);

describe("motif check on an Expo app", () => {
  test("an Expo app without a guide is sent to motif extract, which reads it (2G Task 13)", async () => {
    const r = await check(makeProject({ "package.json": pkg(), "app/_layout.tsx": "export default function Layout() { return null; }\n" }));
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Draft one from your code with motif extract");
  });

  test("reports colours, sizes and fonts with the theme's fixes, and honours a reasoned motif-ok", async () => {
    const r = await check(await expoApp({ "app/index.tsx": HOME }));
    expect(r.exitCode).toBe(1);
    // A style={{ padding: 13 }} is one problem, not two.
    expect(where(r)).toEqual([
      "off-scale app/index.tsx:4:25",
      "raw-color app/index.tsx:4:56",
      "raw-font app/index.tsx:10:12",
      "off-scale app/index.tsx:10:38",
      "off-scale app/index.tsx:10:52",
    ]);
    expect(r.text).toContain("Use space.s<N>.");
    expect(r.text).toContain("Use colors.<role> from useMotifTheme().");
    expect(r.text).toContain("Use radius.<role>.");
    expect(r.text).toContain("Use type.<role>.");
    expect(r.text).not.toContain("var(--motif");
    expect((r.data.exceptions as any[]).map((e) => [e.rule, e.file, e.line, e.reason])).toEqual([["raw-color", "app/index.tsx", 9, "partner brand"]]);
  });

  test("a motif-ok without a reason allows nothing", async () => {
    const r = await check(await expoApp({ "app/index.tsx": "export const s = { c: { padding: 13 } };\nconst a = { x: 1 };\nconst t = StyleSheet.create({ a: { padding: 13 } }); // motif-ok\n" }));
    expect(where(r)).toEqual(["off-scale app/index.tsx:3:36"]);
    expect(r.text).toContain('A "motif-ok" comment needs a reason');
  });

  test("the generated theme file is never scanned; edited by hand, it is a warning", async () => {
    const root = await expoApp({ "app/index.tsx": "export default function A() { return null; }\n" });
    const clean = await check(root);
    expect(clean.exitCode).toBe(0);
    expect(clean.data.warnings).toEqual([]);

    const theme = join(root, "design/motif-theme.tsx");
    writeFileSync(theme, readFileSync(theme, "utf8").replace('"#', '"#1'));
    const edited = await check(root);
    expect(edited.data.violations).toEqual([]);
    expect((edited.data.warnings as any[]).map((w) => [w.rule, w.file])).toEqual([["generated-edited", "design/motif-theme.tsx"]]);
  });

  test("Motion typed in Reanimated calls, and reduce motion", async () => {
    const bare = await check(await expoApp({ "app/fade.ts": FADE }));
    expect(where(bare)).toEqual(["reduced-motion app/fade.ts:4:13", "raw-motion app/fade.ts:5:29"]);
    expect(bare.text).toContain("Use duration.<role>.");
    expect(bare.text).toContain('Animations here ignore the "reduce motion" setting.');

    const quiet = await check(await expoApp({ "app/fade.ts": FADE, "app/quiet.ts": REDUCED }));
    expect(where(quiet)).toEqual(["raw-motion app/fade.ts:5:29"]);
  });

  test("constants/Colors.ts (the starter's palette) is flagged with the palette hint", async () => {
    const colors = "export const Colors = {\n  light: { text: '#11181C', background: '#ffffff' },\n  dark: { text: '#ECEDEE', background: '#151718' },\n};\n";
    const r = await check(await expoApp({ "constants/Colors.ts": colors, "app/index.tsx": "export default function A() { return null; }\n" }));
    expect(r.exitCode).toBe(1);
    expect(r.data.violations as any[]).toHaveLength(4);
    expect(r.text).toContain("constants/Colors.ts");
    expect(r.text.toLowerCase()).toContain("palette");
  });

  test("Tailwind classes are read only when the app has nativewind", async () => {
    const screen = 'export default function A() { return <View className="bg-blue-500" />; }\n';
    const without = await check(await expoApp({ "app/index.tsx": screen }));
    expect(without.data.violations).toEqual([]);
    const withNativewind = await check(await expoApp({ "app/index.tsx": screen }, { nativewind: "^4.1.0" }));
    expect(where(withNativewind)).toEqual(["tailwind-palette app/index.tsx:1:55"]);
  });
});
