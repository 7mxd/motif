import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { detectApps } from "../src/detect/stacks";
import { expoSdk, hasWebSupport, isExpoApp, srcRoot, usesExpoRouter } from "../src/stacks/react-native/project";
import { nativeStack } from "../src/stacks/native";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "app", dependencies: deps });
const starter = () => makeProject({
  "package.json": pkg({ expo: "~54.0.1", "expo-router": "~6.0.0", react: "19.1.0", "react-native": "0.81.4" }),
  "node_modules/expo/package.json": JSON.stringify({ version: "54.0.12" }),
  "app/_layout.tsx": "export default function L() { return null; }\n",
  "app/index.tsx": "export default function I() { return null; }\n",
});

describe("Expo apps", () => {
  test("the starter shape is read", () => {
    const dir = starter();
    expect(isExpoApp(dir)).toBe(true);
    expect(usesExpoRouter(dir)).toBe(true);
    expect(expoSdk(dir)).toBe(54);
    expect(srcRoot(dir)).toBe(".");
    expect(hasWebSupport(dir)).toEqual(["react-dom", "react-native-web", "@expo/metro-runtime"]);
  });

  test("the SDK falls back to the range in package.json; src/ is the source root", () => {
    const dir = makeProject({ "package.json": pkg({ expo: "^52.0.0", "react-dom": "19", "react-native-web": "0.21" }), "src/app/index.tsx": "x" });
    expect(expoSdk(dir)).toBe(52);
    expect(srcRoot(dir)).toBe("src");
    expect(usesExpoRouter(dir)).toBe(false);
    expect(hasWebSupport(dir)).toEqual(["@expo/metro-runtime"]);
  });

  test("a bare React Native app is not an Expo app; the SDK is unknown", () => {
    const dir = makeProject({ "package.json": pkg({ "react-native": "0.74" }) });
    expect(isExpoApp(dir)).toBe(false);
    expect(expoSdk(dir)).toBeNull();
  });

  test("detection finds mobile/expo-app beside a Flutter app, and a bare React Native app", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ workspaces: ["web"] }),
      "web/package.json": pkg({ react: "18", vite: "5" }),
      "mobile/expo-app/package.json": pkg({ expo: "~54.0.1" }),
      "mobile/flutter/pubspec.yaml": "name: f\ndependencies:\n  flutter:\n    sdk: flutter\n",
      "mobile/flutter/lib/main.dart": "void main() {}\n",
    });
    const { apps } = detectApps(root);
    expect(apps.map((a) => [a.path, a.stack])).toEqual([["mobile/expo-app", "react-native"], ["mobile/flutter", "flutter"], ["web", "react-web"]]);
    const bare = makeProject({ "package.json": pkg({ "react-native": "0.74" }) });
    expect(detectApps(bare).apps[0]!.stack).toBe("react-native");
  });
});

describe("the React Native stack", () => {
  test("is registered with theme folder and extensions, but nothing it can't do yet", () => {
    const rn = nativeStack("react-native")!;
    expect(rn.extensions).toEqual([".ts", ".tsx", ".js", ".jsx"]);
    expect(rn.themeDir(join("x"), { path: ".", stack: "react-native" } as never)).toBe("design");
    expect(rn.themeDir("x", { path: "mobile/a", stack: "react-native", themeDir: "mine" } as never)).toBe("mine");
    expect(rn.scan).toBeUndefined();
    expect(rn.generate).toBeUndefined();
    expect(rn.collect).toBeUndefined();
    expect(rn.shoot).toBeUndefined();
  });
});
