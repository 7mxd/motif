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
