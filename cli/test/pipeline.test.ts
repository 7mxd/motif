import { afterAll, describe, expect, test } from "bun:test";
import { renameSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runExtract } from "../src/commands/extract";
import { runTokens } from "../src/commands/tokens";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

describe("extract → tokens → check", () => {
  test("an app without a design guide can adopt one, and check then points at the raw values", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { react: "^19", "react-dom": "^19" }, devDependencies: { vite: "^6" } }),
      "src/App.tsx": 'export const App = () => <p style={{ color: "#4b5563", padding: 13 }}>Hi</p>;\n',
      "src/index.css": "body { color: #111827; background: #ffffff; }\n",
    });
    const ctx = { positionals: [] };

    expect((await runExtract(root, ctx)).exitCode).toBe(0);
    renameSync(join(root, "design/tokens.draft.json"), join(root, "design/tokens.json"));

    const tokens = await runTokens(root, ctx);
    expect(tokens.exitCode).toBe(0);
    expect((tokens.data.files as any[]).map((f) => f.path)).toContain("src/styles/motif.css");

    const check = await runCheck(root, ctx);
    expect(check.exitCode).toBe(1);
    expect((check.data.violations as any[]).map((h) => h.rule).sort()).toEqual(["off-scale", "raw-color", "raw-color", "raw-color"]);
  });
});
