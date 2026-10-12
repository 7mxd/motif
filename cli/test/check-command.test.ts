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
