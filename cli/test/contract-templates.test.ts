import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runValidate } from "../src/commands/validate";
import { OPTIONAL_ROLES, REQUIRED_ROLES, REQUIRED_SPRINGS } from "../src/contract/roles";
import { templateTokens } from "../src/presets/build";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const CONTRACT = join(import.meta.dir, "../../skill/contract");
const read = (name: string) => readFileSync(join(CONTRACT, name), "utf8").replace(/\r\n/g, "\n");

describe("the design guide templates", () => {
  test("tokens.template.json is the Minimal style's values without its preset tag", () => {
    expect(read("tokens.template.json")).toBe(JSON.stringify(templateTokens(), null, 2) + "\n");
    const motif = (templateTokens().$extensions as Record<string, Record<string, unknown>>)["dev.motif"]!;
    expect(motif.preset).toBeUndefined();
    expect(templateTokens().$description).toBeString();
  });

  test("the two templates together pass motif validate with no problems at all", async () => {
    const root = makeProject({ "DESIGN.md": read("DESIGN.template.md"), "design/tokens.json": read("tokens.template.json") });
    const r = await runValidate(root);
    expect(r.exitCode).toBe(0);
    expect(r.data.summary).toMatchObject({ errors: 0, warnings: 0 });
  });

  test("spec.md names every required role and spring", () => {
    const spec = read("spec.md");
    for (const [group, { names }] of Object.entries(REQUIRED_ROLES)) {
      for (const name of names) expect(spec).toContain(group === "color" ? `\`${name}\`` : name);
    }
    for (const spring of REQUIRED_SPRINGS) expect(spec).toContain(`\`${spring}\``);
  });

  test("spec.md covers the format version and dark values that validate requires", () => {
    const spec = read("spec.md");
    expect(spec).toContain('"motifContract": 1');
    expect(spec).toContain("Every colour role needs a dark value");
  });

  test("the template's change-log line follows spec.md's format", () => {
    expect(read("DESIGN.template.md")).toMatch(/^- \d{4}-\d{2}-\d{2} — .+ — .+ — approved by .+$/m);
  });
});

describe("the optional mono role (backlog)", () => {
  const skill = (rel: string) => readFileSync(join(CONTRACT, "..", rel), "utf8").replace(/\r\n/g, "\n");

  test("spec.md names every optional role, as optional", () => {
    const spec = read("spec.md");
    expect(spec).toContain("### Optional roles");
    for (const [group, { names }] of Object.entries(OPTIONAL_ROLES)) {
      for (const name of names) expect(spec).toContain(`| \`${group}\` | ${name} `);
    }
  });

  test("the craft guide says what it's for, the stack guides how to use it, and the preview kit sets code in it", () => {
    expect(skill("knowledge/visual-craft.md")).toContain("- `mono`:");
    expect(skill("adapters/plain-web/tokens.md")).toContain("`font.mono`");
    expect(skill("adapters/react-web/tokens.md")).toContain("`font-mono`");
    expect(skill("preview-kit/kit.css")).toMatch(/code, kbd, samp, pre \{[^}]*var\(--motif-font-mono-family, ui-monospace, monospace\)/);
  });
});
