import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runExtract } from "../src/commands/extract";
import { loadTokenDocument } from "../src/contract/load";
import { checkRoles } from "../src/contract/roles";
import { validateTokens } from "../src/contract/tokens";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const PKG = JSON.stringify({ dependencies: { react: "^19", "react-dom": "^19" }, devDependencies: { vite: "^6", tailwindcss: "^4.1.0" } });
const APP = `export function App() {
  return (
    <main className="bg-white p-6">
      <h1 className="text-2xl text-gray-900">Hello</h1>
      <p style={{ color: "#4b5563", padding: 13 }}>Body</p>
      <button className="bg-violet-600 text-white rounded-lg px-4 py-2 transition-colors duration-150">Go</button>
    </main>
  );
}
`;
const THEME_CSS = `@theme default {
  --color-white: #fff;
  --color-gray-900: oklch(21% 0.034 264.665);
  --color-violet-600: oklch(54.1% 0.281 293.009);
  --spacing: 0.25rem;
  --radius-lg: 0.5rem;
  --text-2xl: 1.5rem;
}
`;
const project = (extra: Record<string, string> = {}) =>
  makeProject({ "package.json": PKG, "src/App.tsx": APP, "src/index.css": ".x { font-family: 'Inter', sans-serif; }\n", ...extra });
const ctx = { positionals: [] };

describe("runExtract", () => {
  test("writes a valid draft and a report", async () => {
    const root = project({ "node_modules/tailwindcss/theme.css": THEME_CSS });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    const draftText = readFileSync(join(root, "design/tokens.draft.json"), "utf8");
    const { doc } = loadTokenDocument("design/tokens.draft.json", draftText);
    expect(validateTokens(doc!)).toEqual([]);
    expect(checkRoles(doc!)).toEqual([]);
    const report = JSON.parse(readFileSync(join(root, "design/extract-report.json"), "utf8"));
    expect(report.motifExtract).toBe(1);
    expect(report.unresolved).toEqual([]);
    expect(r.data.summary).toMatchObject({ fonts: ["Inter"], unresolved: 0 });
    expect(r.text).toStartWith("✓ Draft theme values written to design/tokens.draft.json");
    expect(r.text).toContain("rename it to design/tokens.json");
  });

  test("without Tailwind installed, its classes are reported as unresolved", async () => {
    const r = await runExtract(project(), ctx);
    expect((r.data.summary as any).unresolved).toBeGreaterThan(0);
    expect((r.data.notes as string[]).join("\n")).toContain("Tailwind isn't installed");
  });

  test("an existing design guide is left alone", async () => {
    const root = project({ "design/tokens.json": "{}" });
    const r = await runExtract(root, ctx);
    expect(readFileSync(join(root, "design/tokens.json"), "utf8")).toBe("{}");
    expect((r.data.notes as string[]).join("\n")).toContain("design/tokens.json");
  });

  test("other stacks aren't supported yet, and nothing is written", async () => {
    const root = makeProject({ "pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n" });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(2);
    expect(existsSync(join(root, "design/tokens.draft.json"))).toBe(false);
    expect(r.text).toContain("Flutter");
  });

  test("white text on buttons doesn't become the main text colour", async () => {
    const root = project({ "node_modules/tailwindcss/theme.css": THEME_CSS });
    await runExtract(root, ctx);
    const report = JSON.parse(readFileSync(join(root, "design/extract-report.json"), "utf8"));
    const textPrimary = report.colors.find((c: any) => c.id === report.roles["color.text-primary"]);
    expect(textPrimary.hex).not.toBe("#FFFFFF");
  });

  test("motif extract --json works end to end", () => {
    const root = project();
    const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "../src/main.ts"), "extract", "--json", "--cwd", root]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout.toString())).toMatchObject({ command: "extract", ok: true, draft: "design/tokens.draft.json" });
  });
});

describe("runExtract: follow-ups", () => {
  test("the next step mentions DESIGN.md, which motif validate needs", async () => {
    expect((await runExtract(project(), ctx)).text).toContain("DESIGN.md");
  });
  test("a previous draft is kept, not silently replaced", async () => {
    const root = project({ "design/tokens.draft.json": '{"edited": true}' });
    const r = await runExtract(root, ctx);
    expect(readFileSync(join(root, "design/tokens.draft.previous.json"), "utf8")).toBe('{"edited": true}');
    expect((r.data.notes as string[]).join("\n")).toContain("tokens.draft.previous.json");
  });
  test("apps on other stacks are named as skipped", async () => {
    const root = makeProject({
      "apps/web/package.json": PKG, "apps/web/src/App.tsx": APP,
      "apps/mobile/pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n",
    });
    expect((await runExtract(root, ctx)).text).toContain("apps/mobile (Flutter)");
  });
});

describe("motif extract and the app's own Tailwind spacing (review of batch C1)", () => {
  test("an @theme --spacing in the app's CSS sets the step of its spacing classes", async () => {
    const root = project({
      "node_modules/tailwindcss/theme.css": THEME_CSS,
      "src/index.css": '@import "tailwindcss";\n@theme {\n  --spacing: 0.5rem;\n}\n',
      "src/App.tsx": 'export const App = () => <div className="p-3 bg-blue-500" />;',
    });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const report = JSON.parse(readFileSync(join(root, "design/extract-report.json"), "utf8"));
    expect(report.spacing.map((s: { px: number }) => s.px)).toEqual([24]);
  });
});

describe("React apps: drafts follow the app's own variables (backlog 85)", () => {
  // Styled through its own Tailwind 4 theme classes, as most real apps are: the colours are only ever variables.
  const CSS = `@import "tailwindcss";
:root { --ink: #111827; --ink-soft: #4b5563; --paper: #ffffff; --card: #f3f4f6; --line: #e5e7eb; --brand: #4338ca; --mint: #7eebc1; }
[data-theme="dark"] { --ink: #f9fafb; --ink-soft: #a1a1aa; --paper: #0b0b0c; --card: #161618; --line: #2a2a2e; --brand: #a5b4fc; }
@theme inline {
  --color-ink: var(--ink); --color-ink-soft: var(--ink-soft); --color-paper: var(--paper); --color-card: var(--card);
  --color-line: var(--line); --color-brand: var(--brand); --color-mint: var(--mint);
}
body { @apply bg-paper text-ink; }
`;
  const row = `<li className="bg-card text-ink border border-line rounded-lg p-4"><span className="text-ink-soft">Meta</span></li>`;
  const APP_VARS = `export function App() {
  return (
    <main className="bg-paper text-ink">
      <ul>${Array.from({ length: 8 }, () => row).join("")}</ul>
      <button className="bg-brand text-paper px-4 py-2 focus-visible:ring-2 focus-visible:ring-mint">Book</button>
      <button className="bg-brand text-paper px-4 py-2">Pay</button>
    </main>
  );
}
`;
  test("its own theme classes count as uses of the variables behind them, light and dark", async () => {
    const root = makeProject({ "package.json": PKG, "src/App.tsx": APP_VARS, "src/index.css": CSS });
    expect((await runExtract(root, ctx)).exitCode).toBe(0);
    const tokens = JSON.parse(readFileSync(join(root, "design/tokens.draft.json"), "utf8"));
    const hex = (role: string, mode: "light" | "dark") => {
      const t = tokens.color[role];
      const alias: string = mode === "dark" ? t.$extensions["dev.motif"].modes.dark : t.$value;
      return tokens.primitive.color[alias.match(/^\{primitive\.color\.(.+)\}$/)![1]!].$value.hex;
    };
    const roles = ["background", "surface", "border", "text-primary", "text-secondary", "action-primary"];
    expect(Object.fromEntries(roles.map((r) => [r, `${hex(r, "light")} ${hex(r, "dark")}`]))).toEqual({
      background: "#FFFFFF #0B0B0C",
      surface: "#F3F4F6 #161618",
      border: "#E5E7EB #2A2A2E",
      "text-primary": "#111827 #F9FAFB",
      "text-secondary": "#4B5563 #A1A1AA",
      "action-primary": "#4338CA #A5B4FC",
    });
  });
});

describe("React apps: dark values through palette variables (backlog 85)", () => {
  test("a role variable set from a palette in light and written out in dark keeps its dark value", async () => {
    const css = `@import "tailwindcss";
:root { --gray-900: #111827; --gray-50: #f9fafb; --ink: var(--gray-900); --paper: var(--gray-50); }
[data-theme="dark"] { --ink: #f5f5f7; --paper: #0b0b0c; }
@theme inline { --color-ink: var(--ink); --color-paper: var(--paper); }
body { @apply bg-paper text-ink; }
`;
    const app = `export const App = () => <main className="bg-paper text-ink">${'<p className="text-ink">x</p>'.repeat(6)}</main>;\n`;
    const root = makeProject({ "package.json": PKG, "src/App.tsx": app, "src/index.css": css });
    expect((await runExtract(root, ctx)).exitCode).toBe(0);
    const tokens = JSON.parse(readFileSync(join(root, "design/tokens.draft.json"), "utf8"));
    const hex = (role: string, mode: "light" | "dark") => {
      const t = tokens.color[role];
      const alias: string = mode === "dark" ? t.$extensions["dev.motif"].modes.dark : t.$value;
      return tokens.primitive.color[alias.match(/^\{primitive\.color\.(.+)\}$/)![1]!].$value.hex;
    };
    expect([hex("text-primary", "light"), hex("text-primary", "dark"), hex("background", "light"), hex("background", "dark")]).toEqual(["#111827", "#F5F5F7", "#F9FAFB", "#0B0B0C"]);
  });
});
