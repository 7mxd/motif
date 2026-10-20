import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runDoctor, type DoctorDeps, type DoctorItem } from "../src/commands/doctor";
import { copyFixture } from "./helpers";
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
