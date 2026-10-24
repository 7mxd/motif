import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BRIEFS = join(import.meta.dir, "../../tests/fixtures/briefs");

describe("the new-app briefs", () => {
  test("there are eight", () => {
    expect(readdirSync(BRIEFS).sort()).toEqual(["bloom.md", "darb.md", "ledgerly.md", "masar.md", "nabta.md", "rihla.md", "sahm.md", "stride.md"]);
  });

  test("each answers what init asks in its first step: three web apps, a Flutter app, a Compose app, an Expo app, a Vue app and a SwiftUI app, the last five in English and Arabic", () => {
    for (const file of readdirSync(BRIEFS)) {
      const text = readFileSync(join(BRIEFS, file), "utf8").replace(/\r\n/g, "\n");
      for (const heading of ["## What it is", "## Who it's for", "## Platform", "## Brand", "## Feel", "## Apps they like", "## First screens"]) {
        expect(text).toContain(heading);
      }
      const platform = text.split("## Platform\n")[1]!.split("\n## ")[0]!;
      if (file === "sahm.md") {
        for (const s of ["Flutter", "English and Arabic", "phone first"]) expect(platform).toContain(s);
      } else if (file === "nabta.md") {
        for (const s of ["Jetpack Compose", "English and Arabic", "phone first"]) expect(platform).toContain(s);
      } else if (file === "rihla.md") {
        for (const s of ["Expo (React Native)", "English and Arabic", "phone first"]) expect(platform).toContain(s);
      } else if (file === "darb.md") {
        for (const s of ["Vue 3", "English and Arabic", "phone first"]) expect(platform).toContain(s);
      } else if (file === "masar.md") {
        // An Xcode project has no command-line starter, so the case starts from one made from Xcode's iOS App template.
        for (const s of ["SwiftUI", "iPhone", "English and Arabic", "phone first", "already made from Xcode's iOS App template"]) expect(platform).toContain(s);
        expect(platform).not.toContain("make the project yourself");
      } else expect(platform).toContain("React web app");
    }
  });

  test("the tests README explains the fixtures and how to build them", () => {
    const readme = readFileSync(join(import.meta.dir, "../../tests/README.md"), "utf8");
    for (const s of ["react-contract-app", "react-seeded-app", "briefs", "assemble.ts", "seeded-issues.json"]) expect(readme).toContain(s);
  });
});
