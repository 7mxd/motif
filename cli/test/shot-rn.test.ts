import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runShot, type ShotDeps } from "../src/commands/shot";
import type { AuditIssue } from "../src/shot/audit";
import type { CaptureOptions, RouteResult } from "../src/shot/capture";
import { NATIVE_VIEWPORTS } from "../src/shot/capture";
import { RN_START_TIMEOUT_MS } from "../src/stacks/react-native";
import { fixedScheme } from "../src/stacks/react-native/project";
import { buildWebBundle, webErrorHints } from "../src/stacks/react-native/web";
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

  test("a page error from native-only code adds how to stub it, once (Task 7 replaced error texts the spike never saw)", async () => {
    const codegen = "TypeError: (0 , _reactNativeWebDistIndex.codegenNativeComponent) is not a function";
    const { deps } = fakes({
      results: (o) => [
        { route: "/", url: `${o.baseUrl}/`, status: 200, shots: [], pageErrors: [codegen] },
        { route: "/settings", url: `${o.baseUrl}/settings`, status: 200, shots: [], pageErrors: [codegen, "TypeError: ExpoCamera.default.takePicture is not a function"] },
      ],
    });
    const r = await runShot(makeProject(EXPO_APP), ctx(), deps);
    expect(r.text.split("A native-only component (made with React Native's codegenNativeComponent").length).toBe(2);
    expect(r.text).toContain("The native module ExpoCamera has no web version of takePicture: move the code that uses it into a file of its own");
  });
  test("--audit checks reduced motion at the 390 px phone, and says so when --sizes leaves it out", async () => {
    const root = makeProject(EXPO_APP);
    const on = fakes();
    const r = await runShot(root, ctx({ audit: true }), on.deps);
    expect(on.calls.captured[0]!.motionWidth).toBe(390);
    expect(r.text).toContain("reduced-motion");
    const off = fakes();
    const r2 = await runShot(makeProject(EXPO_APP), ctx({ audit: true, sizes: "360" }), off.deps);
    expect(r2.text).toContain("The reduced-motion check runs at the 390 px phone size, which --sizes left out.");
    expect(r2.text).not.toContain("desktop");
    expect(r2.text).not.toMatch(/✓ Audit:[^\n]*reduced-motion/);
  });

  test("--out leaves no marker, so the note repeats", async () => {
    const root = makeProject(EXPO_APP);
    expect((await runShot(root, ctx({ out: "shots-x" }), fakes().deps)).text).toContain(NOTE);
    expect(existsSync(join(root, "shots-x", ".motif-web-target-noted"))).toBe(false);
    expect((await runShot(root, ctx({ out: "shots-x" }), fakes().deps)).text).toContain(NOTE);
  });
});

// Plan 2G, Task 7: what the spike on expo-min showed (decision 0009).
describe("the app's own light or dark (Expo's userInterfaceStyle)", () => {
  const withConfig = (expo: Record<string, unknown> | null, extra: Record<string, string> = {}) =>
    makeProject({ ...EXPO_APP, ...(expo ? { "app.json": JSON.stringify({ expo }) } : {}), ...extra });

  test("app.json's value for both phones; Expo's default (light) when it sets none; unknown with a dynamic config or no app.json", () => {
    expect(fixedScheme(withConfig({ userInterfaceStyle: "light" }))).toEqual({ scheme: "light", set: true });
    expect(fixedScheme(withConfig({ userInterfaceStyle: "dark" }))).toEqual({ scheme: "dark", set: true });
    expect(fixedScheme(withConfig({ name: "x" }))).toEqual({ scheme: "light", set: false });
    expect(fixedScheme(withConfig({ userInterfaceStyle: "automatic" }))).toBeNull();
    // A phone that follows the system on one platform: the browser's setting is followed.
    expect(fixedScheme(withConfig({ userInterfaceStyle: "light", ios: { userInterfaceStyle: "automatic" } }))).toBeNull();
    expect(fixedScheme(withConfig({ ios: { userInterfaceStyle: "dark" }, android: { userInterfaceStyle: "dark" } }))).toEqual({ scheme: "dark", set: true });
    expect(fixedScheme(withConfig({ userInterfaceStyle: "light" }, { "app.config.ts": "export default ({ config }) => config;" }))).toBeNull();
    expect(fixedScheme(withConfig(null))).toBeNull();
    expect(fixedScheme(makeProject({ ...EXPO_APP, "app.json": "{ not json" }))).toBeNull();
  });

  test("a light-only app is drawn light in its .dark screenshots too, as on a phone, and the run says why", async () => {
    const set = fakes();
    const r = await runShot(withConfig({ userInterfaceStyle: "light" }), ctx(), set.deps);
    expect(set.calls.captured[0]!.appScheme).toBe("light");
    expect(r.text).toContain(`app.json sets userInterfaceStyle to "light", so on a phone the app stays light in dark mode: its .dark screenshots are drawn light too. Set it to "automatic" to follow the phone's setting.`);
    const unset = fakes();
    const r2 = await runShot(withConfig({ name: "x" }), ctx(), unset.deps);
    expect(unset.calls.captured[0]!.appScheme).toBe("light");
    expect(r2.text).toContain(`app.json doesn't set userInterfaceStyle, and Expo's default is "light", so on a phone the app stays light in dark mode: its .dark screenshots are drawn light too. Set it to "automatic" to follow the phone's setting.`);
    const dark = fakes();
    const r3 = await runShot(withConfig({ userInterfaceStyle: "dark" }), ctx(), dark.deps);
    expect(dark.calls.captured[0]!.appScheme).toBe("dark");
    expect(r3.text).toContain(`app.json sets userInterfaceStyle to "dark", so on a phone the app stays dark in light mode: its light screenshots are drawn dark too. Set it to "automatic" to follow the phone's setting.`);
    const auto = fakes();
    const r4 = await runShot(withConfig({ userInterfaceStyle: "automatic" }), ctx(), auto.deps);
    expect(auto.calls.captured[0]!.appScheme).toBeUndefined();
    expect(r4.text).not.toContain("userInterfaceStyle");
  });

  test("an app that follows the phone but draws dark exactly like light is told how to read the setting", async () => {
    const pairs = (o: CaptureOptions): RouteResult[] =>
      o.routes.map((route) => {
        const slug = route === "/" ? "index" : route.slice(1);
        return { route, url: `${o.baseUrl}${route}`, status: 200, shots: [join(o.outDir, `${slug}.mobile.png`), join(o.outDir, `${slug}.mobile.dark.png`)] };
      });
    const r = await runShot(withConfig({ userInterfaceStyle: "automatic" }), ctx(), fakes({ results: pairs }).deps);
    expect(r.text).toContain("Dark mode looks exactly like light on every screen: the app doesn't follow the phone's setting on the web. MotifProvider reads it with useColorScheme(); use its colours.");
    // One that differs somewhere: no note.
    const { deps } = fakes({ results: pairs });
    const differs: ShotDeps = {
      ...deps,
      capture: async (o) => {
        const out = await deps.capture(o);
        writeFileSync(out.routes[0]!.shots[1]!, "dark png");
        return out;
      },
    };
    expect((await runShot(withConfig({ userInterfaceStyle: "automatic" }), ctx(), differs)).text).not.toContain("Dark mode looks exactly like light");
    // A screen that threw shows Expo's error overlay in both: that says nothing about dark mode.
    const crashed = (o: CaptureOptions) => pairs(o).map((r) => ({ ...r, pageErrors: ["TypeError: x is not a function"] }));
    expect((await runShot(withConfig({ userInterfaceStyle: "automatic" }), ctx(), fakes({ results: crashed }).deps)).text).not.toContain("Dark mode looks exactly like light");
    // A light-only app has its own note instead.
    const r2 = await runShot(withConfig({ userInterfaceStyle: "light" }), ctx(), fakes({ results: pairs }).deps);
    expect(r2.text).not.toContain("Dark mode looks exactly like light");
  });
});

describe("an app Expo can't build or run on the web", () => {
  test("Metro's bundle error stops the run with what it said, before any screenshot", async () => {
    const root = makeProject(EXPO_APP);
    const f = fakes({
      webBundle: async (appDir) => {
        expect(appDir).toBe(root);
        return { error: "app/map.tsx imports react-native-maps, which Metro can't find for the web." };
      },
    });
    const r = await runShot(root, ctx(), f.deps);
    expect(r.exitCode).toBe(1);
    expect(r.data.error).toBe("web-bundle-failed");
    expect(r.text).toContain("Expo couldn't build the app for the web, so there's nothing to screenshot: app/map.tsx imports react-native-maps, which Metro can't find for the web.");
    expect(f.calls.captured).toEqual([]);
    expect(f.calls.stopped).toBe(1);
  });

  test("the bundle is built before the first screenshot, within the start limit", async () => {
    let deadline = 0;
    const f = fakes({
      webBundle: async (_dir, url, until) => {
        expect(url).toBe("http://localhost:8081");
        deadline = until;
        return {};
      },
    });
    const before = Date.now();
    const r = await runShot(makeProject(EXPO_APP), ctx(), f.deps);
    expect(r.exitCode).toBe(0);
    expect(deadline).toBeGreaterThanOrEqual(before + RN_START_TIMEOUT_MS - 1000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + RN_START_TIMEOUT_MS);
    expect(f.calls.captured).toHaveLength(1);
  });

  test("buildWebBundle: a bundle Metro builds is fine; one it can't is its message, with the app's own paths", async () => {
    const appDir = makeProject({ ...EXPO_APP, "node_modules/react-native-maps/package.json": "{}" });
    const sep = process.platform === "win32" ? "\\" : "/";
    let reply: () => Response | Promise<Response> = () => new Response("__d(function(){});", { headers: { "content-type": "application/javascript" } });
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === "/") {
          return new Response('<!doctype html><html><body><div id="root"></div><script src="/node_modules/expo-router/entry.bundle?platform=web&amp;dev=true" defer></script></body></html>', { headers: { "content-type": "text/html" } });
        }
        return reply();
      },
    });
    try {
      const url = `http://127.0.0.1:${server.port}`;
      expect(await buildWebBundle(appDir, url, Date.now() + 10_000)).toEqual({});
      const unresolved = (target: string) => () =>
        Response.json(
          {
            type: "UnableToResolveError",
            targetModuleName: target,
            originModulePath: `${appDir}${sep}app${sep}map.tsx`,
            message: `Unable to resolve module ${target} from ${appDir}${sep}app${sep}map.tsx: ${target} could not be found within the project or in these directories:\n  node_modules\n\u001b[0m> 1 | import x from "${target}";`,
          },
          { status: 500 },
        );
      reply = unresolved("some-missing-package");
      expect(await buildWebBundle(appDir, url, Date.now() + 10_000)).toEqual({
        error: "app/map.tsx imports some-missing-package, which isn't installed. Install it (npx expo install some-missing-package) or remove the import.",
      });
      // Expo SDK 52's Metro sends the same error without its type, from inside a package.
      reply = () =>
        Response.json(
          {
            originModulePath: `${appDir}${sep}node_modules${sep}expo-router${sep}build${sep}fork${sep}getPathFromState.js`,
            targetModuleName: "query-string",
            message: `Unable to resolve module query-string from ${appDir}${sep}node_modules${sep}expo-router${sep}build${sep}fork${sep}getPathFromState.js: query-string could not be found within the project or in these directories:\n  node_modules`,
          },
          { status: 500 },
        );
      expect(await buildWebBundle(appDir, url, Date.now() + 10_000)).toEqual({
        error: "node_modules/expo-router/build/fork/getPathFromState.js imports query-string, which isn't installed. Install it (npx expo install query-string), or run npx expo install --fix to match your packages to your Expo SDK.",
      });
      reply = unresolved("react-native-maps/lib/native-only");
      expect(await buildWebBundle(appDir, url, Date.now() + 10_000)).toEqual({
        error:
          "app/map.tsx imports react-native-maps/lib/native-only, which Metro can't find for the web. react-native-maps has no web version: move the code that uses it into a file of its own and add a .web.tsx twin of that file that leaves it out (Expo's web target, and so Motif's screenshots, use the .web.tsx file).",
      });
      reply = () => Response.json({ type: "TransformError", message: `SyntaxError: ${appDir}${sep}app${sep}index.tsx: Unexpected token (3:4)\n\u001b[0m  1 | x` }, { status: 500 });
      expect(await buildWebBundle(appDir, url, Date.now() + 10_000)).toEqual({ error: "SyntaxError: app/index.tsx: Unexpected token (3:4)" });
      // A bundle that isn't ready by the deadline stops the run, as a server that doesn't start does.
      reply = () => new Promise<Response>(() => {});
      expect(await buildWebBundle(appDir, url, Date.now() + 500)).toEqual({
        error: "Expo's web bundle wasn't ready within the start limit (300 s). Run npx expo start --web to see where Metro stops, or start the app yourself and pass its address with --url.",
      });
    } finally {
      server.stop(true);
    }
  }, 30_000);

  test("--audit leaves out a screen that threw as it loaded, since its screenshots may show Expo's error overlay", async () => {
    const issue = (route: string): AuditIssue => ({
      rule: "color-contrast", selector: "p", label: "Uncaught Error", kind: "element", ratio: 2.3, expected: 4.5, fg: "#aaaaaa", bg: "#ffffff",
      route, viewport: "mobile", size: "mobile", scheme: "light", shot: "x.png",
    });
    const { deps } = fakes();
    const crashed: ShotDeps = {
      ...deps,
      capture: async (o) => {
        const out = await deps.capture(o);
        out.routes[0]!.pageErrors = ["TypeError: ExpoSecureStore.default.getValueWithKeySync is not a function"];
        // A state's own error (tagged) doesn't mean the screen threw as it loaded.
        out.routes[1]!.pageErrors = ['State "open": boom'];
        return { routes: out.routes, issues: [issue("/"), issue("/settings")] };
      },
    };
    const r = await runShot(makeProject(EXPO_APP), ctx({ audit: true }), crashed);
    expect(r.text).toContain("✗ Audit incomplete: / threw an error as it loaded, so it isn't audited (its screenshots may show Expo's error overlay).");
    expect(r.text).toContain("critical /settings (mobile, light)");
    expect(r.text).not.toContain("critical / (mobile");
    // Nothing found elsewhere isn't a clean audit.
    const quiet: ShotDeps = {
      ...deps,
      capture: async (o) => {
        const out = await deps.capture(o);
        out.routes[0]!.pageErrors = ["TypeError: x is not a function"];
        return { routes: out.routes, issues: [issue("/")] };
      },
    };
    const r2 = await runShot(makeProject(EXPO_APP), ctx({ audit: true }), quiet);
    expect(r2.text).toContain("✗ Audit incomplete: / threw an error as it loaded");
    expect(r2.text).not.toContain("✓ Audit");
  });

  test("the errors Expo's web target throws for native-only code name what to stub (as the spike saw them)", () => {
    const appDir = makeProject({ ...EXPO_APP, "package.json": PKG({ ...WEB, "expo-secure-store": "~58.0.2" }) });
    // react-native-maps on SDK 58: its native component specs call codegenNativeComponent, which react-native-web lacks.
    expect(webErrorHints(["TypeError: (0 , _reactNativeWebDistIndex.codegenNativeComponent) is not a function"], appDir)).toEqual([
      "A native-only component (made with React Native's codegenNativeComponent, which react-native-web doesn't have) is imported, so the app can't start on the web, on any screen: Expo puts every route in one web bundle. Expo's error overlay in the screenshots names its file. Move the code that uses it into a file of its own and add a .web.tsx twin of that file that leaves it out.",
    ]);
    // expo-secure-store's native module has no getValueWithKeySync on the web.
    expect(webErrorHints(["TypeError: ExpoSecureStore.default.getValueWithKeySync is not a function"], appDir)).toEqual([
      "expo-secure-store has no web version of getValueWithKeySync: move the code that uses it into a file of its own and add a .web.tsx twin of that file that leaves it out (Expo's web target, and so Motif's screenshots, use the .web.tsx file).",
    ]);
    // Expo's own message for a native module it can't find, for one the app doesn't list: named by its module.
    expect(webErrorHints(["Error: Cannot find native module 'ExpoSQLite'"], appDir)).toEqual([
      "The native module ExpoSQLite has no web version: move the code that uses it into a file of its own and add a .web.tsx twin of that file that leaves it out (Expo's web target, and so Motif's screenshots, use the .web.tsx file).",
    ]);
    expect(webErrorHints(["TypeError: Cannot read properties of undefined (reading 'map')"], appDir)).toEqual([]);
  });
});
