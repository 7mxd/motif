import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");
const reactPkg = (tailwind = true) => JSON.stringify({
  dependencies: { react: "^19", "react-dom": "^19" },
  devDependencies: { vite: "^6", ...(tailwind ? { tailwindcss: "^4.1.0", "@tailwindcss/vite": "^4.1.0" } : {}) },
});
const app = (extra: Record<string, string> = {}, tailwind = true) => makeProject({
  "package.json": reactPkg(tailwind),
  "src/main.tsx": "",
  "src/index.css": '@import "tailwindcss";\n',
  "design/tokens.json": TOKENS,
  ...extra,
});
const ctx = (app?: string) => ({ positionals: [], app });
const statuses = (r: any) => Object.fromEntries((r.data.files as any[]).map((f) => [f.path, f.status]));

describe("runTokens", () => {
  test("writes the theme files and design/motif.json, then suggests the import", async () => {
    const root = app();
    const r = await runTokens(root, ctx());
    expect(r.exitCode).toBe(0);
    expect(statuses(r)).toEqual({
      "src/styles/motif.css": "created",
      "src/styles/motif.tailwind.css": "created",
      "src/design/motion.ts": "created",
      "design/motif.json": "created",
    });
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8"))).toEqual({
      motifContract: 1, apps: [{ path: ".", stack: "react-web", srcDir: "src" }], ignore: [],
    });
    expect((r.data.notes as string[]).join("\n")).toContain('import "./styles/motif.tailwind.css"');
  });

  test("running again changes nothing", async () => {
    const root = app();
    await runTokens(root, ctx());
    const r = await runTokens(root, ctx());
    expect(new Set(Object.values(statuses(r)))).toEqual(new Set(["unchanged"]));
    expect(r.text).toContain("up to date");
  });

  test("no import hint once the stylesheet is imported", async () => {
    const r = await runTokens(app({ "src/index.css": '@import "tailwindcss";\n@import "./styles/motif.tailwind.css";\n' }), ctx());
    expect((r.data.notes as string[]).some((n) => n.includes("import"))).toBe(false);
  });

  test("never overwrites a file Motif didn't write", async () => {
    const root = app({ "src/styles/motif.css": ".mine { color: red; }\n" });
    const r = await runTokens(root, ctx());
    expect(r.exitCode).toBe(1);
    expect(statuses(r)["src/styles/motif.css"]).toBe("protected");
    expect(readFileSync(join(root, "src/styles/motif.css"), "utf8")).toBe(".mine { color: red; }\n");
    expect(statuses(r)["src/design/motion.ts"]).toBe("created");
    expect(r.text).toContain("wasn't made by Motif");
  });

  test("a hand-edited generated file is regenerated", async () => {
    const root = app();
    await runTokens(root, ctx());
    const p = join(root, "src/styles/motif.css");
    writeFileSync(p, readFileSync(p, "utf8").replace("#F9FAFB", "#FFFFFF"));
    expect(statuses(await runTokens(root, ctx()))["src/styles/motif.css"]).toBe("updated");
  });

  test("without Tailwind there is no Tailwind file", async () => {
    const r = await runTokens(app({}, false), ctx());
    expect(Object.keys(statuses(r))).not.toContain("src/styles/motif.tailwind.css");
    expect((r.data.notes as string[]).join("\n")).toContain('import "./styles/motif.css"');
  });

  test("a stack without an adapter gets plain CSS variables and flat JSON", async () => {
    const root = makeProject({ "pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n", "design/tokens.json": TOKENS });
    const r = await runTokens(root, ctx());
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(root, "design/generated/motif.css"))).toBe(true);
    expect(existsSync(join(root, "design/generated/tokens.flat.json"))).toBe(true);
    expect((r.data.notes as string[]).join("\n")).toContain("Flutter support is coming soon");
  });

  test("broken theme values → exit 1 and nothing written", async () => {
    const t = JSON.parse(TOKENS);
    delete t.color.focus;
    const root = app({ "design/tokens.json": JSON.stringify(t) });
    const r = await runTokens(root, ctx());
    expect(r.exitCode).toBe(1);
    expect(existsSync(join(root, "src/styles"))).toBe(false);
  });

  test("no design guide → exit 2", async () => {
    const r = await runTokens(makeProject({ "package.json": reactPkg() }), ctx());
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("motif extract");
  });

  test("--app picks one app in a monorepo; an unknown app is a usage error", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ workspaces: ["apps/*"] }),
      "apps/web/package.json": reactPkg(),
      "apps/web/src/main.tsx": "",
      "apps/admin/package.json": reactPkg(),
      "apps/admin/src/main.tsx": "",
      "design/tokens.json": TOKENS,
    });
    const r = await runTokens(root, ctx("apps/web"));
    expect(Object.keys(statuses(r)).filter((p) => p.startsWith("apps/"))).toEqual([
      "apps/web/src/styles/motif.css", "apps/web/src/styles/motif.tailwind.css", "apps/web/src/design/motion.ts",
    ]);
    expect((await runTokens(root, ctx("apps/nope"))).exitCode).toBe(2);
  });

  test("adds srcDir to an existing design/motif.json", async () => {
    const root = app({ "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: ".", stack: "react-web" }], ignore: ["legacy/"] }) });
    const r = await runTokens(root, ctx());
    expect(statuses(r)["design/motif.json"]).toBe("updated");
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8"))).toEqual({
      motifContract: 1, apps: [{ path: ".", stack: "react-web", srcDir: "src" }], ignore: ["legacy/"],
    });
  });

  test("motif tokens --json works end to end", () => {
    const root = app();
    const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "../src/main.ts"), "tokens", "--json", "--cwd", root]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout.toString())).toMatchObject({ command: "tokens", ok: true });
  });
});
