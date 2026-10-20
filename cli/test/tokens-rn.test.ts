import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runTokens } from "../src/commands/tokens";
import { TS_HEADER } from "../src/generate/header";
import { partnerTokens, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = JSON.stringify(validTokens());
const pkg = (deps: Record<string, string> = {}) =>
  JSON.stringify({
    name: "shop",
    main: "expo-router/entry",
    dependencies: {
      expo: "~58.0.16",
      "expo-router": "~58.0.24",
      react: "19.3.0",
      "react-native": "0.88.0",
      "react-native-reanimated": "4.7.1",
      "react-native-worklets": "0.13.0",
      "expo-font": "~58.0.9",
      "@expo-google-fonts/inter": "^0.4.0",
      ...deps,
    },
  });
/** What `create-expo-app` writes: a src/ folder, a constants/theme file and an @/ alias. */
const starter = (files: Record<string, string> = {}) =>
  makeProject({
    "package.json": pkg(),
    "app.json": JSON.stringify({ expo: { name: "shop" } }),
    "tsconfig.json": JSON.stringify({ extends: "expo/tsconfig.base", compilerOptions: { strict: true, paths: { "@/*": ["./src/*"] } } }),
    "src/app/_layout.tsx": "export default function Layout() { return null; }\n",
    "src/constants/theme.ts": "export const Colors = { light: { text: '#000' }, dark: { text: '#fff' } };\n",
    "design/tokens.json": TOKENS,
    ...files,
  });
const ctx = { positionals: [] };
const statuses = (r: any) => Object.fromEntries((r.data.files as any[]).map((f) => [f.path, f.status]));
const notes = (r: any) => (r.data.notes as string[]).join("\n");
const WIRING =
  "Next: wrap your root layout in <MotifProvider> (import from @/design/motif-theme), load motifFonts with useFonts from expo-font before rendering, and read colours with useMotifTheme().";

describe("motif tokens for an Expo app", () => {
  test("writes src/design/motif-theme.tsx, leaves the starter's own theme alone, and says how to wire it", async () => {
    const root = starter();
    const before = readFileSync(join(root, "src/constants/theme.ts"), "utf8");
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)).toEqual({ "src/design/motif-theme.tsx": "created", "design/motif.json": "created" });
    const ts = readFileSync(join(root, "src/design/motif-theme.tsx"), "utf8");
    expect(ts.startsWith(TS_HEADER + "\n")).toBe(true);
    expect(ts).toContain('fontFamily: "Inter_400Regular"');
    expect(readFileSync(join(root, "src/constants/theme.ts"), "utf8")).toBe(before);
    expect(notes(r)).toContain(WIRING);
    expect(notes(r)).not.toContain("expo install");
    expect(existsSync(join(root, "design/generated"))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).apps).toEqual([{ path: ".", stack: "react-native" }]);
  });

  test("an app without Expo Router is told to wrap its root component, App.tsx (hands-on)", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ name: "salon", main: "index.ts", dependencies: { expo: "~54.0.0", react: "19.1.0", "react-native": "0.81.5", "react-native-reanimated": "~4.1.1", "react-native-worklets": "0.5.1", "expo-font": "~14.0.11" } }),
      "app.json": JSON.stringify({ expo: { name: "salon" } }),
      "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, paths: { "@/*": ["./src/*"] } } }),
      "index.ts": `import { registerRootComponent } from "expo";
import App from "./App";
registerRootComponent(App);
`,
      "App.tsx": `export default function App() { return null; }
`,
      "src/screens/home.tsx": `export function Home() { return null; }
`,
      "design/tokens.json": TOKENS,
    });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(notes(r)).toContain("Next: wrap your root component (App.tsx) in <MotifProvider> (import from @/design/motif-theme), load motifFonts");
    expect(notes(r)).not.toContain("root layout");
  });

  test("the app's package.json, app.json and tsconfig.json are never touched", async () => {
    const root = starter();
    const files = ["package.json", "app.json", "tsconfig.json"];
    const before = files.map((f) => readFileSync(join(root, f), "utf8"));
    await runTokens(root, ctx);
    expect(files.map((f) => readFileSync(join(root, f), "utf8"))).toEqual(before);
  });

  test("running again changes nothing, and once the app uses MotifProvider the wiring note goes", async () => {
    const root = starter();
    await runTokens(root, ctx);
    // A reference in a comment doesn't count.
    writeFileSync(join(root, "src/app/_layout.tsx"), "// <MotifProvider>\nexport default function Layout() { return null; }\n");
    expect(notes(await runTokens(root, ctx))).toContain(WIRING);
    writeFileSync(
      join(root, "src/app/_layout.tsx"),
      'import { MotifProvider } from "@/design/motif-theme";\n\nexport default function Layout() { return <MotifProvider>{null}</MotifProvider>; }\n',
    );
    const r = await runTokens(root, ctx);
    expect(new Set(Object.values(statuses(r)))).toEqual(new Set(["unchanged"]));
    expect(r.text).toContain("up to date");
    expect(notes(r)).not.toContain("Next: wrap");
  });

  test("an edit to the generated file is protected", async () => {
    const root = starter();
    await runTokens(root, ctx);
    const path = join(root, "src/design/motif-theme.tsx");
    writeFileSync(path, "// mine\nexport const x = 1;\n");
    const r = await runTokens(root, ctx);
    expect(statuses(r)["src/design/motif-theme.tsx"]).toBe("protected");
    expect(readFileSync(path, "utf8")).toBe("// mine\nexport const x = 1;\n");
  });

  test("an app without a src folder gets design/motif-theme.tsx", async () => {
    const root = makeProject({ "package.json": pkg(), "app/_layout.tsx": "export default null;\n", "design/tokens.json": TOKENS });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["design/motif-theme.tsx"]).toBe("created");
    expect(notes(r)).toContain("(import from ./design/motif-theme)");
  });

  test("a guide with variants says how to choose one", async () => {
    const root = starter({ "design/tokens.json": JSON.stringify(partnerTokens()) });
    const r = await runTokens(root, ctx);
    expect(notes(r)).toContain('<MotifProvider variant="default">');
    expect(notes(r)).toContain('"default" or "partner"');
    expect(notes(r)).toContain("keep the chosen variant in your app's state");
  });

  test("packages the theme needs are printed as one expo install line", async () => {
    const root = starter({ "package.json": JSON.stringify({ name: "shop", dependencies: { expo: "~58.0.16" } }) });
    const r = await runTokens(root, ctx);
    expect(notes(r)).toContain("npx expo install expo-font @expo-google-fonts/inter react-native-reanimated react-native-worklets");
    const ts = readFileSync(join(root, "src/design/motif-theme.tsx"), "utf8");
    expect(ts).not.toContain('from "@expo-google-fonts/inter"');
    expect(ts).toContain("export const motifFonts: Record<string, number | string> = {};");
  });

  const brandFonts = () => {
    const t = validTokens();
    t.$extensions["dev.motif"].fonts = [
      {
        family: "Brand Sans",
        files: [
          { path: "design/fonts/BrandSans-Regular.ttf", weight: 400, style: "normal" },
          { path: "design/fonts/BrandSans-Bold.ttf", weight: 700, style: "normal" },
        ],
      },
    ];
    t.font.body.$value.fontFamily = ["Brand Sans", "sans-serif"];
    return JSON.stringify(t);
  };

  test("weights come from a package hoisted to a parent folder's node_modules", async () => {
    const root = makeProject({
      "design/tokens.json": TOKENS,
      "node_modules/@expo-google-fonts/inter/index.d.ts": "export * from './useFonts';\nexport declare const Inter_400Regular: number;\nexport declare const Inter_700Bold: number;\n",
      "apps/mobile/package.json": pkg(),
      "apps/mobile/src/app/_layout.tsx": "export default null;\n",
    });
    const r = await runTokens(root, ctx);
    const ts = readFileSync(join(root, "apps/mobile/src/design/motif-theme.tsx"), "utf8");
    expect(ts).toContain('heading: { fontFamily: "Inter_700Bold",');
    expect(ts).not.toContain("Inter_600SemiBold");
    expect(notes(r)).not.toContain("isn't installed");
  });

  test("a package in package.json that isn't installed gives only its 400 face, and a note", async () => {
    const root = starter();
    const r = await runTokens(root, ctx);
    const ts = readFileSync(join(root, "src/design/motif-theme.tsx"), "utf8");
    expect(ts).toContain('import { Inter_400Regular } from "@expo-google-fonts/inter";');
    expect(ts).not.toContain("Inter_700Bold");
    expect(notes(r)).toContain("@expo-google-fonts/inter is in package.json but isn't installed");
    expect(notes(r)).toContain("run motif tokens again to use its other weights");
  });

  const INTER_DTS =
    "export * from './useFonts';\nexport declare const Inter_400Regular: number;\nexport declare const Inter_500Medium: number;\nexport declare const Inter_600SemiBold: number;\nexport declare const Inter_700Bold: number;\n";

  test("before the packages are installed, the faces Motif's theme file already imports are kept: tokens is up to date and check sees no edit", async () => {
    const root = starter({ "node_modules/@expo-google-fonts/inter/index.d.ts": INTER_DTS });
    await runTokens(root, ctx);
    const path = join(root, "src/design/motif-theme.tsx");
    const installed = readFileSync(path, "utf8");
    expect(installed).toContain('heading: { fontFamily: "Inter_600SemiBold",');
    // A fresh clone: the theme is committed, node_modules isn't.
    rmSync(join(root, "node_modules"), { recursive: true });
    const r = await runTokens(root, ctx);
    expect(new Set(Object.values(statuses(r)))).toEqual(new Set(["unchanged"]));
    expect(readFileSync(path, "utf8")).toBe(installed);
    expect(notes(r)).not.toContain("isn't installed");
    expect((await runCheck(root, ctx)).data.warnings).toEqual([]);
    // A hand edit is still one.
    writeFileSync(path, installed.replace("  md: 8,", "  md: 6,"));
    expect((await runCheck(root, ctx)).data.warnings).toEqual([expect.objectContaining({ rule: "generated-edited", file: "src/design/motif-theme.tsx", line: 1 })]);
  });

  test("a theme file without Motif's header, or one that imports nothing from the package, isn't trusted for its faces", async () => {
    const root = starter({ "src/design/motif-theme.tsx": 'import { Inter_700Bold } from "@expo-google-fonts/inter";\nexport const mine = 1;\n' });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["src/design/motif-theme.tsx"]).toBe("protected");
    expect(notes(r)).toContain("@expo-google-fonts/inter is in package.json but isn't installed");
    const other = starter({ "src/design/motif-theme.tsx": `${TS_HEADER}\nimport { Onest_700Bold } from "@expo-google-fonts/onest";\n` });
    const again = await runTokens(other, ctx);
    expect(notes(again)).toContain("@expo-google-fonts/inter is in package.json but isn't installed");
    expect(readFileSync(join(other, "src/design/motif-theme.tsx"), "utf8")).toContain('import { Inter_400Regular } from "@expo-google-fonts/inter";');
  });

  test("a package file Motif can't read gives only the 400 face, and a note naming the package", async () => {
    const root = starter({ "node_modules/@expo-google-fonts/inter/index.d.ts": "export {};\n" });
    const r = await runTokens(root, ctx);
    const ts = readFileSync(join(root, "src/design/motif-theme.tsx"), "utf8");
    expect(ts).toContain('import { Inter_400Regular } from "@expo-google-fonts/inter";');
    expect(ts).not.toContain("Inter_700Bold");
    expect(notes(r)).toContain("Motif couldn't read which weights @expo-google-fonts/inter has, so its roles use the regular face.");
  });

  test("worklets are suggested only when reanimated is missing too", async () => {
    const root = starter({ "package.json": pkg({ "react-native-worklets": "0.13.0" }).replace('"react-native-reanimated":"4.7.1",', "") });
    const text = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    delete text.dependencies["react-native-reanimated"];
    delete text.dependencies["react-native-worklets"];
    writeFileSync(join(root, "package.json"), JSON.stringify(text));
    expect(notes(await runTokens(root, ctx))).toContain("react-native-reanimated react-native-worklets");
    text.dependencies["react-native-reanimated"] = "4.7.1";
    delete text.dependencies["expo-font"];
    writeFileSync(join(root, "package.json"), JSON.stringify(text));
    const r = await runTokens(root, ctx);
    expect(notes(r)).toContain("npx expo install expo-font");
    expect(notes(r)).not.toContain("react-native-worklets");
  });

  test("a project font's .ttf files are copied into the app", async () => {
    const root = makeProject({
      "design/tokens.json": brandFonts(),
      "design/fonts/BrandSans-Regular.ttf": "regular",
      "design/fonts/BrandSans-Bold.ttf": "bold",
      "app/package.json": pkg(),
      "app/src/app/_layout.tsx": "export default null;\n",
    });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["app/assets/fonts/BrandSans-Regular.ttf"]).toBe("created");
    expect(readFileSync(join(root, "app/assets/fonts/BrandSans-Bold.ttf"), "utf8")).toBe("bold");
    const ts = readFileSync(join(root, "app/src/design/motif-theme.tsx"), "utf8");
    expect(ts).toContain('"Brand Sans_400": require("../../assets/fonts/BrandSans-Regular.ttf"),');
    // Copies already in place are unchanged; one that differs is never overwritten.
    expect(statuses(await runTokens(root, ctx))["app/assets/fonts/BrandSans-Bold.ttf"]).toBe("unchanged");
    writeFileSync(join(root, "app/assets/fonts/BrandSans-Bold.ttf"), "mine");
    expect(statuses(await runTokens(root, ctx))["app/assets/fonts/BrandSans-Bold.ttf"]).toBe("protected");
  });

  test("font files already inside the app stay where they are", async () => {
    const root = starter({
      "design/tokens.json": brandFonts(),
      "design/fonts/BrandSans-Regular.ttf": "regular",
      "design/fonts/BrandSans-Bold.ttf": "bold",
    });
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r)).some((p) => p.startsWith("assets/"))).toBe(false);
    const ts = readFileSync(join(root, "src/design/motif-theme.tsx"), "utf8");
    expect(ts).toContain('"Brand Sans_400": require("../../design/fonts/BrandSans-Regular.ttf"),');
  });

  test("a project font with only WOFF2 files gets a note", async () => {
    const t = validTokens();
    t.$extensions["dev.motif"].fonts = [{ family: "Brand Sans", files: [{ path: "design/fonts/BrandSans.woff2", weight: 400, style: "normal" }] }];
    t.font.body.$value.fontFamily = ["Brand Sans", "sans-serif"];
    const root = starter({ "design/tokens.json": JSON.stringify(t), "design/fonts/BrandSans.woff2": "woff2" });
    const r = await runTokens(root, ctx);
    expect(notes(r)).toContain("React Native can't use WOFF2: add a .ttf or .otf of Brand Sans to the guide's font files.");
  });
});
