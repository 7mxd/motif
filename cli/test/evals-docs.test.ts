import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../../tests/evals/cases";

const REPO = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

describe("the evals' docs", () => {
  test("the README says how to run, resume and read the results, and that it never uses an API key", () => {
    const readme = read("tests/evals/README.md");
    for (const s of ["bun tests/evals/run.ts", "--resume", "--dry-run", "--list", "--keep", "--max-turns", "never an API key", "claude auth status", "tests/evals/results/", "claude purge", "--permission-mode auto", "motif browser install"]) {
      expect(readme).toContain(s);
    }
    for (const c of CASES) expect(readme).toContain(c.id);
  });

  test("the tests README points at it", () => {
    expect(read("tests/README.md")).toContain("evals/README.md");
  });

  test("the decision is recorded and the spec follows it", () => {
    const decision = read("docs/decisions/0003-evals-on-your-plan.md");
    for (const s of ["No API key", "On demand", "auto mode", "claude purge"]) expect(decision).toContain(s);
    const spec = read("docs/specs/2026-10-12-motif-core-design.md");
    expect(spec).toContain("0003-evals-on-your-plan.md");
    expect(spec).not.toContain("Eval runs need an API key stored as a CI secret");
    expect(spec).not.toContain("Nightly, on demand");
  });
});
