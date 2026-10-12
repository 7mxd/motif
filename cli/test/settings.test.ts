import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectApps } from "../src/detect/stacks";
import { readIgnorePatterns, readSettingsJson, writeSettings } from "../src/project/settings";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

describe("project settings", () => {
  test("no design/motif.json → null and no ignore patterns", () => {
    const root = makeProject({});
    expect(readSettingsJson(root)).toBeNull();
    expect(readIgnorePatterns(root)).toEqual([]);
  });

  test("reads ignore patterns, skipping anything that isn't a string", () => {
    const root = makeProject({ "design/motif.json": JSON.stringify({ apps: [], ignore: ["**/vendor/**", 3, "legacy/"] }) });
    expect(readIgnorePatterns(root)).toEqual(["**/vendor/**", "legacy/"]);
  });

  test("tolerates a byte-order mark", () => {
    const root = makeProject({ "design/motif.json": "﻿" + JSON.stringify({ apps: [], ignore: ["x/"] }) });
    expect(readIgnorePatterns(root)).toEqual(["x/"]);
  });

  test("writeSettings writes formatted JSON that detectApps reads back, srcDir included", () => {
    const root = makeProject({});
    writeSettings(root, { motifContract: 1, apps: [{ path: "web", stack: "react-web", srcDir: "src" }], ignore: [] });
    expect(readFileSync(join(root, "design", "motif.json"), "utf8")).toEndWith("}\n");
    expect(detectApps(root).apps).toEqual([{ path: "web", stack: "react-web", source: "motif.json", srcDir: "src" }]);
  });
});
