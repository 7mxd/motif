import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BRIEFS = join(import.meta.dir, "../../tests/fixtures/briefs");

describe("the new-app briefs", () => {
  test("there are three", () => {
    expect(readdirSync(BRIEFS).sort()).toEqual(["bloom.md", "ledgerly.md", "stride.md"]);
  });

  test("each answers what init asks in its first step, for a web app", () => {
    for (const file of readdirSync(BRIEFS)) {
      const text = readFileSync(join(BRIEFS, file), "utf8").replace(/\r\n/g, "\n");
      for (const heading of ["## What it is", "## Who it's for", "## Platform", "## Brand", "## Feel", "## Apps they like", "## First screens"]) {
        expect(text).toContain(heading);
      }
      expect(text).toContain("React web app");
    }
  });

  test("the tests README explains the fixtures and how to build them", () => {
    const readme = readFileSync(join(import.meta.dir, "../../tests/README.md"), "utf8");
    for (const s of ["react-contract-app", "react-seeded-app", "briefs", "assemble.ts", "seeded-issues.json"]) expect(readme).toContain(s);
  });
});
