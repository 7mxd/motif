import { describe, expect, test } from "bun:test";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clearStateShots, readScreensLine, runsOn, screenMatches, stateOfShot } from "../src/shot/state-screens";
import { tempDir } from "./tmp";

describe("a state's motif-screens line", () => {
  test("is a comma list at the top of the script", () => {
    expect(readScreensLine("// motif-screens: /#/applications/*, /#/matches/*\nconst a = 1;")).toEqual(["/#/applications/*", "/#/matches/*"]);
  });

  test("is read past Dart imports and Kotlin's package line, and blank lines", () => {
    const dart = "import 'package:flutter_test/flutter_test.dart';\n\n// motif-screens: /contact, ContactPage\nFuture<bool> motifState(WidgetTester tester) async => true;\n";
    expect(readScreensLine(dart)).toEqual(["/contact", "ContactPage"]);
    const kotlin = "package dev.motif.states.edit\n\nimport androidx.compose.ui.test.junit4.ComposeContentTestRule\n// motif-screens: EditPreview\nfun motifState(rule: ComposeContentTestRule): Boolean = true\n";
    expect(readScreensLine(kotlin)).toEqual(["EditPreview"]);
    const swift = "import XCTest\n/* the edit sheet */\n// motif-screens: /\n@MainActor func motifState(_ app: MotifHarness) async throws -> Bool { true }\n";
    expect(readScreensLine(swift)).toEqual(["/"]);
  });

  test("is read only before the first line of code", () => {
    expect(readScreensLine("const a = 1;\n// motif-screens: /a\n")).toBeNull();
    expect(readScreensLine("// opens the editor\ndocument.querySelector('#e').click();\n")).toBeNull();
    expect(readScreensLine("")).toBeNull();
  });

  test("with no screens after it is an error that names the line", () => {
    expect(readScreensLine("// motif-screens:\nx();")).toEqual({ error: expect.stringContaining("motif-screens") });
    expect(readScreensLine("// motif-screens: , \nx();")).toEqual({ error: expect.stringContaining("motif-screens") });
  });
});

describe("a screen in the line", () => {
  test("matches the route as requested, with * for one path segment", () => {
    expect(screenMatches("/#/applications/*", "/#/applications/42")).toBe(true);
    expect(screenMatches("/#/applications/*", "/#/applications/42/steps")).toBe(false);
    expect(screenMatches("/#/applications/*", "/#/applications")).toBe(false);
    expect(screenMatches("/settings", "/settings/")).toBe(true);
    expect(screenMatches("/settings", "/settings?tab=a")).toBe(true);
    expect(screenMatches("/", "/")).toBe(true);
    expect(screenMatches("/", "/ar")).toBe(false);
    expect(screenMatches("ContactPage", "ContactPage")).toBe(true);
    expect(screenMatches("ContactPage", "/contact")).toBe(false);
  });

  test("a state with no line runs everywhere; one with a line only on its screens", () => {
    expect(runsOn({}, "/x")).toBe(true);
    expect(runsOn({ screens: ["/a"] }, "/b")).toBe(false);
    expect(runsOn({ screens: ["/a", "/b/*"] }, "/b/7")).toBe(true);
  });
});

describe("final review fixes (1.3)", () => {
  test("a shot's state is read from its file name only, whatever the folders above it are called (Windows paths too)", () => {
    expect(stateOfShot("C:\\Users\\me\\repo@v2.1\\design\\shots\\index.mobile.png")).toBeUndefined();
    expect(stateOfShot("C:\\Users\\me\\repo@v2.1\\design\\shots\\index@edit.mobile.png")).toBe("edit");
    expect(stateOfShot("/home/me/a@b.c/design/shots/b@sheet+partner.mobile.png")).toBe("sheet");
  });

  test("a state's old screenshots of a screen are removed: only that state's, only that screen's", () => {
    const dir = tempDir("motif-state-clear-");
    const files = ["b@sheet.mobile.png", "b@sheet+v.mobile.dark.png", "b@sheets.mobile.png", "b-2@sheet.mobile.png", "b.mobile.png", "index@sheet.mobile.png"];
    for (const f of files) writeFileSync(join(dir, f), "png");
    clearStateShots(dir, "b", ["sheet"]);
    expect(readdirSync(dir).sort()).toEqual(["b-2@sheet.mobile.png", "b.mobile.png", "b@sheets.mobile.png", "index@sheet.mobile.png"]);
    // A folder that isn't there yet has nothing to remove.
    clearStateShots(join(dir, "nope"), "b", ["sheet"]);
  });
});
