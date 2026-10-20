import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BRIEFS = join(import.meta.dir, "../../tests/fixtures/briefs");

describe("the new-app briefs", () => {
  test("there are five", () => {
    expect(readdirSync(BRIEFS).sort()).toEqual(["bloom.md", "ledgerly.md", "rihla.md", "sahm.md", "stride.md"]);
  });

  test("each answers what init asks in its first step: three web apps, a Flutter app and an Expo app, both in English and Arabic", () => {
    for (const file of readdirSync(BRIEFS)) {
      const text = readFileSync(join(BRIEFS, file), "utf8").replace(/\r\n/g, "\n");
      for (const heading of ["## What it is", "## Who it's for", "## Platform", "## Brand", "## Feel", "## Apps they like", "## First screens"]) {
        expect(text).toContain(heading);
      }
      const platform = text.split("## Platform\n")[1]!.split("\n## ")[0]!;
      if (file === "sahm.md") {
        for (const s of ["Flutter", "English and Arabic", "phone first"]) expect(platform).toContain(s);
      } else if (file === "rihla.md") {
        for (const s of ["Expo (React Native)", "English and Arabic", "phone first"]) expect(platform).toContain(s);
      } else expect(platform).toContain("React web app");
    }
  });

  test("the tests README explains the fixtures and how to build them", () => {
    const readme = readFileSync(join(import.meta.dir, "../../tests/README.md"), "utf8");
    for (const s of ["react-contract-app", "react-seeded-app", "briefs", "assemble.ts", "seeded-issues.json"]) expect(readme).toContain(s);
  });
});
