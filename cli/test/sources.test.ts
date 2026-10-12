import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findConfiguredSources } from "../src/detect/sources";

const tmp = () => mkdtempSync(join(tmpdir(), "motif-src-"));

describe("findConfiguredSources", () => {
  test("reads project .mcp.json and ~/.claude.json (global + this project)", () => {
    const cwd = tmp();
    const home = tmp();
    writeFileSync(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: { refero: { type: "http", url: "https://example.com/mcp" } } }));
    writeFileSync(join(home, ".claude.json"), JSON.stringify({
      mcpServers: { "60fps": { type: "http", url: "https://example.com" } },
      projects: { [cwd.replace(/\\/g, "/")]: { mcpServers: { magic: { command: "npx", args: ["-y", "@21st-dev/magic@latest"] } } } },
    }));
    expect(findConfiguredSources(cwd, home).map((s) => s.id).sort()).toEqual(["21st", "60fps", "refero"]);
  });

  test("ignores other projects' servers and unrelated servers", () => {
    const cwd = tmp();
    const home = tmp();
    writeFileSync(join(home, ".claude.json"), JSON.stringify({
      mcpServers: { github: { command: "gh-mcp" } },
      projects: { "/somewhere/else": { mcpServers: { refero: { url: "x" } } } },
    }));
    expect(findConfiguredSources(cwd, home)).toEqual([]);
  });

  test("config files with a byte-order mark are still read", () => {
    const cwd = tmp();
    writeFileSync(join(cwd, ".mcp.json"), "\uFEFF" + JSON.stringify({ mcpServers: { refero: { url: "https://x" } } }));
    expect(findConfiguredSources(cwd, tmp()).map((s) => s.id)).toEqual(["refero"]);
  });

  test("broken config files are ignored", () => {
    const cwd = tmp();
    const home = tmp();
    writeFileSync(join(cwd, ".mcp.json"), "{ nope");
    writeFileSync(join(home, ".claude.json"), "{ nope");
    expect(findConfiguredSources(cwd, home)).toEqual([]);
  });
});
