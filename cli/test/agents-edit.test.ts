import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { addJsonServer, addTomlServer } from "../src/agents/edit";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const dir = () => tempDir("motif-edit-");
const isWin = process.platform === "win32";

describe("adding a server to a JSON settings file", () => {
  test("creates the file and its folder when there's none", () => {
    const p = join(dir(), ".cursor", "mcp.json");
    expect(addJsonServer(p, "mcpServers", "motion", { url: "https://mcp.motion.dev" })).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(p, "utf8"))).toEqual({ mcpServers: { motion: { url: "https://mcp.motion.dev" } } });
  });

  test("keeps every other server, comment and trailing comma, and the line endings (review focus)", () => {
    const p = join(dir(), "mcp.json");
    writeFileSync(p, '{\r\n  // mine\r\n  "servers": {\r\n    "github": { "command": "gh-mcp" },\r\n  },\r\n  "inputs": [],\r\n}\r\n');
    expect(addJsonServer(p, "servers", "refero", { type: "http", url: "https://api.refero.design/mcp" })).toEqual({ ok: true });
    const after = readFileSync(p, "utf8");
    expect(after).toContain("// mine");
    expect(after).toContain('"github": { "command": "gh-mcp" }');
    expect(after.replace(/\r\n/g, "")).not.toContain("\n");
    expect(parse(after, [], { allowTrailingComma: true })).toEqual({
      servers: { github: { command: "gh-mcp" }, refero: { type: "http", url: "https://api.refero.design/mcp" } },
      inputs: [],
    });
  });

  test("leaves a file that isn't valid JSON as it was", () => {
    const p = join(dir(), "mcp.json");
    writeFileSync(p, "{ nope");
    const r = addJsonServer(p, "mcpServers", "motion", { url: "https://mcp.motion.dev" });
    expect(r.ok).toBe(false);
    expect(readFileSync(p, "utf8")).toBe("{ nope");
  });

  test("leaves a file that already has a server of that name as it was", () => {
    const p = join(dir(), "mcp.json");
    const before = '{ "mcpServers": { "21st": { "url": "https://elsewhere.example" } } }';
    writeFileSync(p, before);
    expect(addJsonServer(p, "mcpServers", "21st", { url: "https://21st.dev/api/mcp" }).ok).toBe(false);
    expect(readFileSync(p, "utf8")).toBe(before);
  });

  test.skipIf(isWin)("a new file holding a key is readable by its owner only; an existing file keeps its permissions", () => {
    const p = join(dir(), "mcp.json");
    addJsonServer(p, "mcpServers", "21st", { url: "https://21st.dev/api/mcp", headers: { "x-api-key": "abcd1234" } }, true);
    expect(statSync(p).mode & 0o777).toBe(0o600);
    const q = join(dir(), "mcp.json");
    writeFileSync(q, "{}", { mode: 0o640 });
    addJsonServer(q, "mcpServers", "motion", { url: "https://mcp.motion.dev" });
    expect(statSync(q).mode & 0o777).toBe(0o640);
  });
});

describe("adding a server to Codex's config.toml", () => {
  test("appends the table and keeps everything already there (review focus)", () => {
    const p = join(dir(), "config.toml");
    const before = '# my settings\nmodel = "gpt-5"\n\n[mcp_servers.github]\ncommand = "gh-mcp"\n';
    writeFileSync(p, before);
    expect(addTomlServer(p, "21st", { url: "https://21st.dev/api/mcp", headers: { "x-api-key": "abcd1234" } })).toEqual({ ok: true });
    const after = readFileSync(p, "utf8");
    expect(after.startsWith(before)).toBe(true);
    expect(Bun.TOML.parse(after)).toEqual({
      model: "gpt-5",
      mcp_servers: { github: { command: "gh-mcp" }, "21st": { url: "https://21st.dev/api/mcp", http_headers: { "x-api-key": "abcd1234" } } },
    });
  });

  test("creates the file when there's none", () => {
    const p = join(dir(), ".codex", "config.toml");
    expect(addTomlServer(p, "motion", { url: "https://mcp.motion.dev" })).toEqual({ ok: true });
    expect(readFileSync(p, "utf8")).toBe('[mcp_servers.motion]\nurl = "https://mcp.motion.dev"\n');
  });

  test("leaves a broken file, or one that already has a server of that name, as it was (review focus)", () => {
    const p = join(dir(), "config.toml");
    writeFileSync(p, "[mcp_servers.motion\n");
    expect(addTomlServer(p, "refero", { url: "https://api.refero.design/mcp" }).ok).toBe(false);
    expect(readFileSync(p, "utf8")).toBe("[mcp_servers.motion\n");
    const q = join(dir(), "config.toml");
    writeFileSync(q, '[mcp_servers.motion]\nurl = "elsewhere"\n');
    expect(addTomlServer(q, "motion", { url: "https://mcp.motion.dev" }).ok).toBe(false);
    expect(readFileSync(q, "utf8")).toBe('[mcp_servers.motion]\nurl = "elsewhere"\n');
  });

  test("a file without a final newline still comes out valid", () => {
    const p = join(dir(), "config.toml");
    writeFileSync(p, 'model = "gpt-5"');
    expect(addTomlServer(p, "motion", { url: "https://mcp.motion.dev" })).toEqual({ ok: true });
    expect(Bun.TOML.parse(readFileSync(p, "utf8"))).toEqual({ model: "gpt-5", mcp_servers: { motion: { url: "https://mcp.motion.dev" } } });
  });
});
