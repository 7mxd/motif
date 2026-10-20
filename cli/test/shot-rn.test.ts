import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runShot, type ShotDeps } from "../src/commands/shot";
import type { CaptureOptions, RouteResult } from "../src/shot/capture";
import { NATIVE_VIEWPORTS } from "../src/shot/capture";
import { RN_START_TIMEOUT_MS } from "../src/stacks/react-native";
import type { DevCommand } from "../src/shot/devserver";
import { twoVariantTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const CHROME = { name: "Chrome" as const, path: "/fake/chrome" };
const PKG = (extra: Record<string, string> = {}) =>
  JSON.stringify({ dependencies: { expo: "~52.0.0", "expo-router": "~4.0.0", react: "18.3.1", "react-native": "0.76.0", ...extra } });
const WEB = { "react-dom": "18.3.1", "react-native-web": "~0.19.0", "@expo/metro-runtime": "~4.0.0" };
const EXPO_APP = { "package.json": PKG(WEB), "package-lock.json": "{}", "node_modules/.keep": "", "app/_layout.tsx": "", "app/index.tsx": "", "app/settings.tsx": "" };
const NOTE = "React Native screenshots are of Expo's web target in Chrome: close to the app, but native-only components and platform fonts can differ.";

function fakes(over: Partial<ShotDeps> & { results?: (o: CaptureOptions) => RouteResult[] } = {}) {
  const calls = { started: [] as { cwd: string; command: string[]; env?: Record<string, string>; timeoutMs?: number }[], stopped: 0, captured: [] as CaptureOptions[], devCalls: 0 };
  const { results, ...rest } = over;
  const deps: ShotDeps = {
    findBrowser: () => CHROME,
    devCommand: () => {
      calls.devCalls++;
      return { command: ["npx", "expo"], display: "npx expo start --web --port 8081", packageManager: "npm", env: { CI: "1" } } satisfies DevCommand;
    },
    startDevServer: async (o) => {
      calls.started.push({ cwd: o.cwd, command: o.command, env: o.env, timeoutMs: o.timeoutMs });
      return { url: "http://localhost:8081", pid: 1, stop: async () => void calls.stopped++ };
    },
    serveStatic: () => ({ url: "http://127.0.0.1:1", stop: () => {} }),
    capture: async (o) => {
      calls.captured.push(o);
      const routes =
        results?.(o) ?? o.routes.map((route) => ({ route, url: `${o.baseUrl}${route}`, status: 200, shots: [join(o.outDir, `${route === "/" ? "index" : route.slice(1)}.mobile.png`)] }));
      for (const shot of routes.flatMap((r) => r.shots)) {
        mkdirSync(dirname(shot), { recursive: true });
        writeFileSync(shot, "png");
      }
      return { routes, issues: [] };
    },
    compare: async (o) => o.pairs.map((p) => ({ ...p })),
    today: () => "2026-10-20",
    ...rest,
  };
  return { deps, calls };
}
const ctx = (flags: Record<string, string | boolean> = {}) => ({ positionals: [], flags });

describe("motif shot: an Expo app", () => {
  test("starts the app's web target, draws its routes in the native sizes and says what the screenshots are", async () => {
    const { deps, calls } = fakes();
    const root = makeProject(EXPO_APP);
    const r = await runShot(root, ctx(), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.started).toHaveLength(1);
    expect(calls.started[0]!.env).toEqual({ CI: "1" });
    expect(calls.started[0]!.timeoutMs).toBe(RN_START_TIMEOUT_MS);
    expect(RN_START_TIMEOUT_MS).toBeGreaterThanOrEqual(300_000);
    expect(calls.captured[0]!.routes).toEqual(["/", "/settings"]);
    expect(calls.captured[0]!.viewports).toEqual(NATIVE_VIEWPORTS);
    expect(r.text).toContain("three phone sizes and a tablet");
    expect(r.text).toContain(NOTE);
    expect(calls.stopped).toBe(1);
  });

  test("says it the first time only", async () => {
    const root = makeProject(EXPO_APP);
    expect((await runShot(root, ctx(), fakes().deps)).text).toContain(NOTE);
    expect(existsSync(join(root, "design", "shots"))).toBe(true);
    expect((await runShot(root, ctx(), fakes().deps)).text).not.toContain(NOTE);
  });

  test("a desktop size only when --sizes asks for it", async () => {
    const { deps, calls } = fakes();
    const r = await runShot(makeProject(EXPO_APP), ctx({ sizes: "390,desktop" }), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.captured[0]!.viewports!.map((v) => v.width)).toEqual([390, 1440]);
  });

  test("a missing web package is refused with doctor's install line, before anything starts", async () => {
    const { deps, calls } = fakes();
    const r = await runShot(makeProject({ ...EXPO_APP, "package.json": PKG(), "node_modules/.keep": "" }), ctx(), deps);
    expect(r.exitCode).toBe(2);
    expect(r.data.error).toBe("needs-web-target");
    expect(r.text).toContain("npx expo install react-dom react-native-web @expo/metro-runtime");
    expect(calls.devCalls).toBe(0);
    expect(calls.started).toHaveLength(0);
  });

  test("an address passed with --url needs no web packages checked here, and nothing is started", async () => {
    const { deps, calls } = fakes();
    const r = await runShot(makeProject({ ...EXPO_APP, "package.json": PKG() }), ctx({ url: "http://localhost:8081" }), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.started).toHaveLength(0);
  });

  test("--screen is a usage error that points at --routes", async () => {
    const r = await runShot(makeProject(EXPO_APP), ctx({ screen: "Home" }), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.data.error).toBe("usage");
    expect(r.text).toBe("React Native screens are routes; pass --routes.");
  });

  test("--routes chooses the pages", async () => {
    const { deps, calls } = fakes();
    await runShot(makeProject(EXPO_APP), ctx({ routes: "/settings" }), deps);
    expect(calls.captured[0]!.routes).toEqual(["/settings"]);
  });

  test("a variant that looks like the default is explained in React Native's words", async () => {
    const root = makeProject({ ...EXPO_APP, "design/tokens.json": JSON.stringify(twoVariantTokens()) });
    const { deps } = fakes({
      results: (o) =>
        o.routes.map((route) => ({
          route, url: `${o.baseUrl}${route}`, status: 200,
          shots: [join(o.outDir, "index.mobile.png"), join(o.outDir, "index+men.mobile.png")],
        })),
    });
    const r = await runShot(root, ctx({ variant: "men" }), deps);
    expect(r.text).toContain("(MotifProvider, which follows data-variant on the web)");
  });

  test("a page error naming a module without web support adds how to stub it", async () => {
    const { deps } = fakes({
      results: (o) => [
        { route: "/", url: `${o.baseUrl}/`, status: 200, shots: [], pageErrors: ["Cannot read properties of undefined (reading 'getItem') in react-native-mmkv"] },
        { route: "/settings", url: `${o.baseUrl}/settings`, status: 200, shots: [], pageErrors: ["Unable to resolve module expo-camera/native"] },
      ],
    });
    const r = await runShot(makeProject(EXPO_APP), ctx(), deps);
    expect(r.text).toContain("react-native-mmkv doesn't run on the web; stub it for screenshots with a react-native-mmkv.web.tsx file beside the import, or skip the route.");
    expect(r.text).toContain("expo-camera doesn't run on the web; stub it for screenshots with a expo-camera.web.tsx file beside the import, or skip the route.");
  });
});
