import { afterAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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

describe("the source notes agents read", () => {
  const NOTES = join(import.meta.dir, "../../skill/sources");
  const FILES: Record<string, string> = { motion: "motion-dev.md", refero: "refero.md", "21st": "21st.md", "60fps": "60fps.md" };
  const note = (file: string) => readFileSync(join(NOTES, file), "utf8");

  for (const s of SOURCES) {
    test(`${FILES[s.id]} names every ${s.label} tool and how to connect it`, () => {
      const text = note(FILES[s.id]!);
      for (const tool of s.tools) expect(text).toContain(`\`${tool}\``);
      expect(text).toContain(`motif connect ${s.id}`);
      for (const section of ["## Is it connected?", "## When it's connected", "## When it isn't", "## Connecting", "## Rules"]) {
        expect(text).toContain(section);
      }
    });
  }

  test("supahero.md is for landing pages only and has nothing to connect", () => {
    const text = note("supahero.md");
    expect(text).toContain("landing");
    expect(text).not.toContain("motif connect");
  });

  test("the folder holds exactly the five notes", () => {
    expect(readdirSync(NOTES).sort()).toEqual(["21st.md", "60fps.md", "motion-dev.md", "refero.md", "supahero.md"]);
  });

  test("the verified facts are on record", () => {
    const record = readFileSync(join(import.meta.dir, "../../docs/decisions/0002-design-sources.md"), "utf8");
    for (const s of SOURCES) expect(record).toContain(s.connect.url);
  });
});

describe("the design source catalog: from the final review", () => {
  test("the retired 21st.dev Magic server doesn't count as connected", () => {
    const cwd = tempDir("motif-cat-");
    const home = tempDir("motif-cat-");
    writeFileSync(join(home, ".claude.json"), JSON.stringify({
      mcpServers: {
        magic: { command: "npx", args: ["-y", "@21st-dev/magic@latest", 'API_KEY="abc"'] },
        "21st": { command: "npx", args: ["-y", "@21st-dev/magic@latest"] },
      },
    }));
    expect(findConfiguredSources(cwd, home)).toEqual([]);
  });
});
