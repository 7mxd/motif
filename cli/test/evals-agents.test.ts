import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEnv } from "../src/agents/catalog";
import { agentSettings, changedSettings } from "../../tests/evals/agents";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

describe("the agents' settings the evals compare (review of batch F)", () => {
  const env = (home: string): AgentEnv => ({ home, platform: "linux", vars: {}, which: () => null });
  const cursor = (home: string, text: string) => {
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(join(home, ".cursor", "mcp.json"), text);
  };

  test("a file that appears with no servers, or reordered keys, isn't a change", () => {
    const home = tempDir("motif-agents-");
    const before = agentSettings(env(home));
    cursor(home, '{ "mcpServers": {} }');
    expect(changedSettings(before, agentSettings(env(home)))).toEqual([]);
    cursor(home, '{ "mcpServers": { "a": { "url": "https://a", "type": "http" } } }');
    const withA = agentSettings(env(home));
    cursor(home, '{ "theme": "dark", "mcpServers": { "a": { "type": "http", "url": "https://a" } } }');
    expect(changedSettings(withA, agentSettings(env(home)))).toEqual([]);
  });

  test("a server added or removed is named", () => {
    const home = tempDir("motif-agents-");
    cursor(home, '{ "mcpServers": { "a": { "url": "https://a" } } }');
    const before = agentSettings(env(home));
    cursor(home, '{ "mcpServers": { "figma": { "url": "https://figma" } } }');
    expect(changedSettings(before, agentSettings(env(home)))).toEqual(["~/.cursor/mcp.json (added figma; removed a)"]);
  });
});
