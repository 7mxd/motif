import { afterAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findConfiguredSources, SOURCE_LABELS } from "../src/detect/sources";
import { RETIRED, retiredById, SOURCES, sourceById } from "../src/sources/catalog";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

describe("the design source catalog", () => {
  test("Motion is the one source left, with verified connection details", () => {
    expect(SOURCES.map((s) => s.id)).toEqual(["motion"]);
    for (const s of SOURCES) {
      expect(s.connect.url).toStartWith("https://");
      expect(s.docs).toStartWith("https://");
      expect(s.tools.length).toBeGreaterThan(0);
    }
    expect(sourceById("motion")!.connect).toMatchObject({ url: "https://mcp.motion.dev", auth: "none" });
    expect(sourceById("21st")).toBeUndefined();
    expect(sourceById("nope")).toBeUndefined();
    expect(SOURCE_LABELS.motion).toBe("Motion");
  });

  test("the three sources retired in 2.0 are still recognised by the settings they left behind (2.0)", () => {
    expect(RETIRED.map((r) => r.id)).toEqual(["refero", "21st", "60fps"]);
    const old: Record<string, string> = { refero: "https://api.refero.design/mcp", "21st": "https://21st.dev/api/mcp", "60fps": "https://mcp.60fps.design/mcp" };
    for (const r of RETIRED) expect([r.id, r.configPattern.test(old[r.id]!)]).toEqual([r.id, true]);
    expect(retiredById("21st")!.label).toBe("21st.dev");
    expect(retiredById("refero")!.builtIn).toBe("reference notes in the UX pattern guides");
    expect(retiredById("21st")!.builtIn).toBe("a library of pieces for every stack");
    expect(retiredById("60fps")!.builtIn).toBe("motion recipes for every stack, SwiftUI included");
    expect(retiredById("motion")).toBeUndefined();
  });

  test("the configurations each source's own installer writes are recognised; retired ones no longer count as sources", () => {
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
    expect([...new Set(findConfiguredSources(cwd, home).map((s) => s.id))].sort()).toEqual(["motion"]);
  });
});

describe("the source notes agents read", () => {
  const NOTES = join(import.meta.dir, "../../skill/sources");
  const FILES: Record<string, string> = { motion: "motion-dev.md" };
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

describe("recognising Motion's server (backlog)", () => {
  test("a server named motion that is another product's isn't the Motion source; the servers Motion's own installer writes are", async () => {
    const { sourcesIn } = await import("../src/detect/sources");
    const servers = (def: unknown, name = "motion") => [{ agent: "claude" as const, name, def, where: "~/.claude.json" }];
    expect(sourcesIn(servers({ type: "http", url: "https://api.usemotion.com/mcp" }))).toEqual([]);
    // The servers Motion's own installer (npx motion-ai) writes: motion and motion-plus.
    expect(sourcesIn(servers({ url: "https://mcp.motion.dev/plus" })).map((s) => s.id)).toEqual(["motion"]);
    expect(sourcesIn(servers({ type: "http", url: "https://mcp.motion.dev" }, "docs")).map((s) => s.id)).toEqual(["motion"]);
  });
});
