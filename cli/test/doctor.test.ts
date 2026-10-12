import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
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

  test("a Flutter app is detected but marked as coming soon", async () => {
    const dir = tempDir("motif-flutter-");
    writeFileSync(join(dir, "pubspec.yaml"), "dependencies:\n  flutter:\n    sdk: flutter\n");
    const r = await runDoctor(dir, deps());
    const app = item(r.data.items as DoctorItem[], "app:.")!;
    expect(app.status).toBe("optional");
    expect(app.detail).toContain("Flutter detected");
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
    expect(item(r.data.items as DoctorItem[], "sources")).toMatchObject({ status: "ok", detail: "Connected: Refero." });
  });

  test("motif doctor --json works end to end", () => {
    const dir = tempDir("motif-e2e-");
    const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "../src/main.ts"), "doctor", "--json", "--cwd", dir]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout.toString())).toMatchObject({ command: "doctor", ok: true });
  });
});
