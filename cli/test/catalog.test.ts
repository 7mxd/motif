import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { findConfiguredSources, SOURCE_LABELS } from "../src/detect/sources";
import { SOURCES, sourceById } from "../src/sources/catalog";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

describe("the design source catalog", () => {
  test("four sources, each with verified connection details", () => {
    expect(SOURCES.map((s) => s.id)).toEqual(["motion", "refero", "21st", "60fps"]);
    for (const s of SOURCES) {
      expect(s.connect.url).toStartWith("https://");
      expect(s.docs).toStartWith("https://");
      expect(s.tools.length).toBeGreaterThan(0);
      expect(s.connect.auth === "key").toBe(Boolean(s.connect.keyHeader));
    }
    expect(sourceById("21st")!.connect).toMatchObject({ url: "https://21st.dev/api/mcp", auth: "key", keyHeader: "x-api-key" });
    expect(sourceById("motion")!.connect).toMatchObject({ url: "https://mcp.motion.dev", auth: "none" });
    expect(sourceById("nope")).toBeUndefined();
    expect(SOURCE_LABELS["60fps"]).toBe("60fps.design");
  });

  test("the configurations each source's own installer writes are recognised", () => {
    const cwd = tempDir("motif-cat-");
    const home = tempDir("motif-cat-");
    writeFileSync(join(cwd, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "21st": { type: "http", url: "https://21st.dev/api/mcp", headers: { "x-api-key": "${API_KEY_21ST}" } },
        motion: { type: "http", url: "https://mcp.motion.dev" },
        "motion-plus": { type: "http", url: "https://mcp.motion.dev/plus" },
      },
    }));
    writeFileSync(join(home, ".claude.json"), JSON.stringify({
      mcpServers: {
        refero: { type: "http", url: "https://api.refero.design/mcp" },
        library: { type: "http", url: "https://mcp.60fps.design/mcp" },
        github: { command: "gh-mcp" },
      },
    }));
    expect(findConfiguredSources(cwd, home).map((s) => s.id).sort()).toEqual(["21st", "60fps", "motion", "refero"]);
  });
});
