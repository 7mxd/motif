import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runTokens } from "../src/commands/tokens";
import { FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");
const PKG = JSON.stringify({
  dependencies: { react: "^19", "react-dom": "^19", motion: "^12" },
  devDependencies: { vite: "^6", tailwindcss: "^4.1.0", "@tailwindcss/vite": "^4.1.0" },
});
const APP = `import { MotionConfig } from "motion/react";
export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-blue-500 p-7 text-body">
        <p style={{ color: "#3b82f6" }}>Hi</p>
        {/* motif-ok: partner logo colour */}
        <span style={{ color: "#ff00aa" }} />
      </div>
    </MotionConfig>
  );
}
`;
const CLEAN = 'export const Clean = () => <div className="bg-action-primary p-4 text-body" />;\n';
const project = (files: Record<string, string>) =>
  makeProject({ "package.json": PKG, "src/main.tsx": "", "design/tokens.json": TOKENS, ...files });
const ctx = (...positionals: string[]) => ({ positionals });

describe("runCheck", () => {
  test("reports violations with positions and keeps reasoned exceptions apart", async () => {
    const r = await runCheck(project({ "src/App.tsx": APP }), ctx());
    expect(r.exitCode).toBe(1);
    expect((r.data.violations as any[]).map((h) => [h.rule, h.file, h.line])).toEqual([
      ["tailwind-palette", "src/App.tsx", 5],
      ["off-scale", "src/App.tsx", 5],
      ["raw-color", "src/App.tsx", 6],
    ]);
    expect((r.data.exceptions as any[]).map((h) => [h.rule, h.line, h.reason])).toEqual([["raw-color", 8, "partner logo colour"]]);
    expect(r.text).toContain("✗ 3 design problems in 1 file (1 allowed with a reason):");
    expect(r.text).toContain("src/App.tsx");
    expect(r.text).toContain('Fix these, or ask your agent: "fix the motif check findings".');
  });

  test("a clean app passes", async () => {
    const r = await runCheck(project({ "src/Clean.tsx": CLEAN }), ctx());
    expect(r.exitCode).toBe(0);
    expect(r.text).toStartWith("✓ No design problems found in 2 files.");
  });

  test("paths narrow the scan", async () => {
    const r = await runCheck(project({ "src/App.tsx": APP, "src/Clean.tsx": CLEAN }), ctx("src/Clean.tsx"));
    expect(r.exitCode).toBe(0);
    expect((r.data.summary as any).files).toBe(1);
  });

  test("motif-ok without a reason doesn't count, and says how to fix it", async () => {
    const r = await runCheck(project({ "src/A.tsx": 'export const A = () => <p style={{ color: "#123456" }} />; // motif-ok\n' }), ctx());
    expect(r.exitCode).toBe(1);
    expect((r.data.violations as any[])[0].fix).toContain('needs a reason');
  });

  test("Motion without reduced-motion support is reported", async () => {
    const r = await runCheck(project({ "src/M.tsx": 'import { motion } from "motion/react";\nexport const M = () => <motion.div />;\n' }), ctx());
    expect((r.data.violations as any[]).map((h) => h.rule)).toEqual(["reduced-motion"]);
  });

  test("generated files are skipped, and a hand-edited one is a warning", async () => {
    const root = project({ "src/Clean.tsx": CLEAN });
    await runTokens(root, { positionals: [] });
    const p = join(root, "src/styles/motif.css");
    writeFileSync(p, readFileSync(p, "utf8").replace("#F9FAFB", "#FFFFFF"));
    const r = await runCheck(root, ctx());
    expect(r.exitCode).toBe(0);
    expect((r.data.warnings as any[]).map((w) => [w.rule, w.file])).toEqual([["generated-edited", "src/styles/motif.css"]]);
    expect(r.text).toContain("Warnings:");
  });

  test("only React web apps are checked in this version", async () => {
    const root = makeProject({ "pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n", "design/tokens.json": TOKENS });
    const r = await runCheck(root, ctx());
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Flutter");
  });

  test("no design guide → exit 2", async () => {
    expect((await runCheck(makeProject({ "package.json": PKG }), ctx())).exitCode).toBe(2);
  });

  test("motif check --json works end to end", () => {
    const root = project({ "src/Clean.tsx": CLEAN });
    const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "../src/main.ts"), "check", "--json", "--cwd", root]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout.toString())).toMatchObject({ command: "check", ok: true, summary: { violations: 0 } });
  });
});

describe("runCheck: paths", () => {
  test("absolute paths work like relative ones", async () => {
    const root = project({ "src/App.tsx": APP, "src/Clean.tsx": CLEAN });
    const r = await runCheck(root, ctx(join(root, "src", "App.tsx")));
    expect(r.exitCode).toBe(1);
    expect((r.data.summary as any).files).toBe(1);
  });

  test("a path that doesn't exist is a usage error, not a pass", async () => {
    const r = await runCheck(project({ "src/Clean.tsx": CLEAN }), ctx("src/Clena.tsx"));
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("src/Clena.tsx");
  });

  test("paths with nothing to check are a usage error, not a pass", async () => {
    const r = await runCheck(project({ "src/Clean.tsx": CLEAN, "docs/notes.md": "# hi" }), ctx("docs"));
    expect(r.exitCode).toBe(2);
  });

  test("checking one file still sees the app's MotionConfig and generated stylesheet", async () => {
    const root = project({
      "src/main.tsx": 'import { MotionConfig } from "motion/react";\nexport const Root = () => <MotionConfig reducedMotion="user" />;\n',
      "src/Button.tsx": 'import { motion } from "motion/react";\nexport const B = () => <motion.button className="transition-colors" />;\n',
    });
    await runTokens(root, { positionals: [] });
    const r = await runCheck(root, ctx("src/Button.tsx"));
    expect((r.data.violations as any[]).map((h) => h.rule)).toEqual([]);
  });
});

describe("runCheck: skipped apps", () => {
  test("apps on other stacks are named as skipped", async () => {
    const root = makeProject({
      "design/tokens.json": TOKENS,
      "apps/web/package.json": PKG, "apps/web/src/Clean.tsx": CLEAN,
      "apps/mobile/pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n",
    });
    expect((await runCheck(root, ctx())).text).toContain("apps/mobile (Flutter)");
  });
});

describe("runCheck and design/motif.json (review of batch C1)", () => {
  test("an app the settings list that isn't there is reported, and check doesn't pass quietly without it", async () => {
    const root = project({
      "src/Clean.tsx": CLEAN,
      "design/motif.json": JSON.stringify({ apps: [{ path: ".", stack: "react-web" }, { path: "admin", stack: "react-web" }] }),
    });
    const r = await runCheck(root, ctx());
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain(`✗ design/motif.json lists "admin", but there's no such folder here.`);
    expect((r.data.settings as any[]).map((f) => f.code)).toEqual(["bad-settings"]);
  });
});

describe("runCheck: from the backlog", () => {
  test("in a Tailwind 3 app, Motif's theme classes are flagged: they need Tailwind 4", async () => {
    const v3 = JSON.stringify({ dependencies: { react: "^19", "react-dom": "^19" }, devDependencies: { vite: "^6", tailwindcss: "^3.4.0" } });
    const r = await runCheck(makeProject({ "package.json": v3, "src/main.tsx": "", "design/tokens.json": TOKENS, "src/A.tsx": CLEAN }), ctx());
    const hit = (r.data.violations as any[]).find((h) => h.text === "bg-action-primary");
    expect(hit).toMatchObject({ rule: "tailwind-palette" });
    expect(hit.message).toBe("bg-action-primary is a class of Motif's Tailwind 4 theme: with Tailwind 3 it does nothing.");
    expect(hit.fix).toBe("Use bg-[var(--motif-color-action-primary)], or upgrade to Tailwind 4.");
  });

  test("many problems are grouped by what they are, with the closest role suggested", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `export const A${i} = () => <p className="text-sm p-7">x</p>;`).join("\n");
    const r = await runCheck(project({ "src/Many.tsx": lines }), ctx());
    expect(r.text).toContain("✗ 60 design problems in 1 file, grouped (--json lists each one):");
    expect(r.text).toContain("  30× text-sm  Text size text-sm isn't one of your text roles. Closest: text-label (14px).");
    expect(r.text).toContain("  30× p-7  Spacing p-7 isn't on your spacing scale. Closest: p-6 (24px) or p-8 (32px).");
    expect((r.data.groups as any[])[0]).toMatchObject({ rule: "off-scale", text: "p-7", count: 30, files: 1 });
  });
});
