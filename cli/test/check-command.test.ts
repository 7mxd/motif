import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runTokens } from "../src/commands/tokens";
import { FIXTURES, hexColor, twoVariantTokens } from "./helpers";
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

  test("paths with nothing to read: the web message is unchanged (no .dart)", async () => {
    const r = await runCheck(project({ "assets/notes.txt": "hi\n" }), ctx("assets"));
    expect(r.exitCode).toBe(2);
    expect(r.text).toBe("None of these paths contain files motif check reads (.css, .ts, .tsx, .js, .jsx, .html, …), or they're ignored: assets.");
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

  test("only React web apps, plain web sites and Flutter apps are checked in this version", async () => {
    const root = makeProject({ "package.json": JSON.stringify({ dependencies: { vue: "^3" } }), "src/App.vue": "", "design/tokens.json": TOKENS });
    const r = await runCheck(root, ctx());
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Vue / Nuxt");
    expect(r.text).toContain("Flutter apps, React Native (Expo) apps, React web apps and plain web sites");
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
      "apps/mobile/lib/main.dart": "void main() {}\n",
      "apps/admin/package.json": JSON.stringify({ dependencies: { vue: "^3" } }), "apps/admin/src/App.vue": "",
    });
    const text = (await runCheck(root, ctx())).text;
    expect(text).toContain("Skipped (not supported yet): apps/admin (Vue / Nuxt).");
    // Flutter apps are checked from 2E on.
    expect(text).not.toContain("apps/mobile (Flutter)");
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

describe("runCheck: the review of batch C2", () => {
  const V3 = JSON.stringify({ dependencies: { react: "^19", "react-dom": "^19" }, devDependencies: { vite: "^6", tailwindcss: "^3.4.0" } });
  const v3Project = (files: Record<string, string>) => makeProject({ "package.json": V3, "src/main.tsx": "", "design/tokens.json": TOKENS, ...files });

  test("grouping keeps different kinds of problem apart, and each line says where to look", async () => {
    const css = Array.from({ length: 10 }, (_, i) => `.a${i} { padding: 13px; border-radius: 13px; font-size: 13px; }`).join("\n");
    const r = await runCheck(project({ "src/a.css": css }), ctx());
    const groups = r.data.groups as any[];
    expect(groups.map((g) => [g.kind, g.text, g.count]).sort()).toEqual([["font-size", "13px", 10], ["radius", "13px", 10], ["space", "13px", 10]]);
    expect(r.text).toContain("At src/a.css:1, src/a.css:2, src/a.css:3 and 7 more.");
  });

  test("past the last group, the line says how many are left and where to see them", async () => {
    const app = `export const A = () => <div className="${Array.from({ length: 35 }, (_, i) => `p-[${101 + i}px]`).join(" ")}" />;\n`;
    const r = await runCheck(project({ "src/A.tsx": app }), ctx());
    expect(r.text).toContain("  1× p-[101px]  ");
    expect(r.text).toContain("At src/A.tsx:1.");
    expect(r.text).toContain("…and 5 more kinds (5 problems): motif check --json lists each one.");
  });

  test("Tailwind 3: names the app's own config defines, and Tailwind 3's own, aren't flagged", async () => {
    const config = 'module.exports = { theme: { extend: { colors: { border: "hsl(var(--border))", background: "hsl(var(--background))" } } } };\n';
    const app = 'export const A = () => <div className="bg-background border-border ring-offset-background bg-surface" />;\n';
    const r = await runCheck(v3Project({ "tailwind.config.js": config, "src/A.tsx": app, "src/index.css": "@tailwind base;\n.x { @apply border-border; }\n" }), ctx());
    const texts = (r.data.violations as any[]).map((h) => `${h.file} ${h.text}`);
    expect(texts).toEqual(["src/A.tsx bg-surface"]);
  });

  test("Tailwind 3: fixes and suggestions use the variables, since the theme classes don't exist there", async () => {
    const app = 'export const A = () => <div className="bg-blue-500 text-sm md:p-7 font-display ease-standard" />;\n';
    const r = await runCheck(v3Project({ "src/A.tsx": app }), ctx());
    const by = (text: string) => (r.data.violations as any[]).find((h) => h.text === text);
    expect(by("bg-blue-500").fix).toContain("bg-[var(--motif-color-");
    expect(by("text-sm").suggestion).toBe("text-[length:var(--motif-font-label-size)] (14px)");
    expect(by("md:p-7").suggestion).toBe("md:p-6 (24px) or md:p-8 (32px)");
    expect(by("font-display")).toMatchObject({ rule: "tailwind-palette", kind: "font-family", value: "display" });
    expect(by("ease-standard")).toMatchObject({ rule: "tailwind-palette", kind: "easing", value: "standard" });
    for (const h of r.data.violations as any[]) expect(h.fix).not.toMatch(/\b(?:bg-action-primary|text-text-secondary|text-body|font-body|ease-standard)\b(?!\])/);
  });

  test("a colour in a variant's block names the variant and its role", async () => {
    const tokens = twoVariantTokens();
    tokens.color["action-primary"].$extensions = { "dev.motif": { ...(tokens.color["action-primary"].$extensions?.["dev.motif"] ?? {}), variants: { men: { value: hexColor("#0E5C4D"), dark: hexColor("#5CC9B3") } } } };
    const css = ':root { --accent: #ff0000 }\n[data-variant="men"] { --accent: #0e5c4d; --card: #777777 }\n[data-variant="men"].dark { --accent: #5cc9b3 }\n';
    const r = await runCheck(project({ "design/tokens.json": JSON.stringify(tokens), "src/index.css": css }), ctx());
    const hit = (value: string) => (r.data.violations as any[]).find((h) => h.value === value);
    expect(hit("#0e5c4d")).toMatchObject({ variant: "men", fix: `This is the Men variant's action-primary: use var(--motif-color-action-primary) and set data-variant="men".` });
    expect(hit("#5cc9b3").fix).toBe(`This is the Men variant's dark action-primary: use var(--motif-color-action-primary) and set data-variant="men".`);
    // No role has that colour in the variant: the usual advice, still tagged.
    expect(hit("#777777")).toMatchObject({ variant: "men" });
    expect(hit("#777777").fix).toContain("Use a theme colour");
    expect(hit("#ff0000").variant).toBeUndefined();
  });
});

describe("runCheck groups (Task 15 wave B, #7)", () => {
  test("a group names each place once, and counts the places it doesn't name", async () => {
    const css = Array.from({ length: 10 }, (_, i) => `.a${i} { padding: 13px 13px 13px 13px; }`).join("\n");
    const r = await runCheck(project({ "src/a.css": css }), ctx());
    expect(r.text).toContain("40× 13px");
    expect(r.text).toContain("At src/a.css:1, src/a.css:2, src/a.css:3 and 7 more.");
    expect((r.data.groups as any[])[0].where).toEqual(["src/a.css:1", "src/a.css:2", "src/a.css:3"]);
  });

  test("a pill's corner (999px) suggests the full role, not the largest finite one", async () => {
    const css = Array.from({ length: 26 }, (_, i) => `.p${i} { border-radius: 999px; }`).join("\n");
    const r = await runCheck(project({ "src/a.css": css }), ctx());
    expect(r.text).toContain("Closest: var(--motif-radius-full) (9999px).");
  });
});

describe("wave B review fixes: the full corner's cut-off (review #5)", () => {
  test("a guide whose full role is under 999 px gets full from its own size up; a 120 px corner keeps the nearest finite role", async () => {
    const tokens = JSON.parse(TOKENS);
    tokens.radius.full.$value.value = 500;
    const css = [
      ...Array.from({ length: 13 }, (_, i) => `.a${i} { border-radius: 600px; }`),
      ...Array.from({ length: 13 }, (_, i) => `.b${i} { border-radius: 120px; }`),
    ].join("\n");
    const r = await runCheck(project({ "design/tokens.json": JSON.stringify(tokens), "src/a.css": css }), ctx());
    const line = (text: string) => r.text.split(/\r?\n/).find((l) => l.startsWith(`  13× ${text} `)) ?? "";
    expect(line("600px")).toContain("Closest: var(--motif-radius-full) (500px).");
    expect(line("120px")).toContain("Closest: var(--motif-radius-lg) (16px).");
  });
});
