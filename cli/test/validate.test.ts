import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runValidate } from "../src/commands/validate";
import { copyFixture, validDesignMd, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

describe("runValidate", () => {
  test("a valid design guide passes, even in a folder with a space", async () => {
    const dir = copyFixture();
    expect(dir).toContain(" ");
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(0);
    expect(r.text).toStartWith("✓ Your design guide is valid");
    expect(r.data.summary).toEqual({ errors: 0, warnings: 0, tokens: expect.any(Number), contrastChecks: 26 });
  });

  test("no design guide → exit 2 with a friendly message", async () => {
    const dir = copyFixture();
    rmSync(join(dir, "DESIGN.md"));
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(2);
    expect(r.data).toEqual({ error: "no-contract", missing: ["DESIGN.md"] });
    expect(r.text).toContain("Start one with /design");
  });

  test("problems → exit 1, listed with forward-slash paths", async () => {
    const dir = copyFixture();
    const p = join(dir, "design", "tokens.json");
    const t = JSON.parse(readFileSync(p, "utf8"));
    t.color.focus.$value = "{primitive.color.gray.300}";
    writeFileSync(p, JSON.stringify(t, null, 2));
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(1);
    const findings = r.data.findings as any[];
    expect(findings.map((f) => f.code)).toEqual(["low-contrast"]);
    expect(findings[0].file).toBe("design/tokens.json");
    expect(r.text).toContain("✗ design/tokens.json:");
  });

  test("invalid JSON still checks DESIGN.md", async () => {
    const dir = copyFixture();
    writeFileSync(join(dir, "design", "tokens.json"), "{ nope");
    writeFileSync(join(dir, "DESIGN.md"), "no header");
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(1);
    const codes = (r.data.findings as any[]).map((f) => f.code);
    expect(codes).toContain("invalid-json");
    expect(codes).toContain("missing-header");
  });

  test("warnings alone don't fail", async () => {
    const dir = copyFixture();
    const p = join(dir, "DESIGN.md");
    writeFileSync(p, readFileSync(p, "utf8").replace(/Fixture App feels calm[^\n]*\n/, ""));
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(0);
    expect((r.data.summary as any).warnings).toBe(1);
    expect(r.text).toContain("⚠ DESIGN.md");
  });

  test("motif validate --json works end to end", () => {
    const dir = copyFixture();
    const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "../src/main.ts"), "validate", "--json", "--cwd", dir]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout.toString())).toMatchObject({ command: "validate", ok: true, exitCode: 0 });
  });
});

describe("runValidate: newer formats are refused", () => {
  test("theme values from a newer Motif → exit 2 with only the update message", async () => {
    const dir = copyFixture();
    const p = join(dir, "design", "tokens.json");
    const t = JSON.parse(readFileSync(p, "utf8"));
    t.$extensions["dev.motif"].motifContract = 2;
    delete t.color.focus;
    writeFileSync(p, JSON.stringify(t, null, 2));
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(2);
    expect((r.data.findings as any[]).map((f) => f.code)).toEqual(["newer-format"]);
    expect(r.text).toContain("Update Motif");
  });

  test("a design guide from a newer Motif → exit 2", async () => {
    const dir = copyFixture();
    const p = join(dir, "DESIGN.md");
    writeFileSync(p, readFileSync(p, "utf8").replace("motifContract: 1", "motifContract: 2"));
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(2);
    expect(r.data.error).toBe("newer-format");
  });
});

const GRAY_3_9 = { colorSpace: "srgb", components: [0.4627, 0.4627, 0.4627], hex: "#767676" };

/** The fixture guide with a Women (default) and a Men variant; Men's dark secondary text is hard to read. */
function variantTokens(): any {
  const t = validTokens();
  t.$extensions["dev.motif"].variants = [{ id: "women", label: "Women", default: true }, { id: "men", label: "Men" }];
  const ext = t.color["text-secondary"].$extensions["dev.motif"];
  ext.variants = { men: { value: "{primitive.color.gray.600}", dark: GRAY_3_9 } };
  return t;
}
const variantsSection = "\n## Variants\nWomen is the default look. Men is for the men's line.\n";

describe("runValidate: variants", () => {
  test("checks readability in every variant, light and dark", async () => {
    const root = makeProject({
      "DESIGN.md": validDesignMd() + variantsSection,
      "design/tokens.json": JSON.stringify(variantTokens(), null, 2),
    });
    const r = await runValidate(root);
    expect(r.exitCode).toBe(1);
    const hit = (r.data.findings as any[]).filter((f) => f.variant === "men");
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0].message).toStartWith("In the Men variant, dark mode:");
    expect((r.data.findings as any[]).every((f) => f.code === "low-contrast")).toBe(true);
    expect((r.data.summary as any).contrastChecks).toBe(13 * 4);
  });

  test("a guide without variants reads exactly as before", async () => {
    const r = await runValidate(copyFixture());
    expect(r.text).toMatch(/^✓ Your design guide is valid — \d+ theme values and 26 readability checks \(light \+ dark\) passed\.$/);
  });

  test("a valid guide with variants says how many", async () => {
    const t = variantTokens();
    t.color["text-secondary"].$extensions["dev.motif"].variants.men.dark = "{primitive.color.gray.400}";
    const root = makeProject({ "DESIGN.md": validDesignMd() + variantsSection, "design/tokens.json": JSON.stringify(t, null, 2) });
    const r = await runValidate(root);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("52 readability checks (light + dark, 2 variants) passed.");
  });

  test("--tokens on a direction file with variants runs the same checks", async () => {
    const root = makeProject({ "dir.json": JSON.stringify(variantTokens(), null, 2) });
    const r = await runValidate(root, { tokens: "dir.json" });
    expect(r.exitCode).toBe(1);
    expect((r.data.findings as any[]).some((f) => f.variant === "men" && f.message.startsWith("In the Men variant, dark mode:"))).toBe(true);
    expect((r.data.summary as any).contrastChecks).toBe(13 * 4);
  });
});
