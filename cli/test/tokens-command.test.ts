import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { FIXTURES, twoVariantTokens } from "./helpers";
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
/** An app whose stack has no adapter yet (Flutter has had one since 2E, Compose since 2F). */
const SWIFTUI = { "Package.swift": "// swift-tools-version:5.9", "Sources/App/App.swift": "import SwiftUI\n@main struct A: App {}" };
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
    expect((r.data.notes as string[]).join("\n")).toContain("src/styles/motif.tailwind.css");
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
    expect((r.data.notes as string[]).join("\n")).toContain("src/styles/motif.css");
  });

  test("a stack without an adapter gets plain CSS variables and flat JSON", async () => {
    const root = makeProject({ ...SWIFTUI, "design/tokens.json": TOKENS });
    const r = await runTokens(root, ctx());
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(root, "design/generated/motif.css"))).toBe(true);
    expect(existsSync(join(root, "design/generated/tokens.flat.json"))).toBe(true);
    expect((r.data.notes as string[]).join("\n")).toContain("SwiftUI support is coming soon");
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

  test("lists the fonts the app must load, with the weights its roles use", async () => {
    const r = await runTokens(app(), ctx());
    expect(r.data.fonts).toEqual([{ family: "Inter", weights: expect.any(Array) }]);
    expect((r.data.fonts as { weights: number[] }[])[0]!.weights.length).toBeGreaterThan(0);
    expect(r.text).toContain("Theme fonts: Inter");
  });
});

describe("runTokens: unusual apps and settings", () => {
  test("a stack Motif doesn't know gets plain CSS variables and flat JSON, not a false ✓", async () => {
    const root = makeProject({
      "design/tokens.json": TOKENS,
      "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: ".", stack: "solid" }], ignore: [] }),
    });
    const r = await runTokens(root, ctx());
    expect(existsSync(join(root, "design/generated/tokens.flat.json"))).toBe(true);
    expect(r.text).not.toContain("up to date");
  });

  test("React with unknown build tooling gets the fallback and is never written to motif.json with no stack", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { react: "^19" }, devDependencies: { esbuild: "^0.24" } }),
      "design/tokens.json": TOKENS,
    });
    const r = await runTokens(root, ctx());
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(root, "design/generated/motif.css"))).toBe(true);
    expect(existsSync(join(root, "design/motif.json"))).toBe(false);
  });

  test("a newer design/motif.json format is refused, not rewritten", async () => {
    const settings = JSON.stringify({ motifContract: 2, apps: [{ path: ".", stack: "react-web" }], ignore: [] });
    const root = app({ "design/motif.json": settings });
    const r = await runTokens(root, ctx());
    expect(r.exitCode).toBe(2);
    expect(readFileSync(join(root, "design/motif.json"), "utf8")).toBe(settings);
  });

  test("unknown keys in design/motif.json survive an update", async () => {
    const root = app({ "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: ".", stack: "react-web" }], ignore: [], team: "web" }) });
    await runTokens(root, ctx());
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).team).toBe("web");
  });

  test("when motif.css is someone else's, the Tailwind file and the import hint are skipped", async () => {
    const root = app({ "src/styles/motif.css": ".mine {}\n" });
    const r = await runTokens(root, ctx());
    expect(existsSync(join(root, "src/styles/motif.tailwind.css"))).toBe(false);
    expect((r.data.notes as string[]).some((n) => n.startsWith("Next:"))).toBe(false);
  });

  test("the import hint says @import, and after Tailwind", async () => {
    const r = await runTokens(app(), ctx());
    const hint = (r.data.notes as string[]).find((n) => n.startsWith("Next:"))!;
    expect(hint).toContain('@import "tailwindcss"');
    expect(hint).toContain("src/styles/motif.tailwind.css");
  });
});

describe("motif tokens on a plain web site at the project's root (backlog)", () => {
  test("says to link motif.css when no page does, even if the design guide or docs mention it", async () => {
    const root = makeProject({
      "design/tokens.json": TOKENS,
      "index.html": "<!doctype html><title>x</title><p>Hi</p>",
      "design/previews/home.html": '<link rel="stylesheet" href="motif.css">',
      "docs/setup.html": "<p>Link motif.css in each page.</p>",
    });
    const r = await runTokens(root, ctx());
    expect((r.data.notes as string[]).join("\n")).toContain("Next: link motif.css in each page's <head>");
    writeFileSync(join(root, "index.html"), '<!doctype html><link rel="stylesheet" href="motif.css"><p>Hi</p>');
    const again = await runTokens(root, ctx());
    expect((again.data.notes as string[]).join("\n")).not.toContain("Next: link motif.css");
  });

  test("a two-variant guide puts the men variant in motif.css and the flat tokens", async () => {
    const root = makeProject({
      "package.json": reactPkg(), "src/main.tsx": "", "src/index.css": '@import "tailwindcss";\n',
      "design/tokens.json": JSON.stringify(twoVariantTokens()),
    });
    const native = makeProject({ ...SWIFTUI, "design/tokens.json": JSON.stringify(twoVariantTokens()) });
    const r = await runTokens(root, ctx());
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(root, "src/styles/motif.css"), "utf8")).toContain(':root[data-variant="men"]');
    await runTokens(native, ctx());
    expect(JSON.parse(readFileSync(join(native, "design/generated/tokens.flat.json"), "utf8")).variants.men["color.surface"].light).toBe("#123456");
    expect(readFileSync(join(native, "design/generated/motif.css"), "utf8")).toContain(':root[data-variant="men"]');
  });

  test("--stack preview carries the variants too", async () => {
    const root = makeProject({ "design/tokens.json": JSON.stringify(twoVariantTokens()) });
    await runTokens(root, { positionals: [], flags: { stack: "preview" } } as any);
    expect(readFileSync(join(root, "design/previews/motif.css"), "utf8")).toContain(':root[data-variant="men"]');
  });
});

describe("runTokens refuses variants and project fonts that motif validate rejects", () => {
  const WOMEN = { id: "women", label: "Women", default: true };
  const MEN = { id: "men", label: "Men" };
  const guide = (change: (ext: any) => void) => {
    const t = twoVariantTokens();
    change(t.$extensions["dev.motif"]);
    return makeProject({ "package.json": reactPkg(), "src/main.tsx": "", "src/index.css": '@import "tailwindcss";\n', "design/tokens.json": JSON.stringify(t) });
  };
  const cases: [string, (ext: any) => void][] = [
    ["an id that would break out of its selector", (ext) => ext.variants.push({ id: 'men"] , body{display:none} :root[x="', label: "X" })],
    ["an id that climbs folders", (ext) => ext.variants.push({ id: "../../../escaped", label: "X" })],
    ["two defaults", (ext) => { ext.variants = [WOMEN, { ...MEN, default: true }]; }],
    ["no default", (ext) => { ext.variants = [{ id: "women", label: "Women" }, MEN]; }],
    ["the same id twice", (ext) => ext.variants.push(MEN)],
    ["a font with no files", (ext) => { ext.fonts = [{ family: "Brand", files: [] }]; }],
  ];
  for (const [name, change] of cases) {
    test(name, async () => {
      const root = guide(change);
      const r = await runTokens(root, ctx());
      expect(r.exitCode).toBe(1);
      expect(r.data.error).toBe("invalid-contract");
      expect(r.text).toContain("so no code was generated");
      expect(r.text).toContain("Fix these first (motif validate shows details).");
      expect(existsSync(join(root, "src/styles/motif.css"))).toBe(false);
    });
  }
});
