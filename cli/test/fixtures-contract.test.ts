import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runValidate } from "../src/commands/validate";

const APP = join(import.meta.dir, "../../tests/fixtures/react-contract-app");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8").replace(/\r\n/g, "\n");

describe("the contract app (Larder)", () => {
  test("its design guide is valid, without a single warning", async () => {
    const r = await runValidate(APP);
    expect(r.exitCode).toBe(0);
    expect(r.data.summary).toMatchObject({ errors: 0, warnings: 0 });
  });

  test("its code follows the design guide: no violations, exceptions or warnings", async () => {
    const r = await runCheck(APP, { positionals: [] });
    expect(r.data.summary).toMatchObject({ violations: 0, exceptions: 0, warnings: 0 });
    expect(r.exitCode).toBe(0);
  });

  test("it's wired the way the React web guide says", () => {
    expect(read("src/app/globals.css").trim()).toBe('@import "tailwindcss";\n@import "../styles/motif.tailwind.css";');
    const layout = read("src/app/layout.tsx");
    for (const s of ['import "@fontsource/dm-sans/400.css";', 'import "@fontsource/dm-sans/500.css";', 'import "@fontsource/fraunces/600.css";', 'import "@fontsource/fraunces/700.css";', "<Providers>", '<html lang="en">']) {
      expect(layout).toContain(s);
    }
    expect(layout).not.toContain("next/font");
    expect(read("src/app/providers.tsx")).toContain('<MotionConfig reducedMotion="user">');
  });

  test("the design guide was made from the Warm style and keeps its history", () => {
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(tokens.primitive.font.display.$value[0]).toBe("Fraunces");
    const guide = read("DESIGN.md");
    expect(guide).toContain("name: Larder");
    expect(guide).toMatch(/^## 10\. Change log\n\n- \d{4}-\d{2}-\d{2} — .+ — .+ — approved by .+$/m);
  });

  test("dependencies, build output and drafts stay out of git", () => {
    const ignore = read(".gitignore");
    for (const s of ["/node_modules", "/.next/"]) expect(ignore).toContain(s);
    expect(read("design/.gitignore")).toContain(".progress.json");
    expect(existsSync(join(APP, "package-lock.json"))).toBe(true);
  });
});
