import { afterAll, describe, expect, test } from "bun:test";
import { REACT_NATIVE } from "../src/stacks/react-native";
import { discoverExpoRoutes } from "../src/stacks/react-native/routes";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const page = "export default function P() { return null; }\n";
const PKG = JSON.stringify({ name: "a", dependencies: { expo: "~54.0.0", "expo-router": "~6.0.0" } });
const PLAIN_PKG = JSON.stringify({ name: "a", dependencies: { expo: "~54.0.0", "@react-navigation/native": "^7.0.0" } });
const files = (names: string[], prefix = "src/app/") => Object.fromEntries(names.map((n) => [prefix + n, page]));

describe("Expo Router", () => {
  test("the create-expo-app starter: / and /explore", () => {
    const root = makeProject({ "package.json": PKG, ...files(["_layout.tsx", "(tabs)/_layout.tsx", "(tabs)/index.tsx", "(tabs)/explore.tsx", "+not-found.tsx", "+html.tsx"]) });
    expect(discoverExpoRoutes(root)).toEqual({ routes: ["/", "/explore"], skipped: [] });
  });

  test("app/ at the top of the project works too, and is wired into the stack", () => {
    const root = makeProject({ "package.json": PKG, ...files(["index.tsx", "settings.tsx"], "app/") });
    expect(discoverExpoRoutes(root).routes).toEqual(["/", "/settings"]);
    expect(REACT_NATIVE.routes!(root).routes).toEqual(["/", "/settings"]);
  });

  test("nested groups flatten, folders add a segment, platform files are one route, special files are not pages", () => {
    const root = makeProject({
      "package.json": PKG,
      ...files([
        "(auth)/(modal)/login.tsx",
        "(auth)/register.tsx",
        "profile/index.tsx",
        "profile/edit.ts",
        "about.tsx",
        "about.web.tsx",
        "about.ios.tsx",
        "about.android.tsx",
        "about.native.tsx",
        "hello+api.ts",
        "+native-intent.ts",
        "+middleware.ts",
        "about.test.tsx",
      ]),
    });
    expect(discoverExpoRoutes(root)).toEqual({ routes: ["/", "/about", "/login", "/profile", "/profile/edit", "/register"], skipped: [] });
  });

  test("dynamic and catch-all routes are skipped, not captured", () => {
    const root = makeProject({ "package.json": PKG, ...files(["index.tsx", "user/[id].tsx", "post/[id]/comments.tsx", "docs/[...rest].tsx", "(tabs)/[tab].tsx", "[category]/index.tsx"]) });
    expect(discoverExpoRoutes(root)).toEqual({
      routes: ["/"],
      skipped: ["/[category]", "/[tab]", "/docs/[...rest]", "/post/[id]/comments", "/user/[id]"],
    });
  });

  test("an app with no routes still has /", () => {
    expect(discoverExpoRoutes(makeProject({ "package.json": PKG }))).toEqual({ routes: ["/"], skipped: [] });
  });
});

describe("React Navigation linking", () => {
  const nav = (config: string) => makeProject({ "package.json": PLAIN_PKG, "src/navigation/linking.ts": `export const linking = { prefixes: [], ${config} };\n` });

  test("screen paths become routes, nested ones too, params are skipped", () => {
    const root = nav(`config: { screens: { Home: "home", Profile: "user/:id", Tabs: { screens: { Feed: "feed", Search: { path: "search" } } } } }`);
    expect(discoverExpoRoutes(root)).toEqual({ routes: ["/", "/feed", "/home", "/search"], skipped: ["/user/:id"] });
  });

  test("a nested path is joined to its parent's, and comments are ignored", () => {
    const root = nav(`config: { screens: { // Old: "old",\n Settings: { path: "settings", screens: { Account: "account" } } } }`);
    expect(discoverExpoRoutes(root)).toEqual({ routes: ["/", "/settings", "/settings/account"], skipped: [] });
  });

  test("an app with neither Expo Router nor a linking config has /", () => {
    const root = makeProject({ "package.json": PLAIN_PKG, "App.tsx": page });
    expect(discoverExpoRoutes(root)).toEqual({ routes: ["/"], skipped: [] });
  });
});
