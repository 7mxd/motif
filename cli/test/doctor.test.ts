import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runDoctor, type DoctorDeps, type DoctorItem } from "../src/commands/doctor";
import { copyFixture } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const deps = (over: Partial<DoctorDeps> = {}): DoctorDeps => ({
  platform: "linux",
  arch: "x64",
  home: tempDir("motif-home-"),
  findBrowser: () => null,
  which: () => null,
  ...over,
});
const item = (items: DoctorItem[], id: string) => items.find((i) => i.id === id);

describe("runDoctor", () => {
  test("an empty folder: friendly, no crash, exit 0", async () => {
    const r = await runDoctor(tempDir("motif-empty-"), deps());
    const items = r.data.items as DoctorItem[];
    expect(r.exitCode).toBe(0);
    expect(item(items, "app")).toMatchObject({ status: "optional" });
    expect(item(items, "browser")).toMatchObject({ status: "needed" });
    expect(item(items, "guide")).toMatchObject({ status: "optional" });
    expect(item(items, "sources")).toMatchObject({ status: "optional" });
    expect(item(items, "node")).toBeUndefined();
    expect(r.text).toStartWith("Motif doctor");
  });

  test("MOTIF_BROWSER=none is named, as something turned off, not missing (backlog)", async () => {
    const r = await runDoctor(tempDir("motif-empty-"), deps({ browserOff: () => true }));
    expect(item(r.data.items as DoctorItem[], "browser")).toEqual({
      id: "browser",
      status: "optional",
      label: "Screenshots and previews",
      detail: "MOTIF_BROWSER=none turns the browser off: previews and screenshots make no images. Unset MOTIF_BROWSER to use Chrome or Edge.",
    });
  });

  test("a React app with a valid guide, a browser and Node", async () => {
    const dir = copyFixture();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^19", vite: "^6" } }));
    const r = await runDoctor(dir, deps({
      findBrowser: () => ({ name: "Edge", path: "C:\\edge.exe" }),
      which: (c) => (c === "node" ? "/usr/bin/node" : null),
    }));
    const items = r.data.items as DoctorItem[];
    expect(item(items, "app:.")).toMatchObject({ status: "ok", detail: "Full support for React (web)." });
    expect(item(items, "browser")).toMatchObject({ status: "ok", detail: "Using Edge." });
    expect(item(items, "node")).toMatchObject({ status: "ok" });
    expect(item(items, "guide")).toMatchObject({ status: "ok", detail: "Valid." });
  });

  test("a Flutter app has full support (Task 15)", async () => {
    const dir = tempDir("motif-flutter-");
    writeFileSync(join(dir, "pubspec.yaml"), "dependencies:\n  flutter:\n    sdk: flutter\n");
    const r = await runDoctor(dir, deps());
    expect(item(r.data.items as DoctorItem[], "app:.")).toMatchObject({ status: "ok", detail: "Full support for Flutter." });
  });

  test("an Expo app has full support (2G Task 13)", async () => {
    const dir = makeProject({ "package.json": JSON.stringify({ dependencies: { expo: "~54.0.1", "react-native": "0.81.5" } }) });
    const r = await runDoctor(dir, deps());
    expect(item(r.data.items as DoctorItem[], "app:.")).toMatchObject({ status: "ok", detail: "Full support for React Native (Expo)." });
  });

  test("a SwiftUI app has full support, in an Xcode project and in a Swift package (2H Task 15)", async () => {
    const qahwa = join(import.meta.dir, "../../tests/fixtures/swiftui-contract-app");
    expect(item((await runDoctor(qahwa, deps())).data.items as DoctorItem[], "app:.")).toMatchObject({ status: "ok", detail: "Full support for SwiftUI." });
    const pkg = makeProject({
      "Package.swift": `// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(name: "Rafiq", platforms: [.iOS(.v17)], targets: [.executableTarget(name: "Rafiq")])\n`,
      "Sources/Rafiq/RafiqApp.swift": "import SwiftUI\n@main struct RafiqApp: App { var body: some Scene { WindowGroup { Text(\"Hi\") } } }\n",
    });
    expect(item((await runDoctor(pkg, deps())).data.items as DoctorItem[], "app:.")).toMatchObject({ status: "ok", detail: "Full support for SwiftUI." });
  });

  test("a stack that isn't supported yet is still detected and marked as coming soon", async () => {
    const dir = tempDir("motif-vue-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { vue: "^3" } }));
    const app = item((await runDoctor(dir, deps())).data.items as DoctorItem[], "app:.")!;
    expect(app.status).toBe("optional");
    expect(app.detail).toContain("Vue / Nuxt detected. Full support is coming soon");
  });

  describe("the Flutter toolchain", () => {
    const flutterApp = () => {
      const dir = tempDir("motif-flutter-sdk-");
      writeFileSync(join(dir, "pubspec.yaml"), "dependencies:\n  flutter:\n    sdk: flutter\n");
      mkdirSync(join(dir, "lib"), { recursive: true });
      writeFileSync(join(dir, "lib", "main.dart"), "void main() {}\n");
      return dir;
    };
    const json = '{"frameworkVersion":"3.44.8","dartSdkVersion":"3.12.2 (stable)"}';
    const found = (c: string) => (c === "flutter" ? "/sdk/bin/flutter" : null);
    const flutterItem = async (over: Partial<DoctorDeps>) =>
      item((await runDoctor(flutterApp(), deps(over))).data.items as DoctorItem[], "flutter");

    test("reports the Flutter and Dart versions", async () => {
      const ran: string[][] = [];
      const it = await flutterItem({ which: found, run: (cmd) => { ran.push(cmd); return { code: 0, stdout: json }; } });
      expect(it).toEqual({ id: "flutter", status: "ok", label: "Flutter SDK", detail: "Flutter 3.44.8 (Dart 3.12.2)." });
      expect(ran[0]).toEqual(["/sdk/bin/flutter", "--version", "--machine"]);
    });

    test("reads the JSON after an upgrade banner", async () => {
      const banner = "╔═══╗\n║ A new version of Flutter is available! ║\n╚═══╝\n";
      const it = await flutterItem({ which: found, run: () => ({ code: 0, stdout: banner + json }) });
      expect(it).toMatchObject({ status: "ok", detail: "Flutter 3.44.8 (Dart 3.12.2)." });
    });

    test("asks to install Flutter when it isn't found", async () => {
      const it = await flutterItem({ which: () => null, run: () => ({ code: 1, stdout: "" }) });
      expect(it).toEqual({
        id: "flutter",
        status: "needed",
        label: "Flutter SDK",
        detail: "Flutter isn't installed. Theme code, checks and drafts work without it; screenshots need it: install it from https://docs.flutter.dev/get-started/install.",
      });
    });

    test("asks to upgrade when Flutter is older than 3.27", async () => {
      const old = '{"frameworkVersion":"3.24.5","dartSdkVersion":"3.5.4"}';
      const it = await flutterItem({ which: found, run: () => ({ code: 0, stdout: old }) });
      expect(it).toMatchObject({ status: "needed", detail: "Flutter 3.24.5 is older than 3.27, which Motif's theme code needs. Run flutter upgrade." });
    });

    test("exactly 3.27.0 is fine", async () => {
      const it = await flutterItem({ which: found, run: () => ({ code: 0, stdout: '{"frameworkVersion":"3.27.0","dartSdkVersion":"3.6.0"}' }) });
      expect(it).toMatchObject({ status: "ok" });
    });

    test("no Flutter app means no flutter item, and the SDK check leaves the app line alone", async () => {
      const web = copyFixture();
      writeFileSync(join(web, "package.json"), JSON.stringify({ dependencies: { react: "^19", vite: "^6" } }));
      expect(item((await runDoctor(web, deps({ which: found }))).data.items as DoctorItem[], "flutter")).toBeUndefined();
      const items = (await runDoctor(flutterApp(), deps({ which: found, run: () => ({ code: 0, stdout: json }) }))).data.items as DoctorItem[];
      expect(item(items, "app:.")).toMatchObject({ status: "ok", detail: "Full support for Flutter." });
    });
  });

  describe("the Android toolchain", () => {
    const composeApp = (extra: Record<string, string> = {}) =>
      makeProject({
        "settings.gradle.kts": 'include(":app")\n',
        "app/build.gradle.kts": 'plugins {\n  alias(libs.plugins.android.application)\n  alias(libs.plugins.kotlin.compose)\n}\nandroid { namespace = "com.example.rafiq" }\n',
        ...extra,
      });
    /** A fake disk: file contents by path; a folder exists when something is inside it. */
    const disk = (files: Record<string, string>) => ({
      exists: (p: string) => p in files || Object.keys(files).some((f) => f.startsWith(p + "/") || f.startsWith(p + "\\")),
      read: (p: string) => files[p] ?? null,
      list: (p: string) =>
        [...new Set(Object.keys(files).filter((f) => f.startsWith(p + "/") || f.startsWith(p + "\\")).map((f) => f.slice(p.length + 1).split(/[\\/]/)[0]!))],
    });
    const java = (version: string) => ({ code: 0, stdout: "", stderr: `openjdk version "${version}" 2024-07-16\nOpenJDK Runtime Environment (build ${version}+7)\n` });
    const items = async (dir: string, over: Partial<DoctorDeps>) => (await runDoctor(dir, deps({ platform: "linux", home: "/home/dev", ...over }))).data.items as DoctorItem[];

    test("a JDK on the PATH is read from java -version's error output", async () => {
      const ran: string[][] = [];
      const got = await items(composeApp(), { which: (c) => (c === "java" ? "/usr/bin/java" : null), run: (cmd) => (ran.push(cmd), java("17.0.12")), files: disk({}) });
      expect(item(got, "jdk")).toEqual({ id: "jdk", status: "ok", label: "JDK", detail: "JDK 17.0.12." });
      expect(ran[0]).toEqual(["/usr/bin/java", "-version"]);
    });

    test("no JDK anywhere asks for one, and says what still works", async () => {
      const got = await items(composeApp(), { run: () => ({ code: 127, stdout: "" }), files: disk({}) });
      expect(item(got, "jdk")).toEqual({
        id: "jdk",
        status: "needed",
        label: "JDK",
        detail: "No JDK found. Theme code, checks and drafts work without it; screenshots need JDK 17 or newer: install Android Studio (it brings one) or a JDK from https://adoptium.net.",
      });
    });

    test("a JDK older than 17 is called out", async () => {
      const got = await items(composeApp(), { which: () => "/usr/bin/java", run: () => java("11.0.2"), files: disk({}) });
      expect(item(got, "jdk")).toMatchObject({ status: "needed", detail: "JDK 11.0.2 is older than 17, which Android's build needs." });
      const old = await items(composeApp(), { which: () => "/usr/bin/java", run: () => java("1.8.0_352"), files: disk({}) });
      expect(item(old, "jdk")!.detail).toBe("JDK 1.8.0 is older than 17, which Android's build needs.");
    });

    test("JAVA_HOME is used when java isn't on the PATH", async () => {
      const files = disk({ "/opt/jdk/bin/java": "" });
      const got = await items(composeApp(), { vars: { JAVA_HOME: "/opt/jdk" }, run: (cmd) => (cmd[0] === "/opt/jdk/bin/java" ? java("21.0.3") : { code: 127, stdout: "" }), files });
      expect(item(got, "jdk")).toMatchObject({ status: "ok", detail: "JDK 21.0.3." });
    });

    test("Android Studio's bundled JDK is the last resort on each system", async () => {
      const bundled = {
        win32: "C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe",
        darwin: "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java",
        linux: "/opt/android-studio/jbr/bin/java",
      } as const;
      for (const platform of ["win32", "darwin", "linux"] as const) {
        const path = bundled[platform];
        const got = await items(composeApp(), { platform, run: (cmd) => (cmd[0] === path ? java("21.0.8") : { code: 127, stdout: "" }), files: disk({ [path]: "" }) });
        expect(item(got, "jdk")).toMatchObject({ status: "ok", detail: "JDK 21.0.8." });
      }
    });

    test("the Android SDK comes from ANDROID_HOME, with the platforms it has", async () => {
      const files = disk({ "/sdk/platforms/android-36/android.jar": "", "/sdk/platforms/android-35/android.jar": "" });
      const got = await items(composeApp(), { vars: { ANDROID_HOME: "/sdk" }, files });
      expect(item(got, "android-sdk")).toEqual({ id: "android-sdk", status: "ok", label: "Android SDK", detail: "Android SDK at /sdk (platforms 35, 36)." });
    });

    test("ANDROID_SDK_ROOT, then local.properties with an escaped Windows path, then the default folder", async () => {
      const platforms = (sdk: string) => ({ [`${sdk}/platforms/android-35/x`]: "" });
      const root = composeApp();
      const viaRoot = await items(root, { vars: { ANDROID_SDK_ROOT: "/rootsdk" }, files: disk(platforms("/rootsdk")) });
      expect(item(viaRoot, "android-sdk")!.detail).toBe("Android SDK at /rootsdk (platforms 35).");

      const local = join(root, "app", "local.properties");
      const winSdk = "C:\\Users\\Dev\\AppData\\Local\\Android\\Sdk";
      const viaProps = await items(root, {
        platform: "win32",
        files: disk({ [local]: "## This file is automatically generated by Android Studio.\nsdk.dir=C\\:\\\\Users\\\\Dev\\\\AppData\\\\Local\\\\Android\\\\Sdk\n", [`${winSdk}\\platforms\\android-36\\x`]: "" }),
      });
      expect(item(viaProps, "android-sdk")!.detail).toBe(`Android SDK at ${winSdk} (platforms 36).`);

      const viaDefault = await items(root, { files: disk(platforms("/home/dev/Android/Sdk")) });
      expect(item(viaDefault, "android-sdk")!.detail).toBe("Android SDK at /home/dev/Android/Sdk (platforms 35).");
      const mac = await items(root, { platform: "darwin", files: disk(platforms("/home/dev/Library/Android/sdk")) });
      expect(item(mac, "android-sdk")!.detail).toBe("Android SDK at /home/dev/Library/Android/sdk (platforms 35).");
      const win = await items(root, { platform: "win32", home: "C:\\Users\\Dev", vars: { LOCALAPPDATA: "C:\\Users\\Dev\\AppData\\Local" }, files: disk({ [`${winSdk}\\platforms\\android-35\\x`]: "" }) });
      expect(item(win, "android-sdk")!.detail).toBe(`Android SDK at ${winSdk} (platforms 35).`);
    });

    test("no SDK asks for one; an SDK with no platforms yet is fine, and so is an old platform", async () => {
      const none = await items(composeApp(), { files: disk({}) });
      expect(item(none, "android-sdk")).toEqual({
        id: "android-sdk",
        status: "needed",
        label: "Android SDK",
        detail: "No Android SDK found. Screenshots need it: install Android Studio, or set ANDROID_HOME to an SDK folder.",
      });
      const bare = await items(composeApp(), { vars: { ANDROID_HOME: "/sdk" }, files: disk({ "/sdk/licenses/x": "" }) });
      expect(item(bare, "android-sdk")).toMatchObject({ status: "ok", detail: "Android SDK at /sdk (no platforms yet; Gradle downloads the one the app compiles against)." });
      const old = await items(composeApp(), { vars: { ANDROID_HOME: "/sdk" }, files: disk({ "/sdk/platforms/android-34/x": "" }) });
      expect(item(old, "android-sdk")).toMatchObject({ status: "ok", detail: "Android SDK at /sdk (platforms 34)." });
    });

    test("local.properties at the Gradle root is found, and an ANDROID_HOME missing on disk falls through", async () => {
      const root = composeApp();
      const files = disk({ [join(root, "local.properties")]: "sdk.dir=/from/root\n","/from/root/platforms/android-36/x": "" });
      const got = await items(root, { vars: { ANDROID_HOME: "/gone" }, files });
      expect(item(got, "android-sdk")!.detail).toBe("Android SDK at /from/root (platforms 36).");
    });

    test("a java on the PATH that fails falls through to JAVA_HOME", async () => {
      const files = disk({ "/opt/jdk/bin/java": "" });
      const got = await items(composeApp(), {
        which: () => "/usr/bin/java",
        vars: { JAVA_HOME: "/opt/jdk" },
        run: (cmd) => (cmd[0] === "/opt/jdk/bin/java" ? java("17.0.2") : { code: 1, stdout: "" }),
        files,
      });
      expect(item(got, "jdk")).toMatchObject({ status: "ok", detail: "JDK 17.0.2." });
    });

    test("a Compose BOM older than 2025.08.00 is called out; one Motif can't find, or a new enough one, says nothing (final review)", async () => {
      const root = composeApp();
      const build = join(root, "app", "build.gradle.kts");
      const toml = join(root, "gradle", "libs.versions.toml");
      const catalogue = (bom: string) =>
        `[versions]\ncomposeBom = "${bom}"\n\n[libraries]\nandroidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }\n`;
      const gradle = "plugins {\n  alias(libs.plugins.android.application)\n}\ndependencies {\n  implementation(platform(libs.androidx.compose.bom))\n}\n";
      const old = await items(root, { files: disk({ [build]: gradle, [toml]: catalogue("2024.09.00") }) });
      expect(item(old, "compose-ui:app")).toEqual({
        id: "compose-ui:app",
        status: "needed",
        label: "Compose",
        detail:
          "app uses Compose BOM 2024.09.00, older than 2025.08.00 (Compose UI 1.9), which Motif's theme code needs: MotifTheme.kt's shadows use Modifier.dropShadow, so the app won't build with it. " +
          "Update the BOM in gradle/libs.versions.toml to 2025.08.00 or later, then build again.",
      });
      const fine = await items(root, { files: disk({ [build]: gradle, [toml]: catalogue("2025.08.00") }) });
      expect(item(fine, "compose-ui:app")).toBeUndefined();
      const unknown = await items(root, { files: disk({ [build]: gradle }) });
      expect(item(unknown, "compose-ui:app")).toBeUndefined();
    });

    test("no Compose app means neither item, and a Compose app has full support (Task 15)", async () => {
      const files = disk({});
      const web = copyFixture();
      writeFileSync(join(web, "package.json"), JSON.stringify({ dependencies: { react: "^19", vite: "^6" } }));
      const none = await items(web, { which: () => "/usr/bin/java", run: () => java("17.0.12"), files });
      expect(item(none, "jdk")).toBeUndefined();
      expect(item(none, "android-sdk")).toBeUndefined();
      const got = await items(composeApp(), { which: () => "/usr/bin/java", run: () => java("17.0.12"), files });
      expect(item(got, "app:app")).toMatchObject({ status: "ok", detail: "Full support for Jetpack Compose." });
    });
  });

  test("a React app Motif can't place asks for design/motif.json instead of offering a new app", async () => {
    const dir = tempDir("motif-esbuild-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^19" }, devDependencies: { esbuild: "^0.24" } }));
    const items = (await runDoctor(dir, deps())).data.items as DoctorItem[];
    expect(item(items, "app")).toBeUndefined();
    expect(item(items, "app:.")).toMatchObject({ status: "needed" });
    expect(item(items, "app:.")!.detail).toContain("design/motif.json");
  });

  test("a design guide with problems is flagged", async () => {
    const dir = copyFixture();
    const p = join(dir, "design", "tokens.json");
    const t = JSON.parse(readFileSync(p, "utf8"));
    delete t.color.focus;
    writeFileSync(p, JSON.stringify(t));
    const r = await runDoctor(dir, deps());
    expect(item(r.data.items as DoctorItem[], "guide")).toMatchObject({ status: "needed" });
  });

  test("lists connected design sources", async () => {
    const dir = tempDir("motif-src-");
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { refero: { url: "https://x" } } }));
    const r = await runDoctor(dir, deps());
    expect(item(r.data.items as DoctorItem[], "sources")).toMatchObject({ status: "ok", detail: "Connected: Refero (Claude Code, GitHub Copilot CLI)." });
  });

  test("names the agents that have each source, and the settings files it couldn't read (Part 3)", async () => {
    const home = tempDir("motif-doc-home-");
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(join(home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { motion: { url: "https://mcp.motion.dev" } } }));
    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(join(home, ".gemini", "settings.json"), "{ nope");
    const r = await runDoctor(tempDir("motif-doc-app-"), deps({ home, platform: "linux", vars: {} }));
    expect(r.exitCode).toBe(0);
    expect(item(r.data.items as DoctorItem[], "sources")).toMatchObject({ status: "ok", detail: "Connected: Motion (Cursor)." });
    const sources = r.data.sources as { id: string; agents: { agent: string; server: string; where: string }[] }[];
    expect(sources.find((s) => s.id === "motion")!.agents).toEqual([{ agent: "cursor", server: "motion", where: "~/.cursor/mcp.json" }]);
    expect(sources.find((s) => s.id === "refero")!.agents).toEqual([]);
    expect(r.data.unreadable).toEqual([join(home, ".gemini", "settings.json")]);
  });

  test("says which agent settings files it couldn't read, not only in --json (v0.2.0 review minor)", async () => {
    const home = tempDir("motif-doc-home-");
    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(join(home, ".gemini", "settings.json"), "{ nope");
    const r = await runDoctor(tempDir("motif-doc-app-"), deps({ home, platform: "linux", vars: {} }));
    expect(item(r.data.items as DoctorItem[], "agent-settings")).toEqual({
      id: "agent-settings",
      status: "optional",
      label: "Agent settings",
      detail: "Motif couldn't read ~/.gemini/settings.json (it isn't valid, or can't be opened), so a design source set up there isn't shown.",
    });
    expect(r.text).toContain("○ Agent settings — Motif couldn't read ~/.gemini/settings.json");
    const clean = await runDoctor(tempDir("motif-doc-app-"), deps({ vars: {} }));
    expect(item(clean.data.items as DoctorItem[], "agent-settings")).toBeUndefined();
  });

  test("motif doctor --json works end to end", () => {
    const dir = tempDir("motif-e2e-");
    const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "../src/main.ts"), "doctor", "--json", "--cwd", dir]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout.toString())).toMatchObject({ command: "doctor", ok: true });
  });
});

describe("runDoctor in a home folder (review of batch C1)", () => {
  test("says it's a home folder, and doesn't offer to start an app there", async () => {
    const home = tempDir("motif-home-");
    const r = await runDoctor(home, deps({ home }));
    const items = r.data.items as DoctorItem[];
    expect(item(items, "app")).toMatchObject({ status: "optional", detail: expect.stringContaining("This is your home folder") });
    expect(r.text).not.toContain("/design can start a new one");
    expect(item(items, "settings")).toBeUndefined();
  });
});

describe("runDoctor: a guide git ignores (Task 15 wave B, #10)", () => {
  const run = (cmd: string[]) => {
    const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "ignore" });
    return { code: r.exitCode ?? 1, stdout: r.stdout.toString() };
  };

  test("a guide inside an ignored folder is flagged, with the rule's line and the fix", async () => {
    const dir = copyFixture();
    writeFileSync(join(dir, ".gitignore"), "node_modules/\ndesign/\n");
    expect(run(["git", "-C", dir, "init", "-q"]).code).toBe(0);
    const r = await runDoctor(dir, deps({ run }));
    expect(item(r.data.items as DoctorItem[], "git")).toEqual({
      id: "git",
      status: "needed",
      label: "Design guide in git",
      detail: "Your .gitignore ignores design/ (line 2 of .gitignore), so design/tokens.json won't be committed. Add !design/ on a line below it (git can't let a file back in while its folder is ignored), or narrow the rule.",
    });
  });

  test("nothing ignored, or not a repository: no git item", async () => {
    const dir = copyFixture();
    expect(item((await runDoctor(dir, deps({ run }))).data.items as DoctorItem[], "git")).toBeUndefined();
    run(["git", "-C", dir, "init", "-q"]);
    expect(item((await runDoctor(dir, deps({ run }))).data.items as DoctorItem[], "git")).toBeUndefined();
  });

  describe("the Expo web target", () => {
    const expoApp = (deps: Record<string, string>, installed?: string) =>
      makeProject({
        "package.json": JSON.stringify({ dependencies: deps }),
        ...(installed ? { "node_modules/expo/package.json": JSON.stringify({ version: installed }) } : {}),
      });
    const rnItem = async (dir: string) => item((await runDoctor(dir, deps())).data.items as DoctorItem[], "expo-web");
    const web = { "react-dom": "19", "react-native-web": "0.21", "@expo/metro-runtime": "6" };

    test("is ok with the SDK and the web packages", async () => {
      const it = await rnItem(expoApp({ expo: "~54.0.1", ...web }, "54.0.12"));
      expect(it).toEqual({ id: "expo-web", status: "ok", label: "Expo web target", detail: "Expo SDK 54, with the web target's packages." });
    });

    test("asks for the missing web packages", async () => {
      const it = await rnItem(expoApp({ expo: "~54.0.1", "react-dom": "19" }, "54.0.12"));
      expect(it).toEqual({
        id: "expo-web", status: "needed", label: "Expo web target",
        detail: "The web target needs react-dom, react-native-web and @expo/metro-runtime for screenshots: npx expo install react-dom react-native-web @expo/metro-runtime",
      });
    });

    test("asks to upgrade an SDK older than 52", async () => {
      const it = await rnItem(expoApp({ expo: "~51.0.0", ...web }, "51.0.39"));
      expect(it).toMatchObject({ id: "expo-web", status: "needed", detail: "Expo SDK 51 is older than 52, which Motif's theme code needs: npx expo install expo@latest --fix." });
    });

    test("finds an Expo app one folder down", async () => {
      const dir = makeProject({ "package.json": "{}", "mobile/expo-app/package.json": JSON.stringify({ dependencies: { expo: "~54.0.1", ...web } }) });
      expect(await rnItem(dir)).toMatchObject({ status: "ok", detail: "Expo SDK 54, with the web target's packages." });
    });

    test("a bare React Native app is told once, in plain words, what works without Expo; the app line doesn't claim full support", async () => {
      const r = await runDoctor(expoApp({ "react-native": "0.74" }), deps());
      const items = r.data.items as DoctorItem[];
      expect(item(items, "expo-web")).toBeUndefined();
      expect(item(items, "react-native")).toBeUndefined();
      expect(item(items, "app:.")).toMatchObject({
        status: "optional",
        detail: "React Native without Expo detected. Motif fully supports Expo apps; here theme code, checks and drafts work, and for screenshots, run the app on react-native-web and pass its address to motif shot --url.",
      });
      expect(r.text.match(/without Expo/g)).toHaveLength(1);
      expect(r.text).not.toContain("non-goal");
    });
  });
});

describe("the Xcode toolchain for SwiftUI apps", () => {
  const swiftApp = (platforms: string) =>
    makeProject({
      "Package.swift": `// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(name: "Rafiq", platforms: [${platforms}], targets: [.executableTarget(name: "Rafiq")])\n`,
      "Sources/Rafiq/RafiqApp.swift": "import SwiftUI\n@main struct RafiqApp: App { var body: some Scene { WindowGroup { Text(\"Hi\") } } }\n",
    });
  const ios = () => swiftApp(".iOS(.v17)");
  const mac = () => swiftApp(".macOS(.v14)");
  const runtimes = (...versions: string[]) =>
    JSON.stringify({
      runtimes: versions.map((v) => ({ identifier: `com.apple.CoreSimulator.SimRuntime.iOS-${v.replace(".", "-")}`, name: `iOS ${v}`, version: v, platform: "iOS", isAvailable: true })),
    });
  const swift = "swift-driver version: 1.115.1 Apple Swift version 6.0.3 (swiftlang-6.0.3.1.10 clang-1600.0.30.6)\nTarget: arm64-apple-macosx15.0\n";
  const mini = (over: { select?: string; xcode?: string; runtimes?: string } = {}): Partial<DoctorDeps> => ({
    platform: "darwin",
    run: (cmd) => {
      const c = cmd.join(" ");
      if (c === "xcode-select -p") return { code: 0, stdout: (over.select ?? "/Applications/Xcode.app/Contents/Developer") + "\n" };
      if (c === "xcodebuild -version") return { code: 0, stdout: over.xcode ?? "Xcode 16.2\nBuild version 16C5032a\n" };
      if (c === "swift --version") return { code: 0, stdout: swift };
      if (c === "xcrun simctl list runtimes --json") return { code: 0, stdout: over.runtimes ?? runtimes("18.2") };
      return { code: 127, stdout: "" };
    },
  });
  const xcode = async (dir: string, over: Partial<DoctorDeps>) => item((await runDoctor(dir, deps(over))).data.items as DoctorItem[], "xcode");

  test("Xcode, its Swift and the iOS simulator, for an iOS app", async () => {
    expect(await xcode(ios(), mini())).toEqual({ id: "xcode", status: "ok", label: "Xcode", detail: "Xcode 16.2 (Swift 6.0.3), with the iOS 18.2 simulator." });
  });

  test("reads Xcode 27 and its newest iOS runtime", async () => {
    const it = await xcode(ios(), mini({ xcode: "Xcode 27.0\nBuild version 27A266a\n", runtimes: runtimes("17.5", "27.0") }));
    expect(it).toMatchObject({ status: "ok", detail: "Xcode 27.0 (Swift 6.0.3), with the iOS 27.0 simulator." });
  });

  test("a macOS-only app needs no simulator", async () => {
    const it = await xcode(mac(), mini({ runtimes: JSON.stringify({ runtimes: [] }) }));
    expect(it).toEqual({ id: "xcode", status: "ok", label: "Xcode", detail: "Xcode 16.2 (Swift 6.0.3). A macOS app needs no simulator." });
  });

  test("the command-line tools alone are not enough", async () => {
    const it = await xcode(ios(), mini({ select: "/Library/Developer/CommandLineTools" }));
    expect(it).toEqual({
      id: "xcode",
      status: "needed",
      label: "Xcode",
      detail: "Screenshots need Xcode, not only its command-line tools: install Xcode from the App Store, then run sudo xcode-select -s /Applications/Xcode.app.",
    });
  });

  test("an iOS app with no iOS simulator is told where to install one", async () => {
    const it = await xcode(ios(), mini({ runtimes: JSON.stringify({ runtimes: [{ name: "tvOS 18.0", version: "18.0", platform: "tvOS", isAvailable: true }, { name: "iOS 18.2", version: "18.2", platform: "iOS", isAvailable: false }] }) }));
    expect(it).toMatchObject({ status: "needed", detail: "Xcode 16.2 has no iOS simulator, which an iOS app's screenshots need: install an iOS simulator in Xcode › Settings › Components." });
  });

  test("Xcode older than 16 asks for an update", async () => {
    const it = await xcode(ios(), mini({ xcode: "Xcode 15.4\nBuild version 15F31d\n" }));
    expect(it).toMatchObject({ status: "needed", detail: "Xcode 15.4 is older than 16, which Motif's theme code needs. Update Xcode from the App Store." });
  });

  test("no Xcode at all", async () => {
    const it = await xcode(ios(), { platform: "darwin", run: () => ({ code: 127, stdout: "" }) });
    expect(it).toMatchObject({ status: "needed", detail: expect.stringContaining("Xcode isn't installed") });
  });

  test("on Windows and Linux: a Mac is needed for screenshots, and nothing is run", async () => {
    for (const platform of ["win32", "linux"] as const) {
      const ran: string[][] = [];
      const it = await xcode(ios(), { platform, run: (cmd) => (ran.push(cmd), { code: 0, stdout: "" }) });
      expect(it).toEqual({ id: "xcode", status: "optional", label: "Xcode", detail: "SwiftUI screenshots need a Mac with Xcode. Theme code, checks and drafts work here." });
      expect(ran).toEqual([]);
    }
  });
});

describe("the Xcode toolchain: noisy and failing tools", () => {
  const app = () =>
    makeProject({
      "Package.swift": `// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(name: "Rafiq", platforms: [.iOS(.v17)], targets: [.executableTarget(name: "Rafiq")])\n`,
      "Sources/Rafiq/RafiqApp.swift": "import SwiftUI\n@main struct RafiqApp: App { var body: some Scene { WindowGroup { Text(\"Hi\") } } }\n",
    });
  const good = '{"runtimes":[{"platform":"iOS","version":"18.2","isAvailable":true}]}';
  const mini = (o: { xcode?: { code: number; stdout: string }; swift?: { code: number; stdout: string }; sim?: { code: number; stdout: string } }): Partial<DoctorDeps> => ({
    platform: "darwin",
    run: (cmd) => {
      const c = cmd.join(" ");
      if (c === "xcode-select -p") return { code: 0, stdout: "/Applications/Xcode.app/Contents/Developer" };
      if (c === "xcodebuild -version") return o.xcode ?? { code: 0, stdout: "Xcode 16.2\nBuild version 16C5032a\n" };
      if (c === "swift --version") return o.swift ?? { code: 0, stdout: "Apple Swift version 6.0.3 (swiftlang)\n" };
      return o.sim ?? { code: 0, stdout: good };
    },
  });
  const xcode = async (over: Partial<DoctorDeps>) => item((await runDoctor(app(), deps(over))).data.items as DoctorItem[], "xcode")!;

  test("warnings before the simulators' JSON are skipped", async () => {
    expect(await xcode(mini({ sim: { code: 0, stdout: `CoreSimulator is out of date. Current version (1) vs. (2).\n${good}` } }))).toMatchObject({ status: "ok", detail: "Xcode 16.2 (Swift 6.0.3), with the iOS 18.2 simulator." });
  });

  test("a failing or unreadable simctl is not 'no simulator'", async () => {
    for (const sim of [{ code: 1, stdout: "" }, { code: 0, stdout: "not json" }, { code: 0, stdout: '{"other":1}' }]) {
      expect(await xcode(mini({ sim }))).toMatchObject({ status: "optional", detail: expect.stringContaining("couldn't list the simulators") });
    }
    expect((await xcode(mini({ sim: { code: 1, stdout: "" } }))).detail).toContain("run xcrun simctl list runtimes to see why.");
  });

  test("visionOS and watchOS runtimes don't count", async () => {
    const sim = { code: 0, stdout: JSON.stringify({ runtimes: [{ platform: "xrOS", version: "2.0", isAvailable: true }, { platform: "watchOS", version: "11.0", isAvailable: true }] }) };
    expect(await xcode(mini({ sim }))).toMatchObject({ status: "needed", detail: expect.stringContaining("no iOS simulator") });
  });

  test("an unaccepted licence is not 'not installed'", async () => {
    const it = await xcode(mini({ xcode: { code: 69, stdout: "You have not agreed to the Xcode license agreements." } }));
    expect(it).toMatchObject({ status: "needed", detail: "Xcode is installed but didn't run: open it once, or run sudo xcodebuild -license accept." });
  });

  test("a beta version reads by its numbers", async () => {
    expect(await xcode(mini({ xcode: { code: 0, stdout: "Xcode 26.1 beta\nBuild version 26B5\n" } }))).toMatchObject({ status: "ok", detail: expect.stringContaining("Xcode 26.1 (") });
  });

  test("a failing swift --version leaves the Swift out", async () => {
    expect(await xcode(mini({ swift: { code: 1, stdout: "" } }))).toMatchObject({ status: "ok", detail: "Xcode 16.2, with the iOS 18.2 simulator." });
  });
});
