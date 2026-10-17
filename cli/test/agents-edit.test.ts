import { afterAll, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { lstatSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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

  test("keeps a tab-indented file's tabs, also when its servers are empty (final review)", () => {
    const p = join(dir(), "mcp.json");
    writeFileSync(p, '{\n\t"servers": {},\n\t"inputs": []\n}\n');
    expect(addJsonServer(p, "servers", "refero", { type: "http", url: "https://api.refero.design/mcp" })).toEqual({ ok: true });
    const after = readFileSync(p, "utf8");
    expect(after).toContain('\t"inputs": []');
    expect(after.split("\n").filter((l) => /^ +\S/.test(l))).toEqual([]);
    expect(JSON.parse(after)).toEqual({ servers: { refero: { type: "http", url: "https://api.refero.design/mcp" } }, inputs: [] });
  });

  test("gives a 4-space file a 4-space entry (final review)", () => {
    const p = join(dir(), "mcp.json");
    writeFileSync(p, '{\n    "mcpServers": {\n        "a": {\n            "url": "https://a.example"\n        }\n    }\n}\n');
    expect(addJsonServer(p, "mcpServers", "motion", { url: "https://mcp.motion.dev" })).toEqual({ ok: true });
    expect(readFileSync(p, "utf8")).toContain('        "motion": {\n            "url": "https://mcp.motion.dev"\n        }');
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

describe("connect follow-ups (v0.2.0 review minors)", () => {
  const canSymlink = (() => {
    try {
      const d = dir();
      writeFileSync(join(d, "a"), "");
      symlinkSync(join(d, "a"), join(d, "b"), "file");
      return true;
    } catch {
      return false;
    }
  })();

  test("a file whose servers aren't an object is left as it was, with the reason, and nothing throws", () => {
    for (const value of ["null", "[]", '"x"', "3"]) {
      const p = join(dir(), "mcp.json");
      const before = `{\n  "servers": ${value}\n}\n`;
      writeFileSync(p, before);
      const r = addJsonServer(p, "servers", "motion", { type: "http", url: "https://mcp.motion.dev" });
      expect({ value, r }).toEqual({ value, r: { ok: false, reason: `${p}'s "servers" isn't a list of servers, so it wasn't changed` } });
      expect(readFileSync(p, "utf8")).toBe(before);
    }
    const q = join(dir(), "config.toml");
    writeFileSync(q, 'mcp_servers = "x"\n');
    expect(addTomlServer(q, "motion", { url: "https://mcp.motion.dev" })).toEqual({
      ok: false, reason: `${q}'s "mcp_servers" isn't a list of servers, so it wasn't changed`,
    });
    expect(readFileSync(q, "utf8")).toBe('mcp_servers = "x"\n');
  });

  test.skipIf(!canSymlink)("a settings file that is a link (dotfiles) stays a link; the file it points to gets the server", () => {
    const home = dir();
    const dotfiles = join(home, "dotfiles");
    mkdirSync(dotfiles);
    mkdirSync(join(home, ".cursor"));
    const real = join(dotfiles, "mcp.json");
    const link = join(home, ".cursor", "mcp.json");
    writeFileSync(real, '{\n  "mcpServers": {}\n}\n');
    symlinkSync(real, link, "file");
    expect(addJsonServer(link, "mcpServers", "motion", { url: "https://mcp.motion.dev" })).toEqual({ ok: true });
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(real, "utf8"))).toEqual({ mcpServers: { motion: { url: "https://mcp.motion.dev" } } });
    expect([...readdirSync(dotfiles), ...readdirSync(join(home, ".cursor"))].filter((f) => f.endsWith(".tmp"))).toEqual([]);
    const toml = join(dotfiles, "config.toml");
    const tomlLink = join(home, "config.toml");
    writeFileSync(toml, 'model = "gpt-5"\n');
    symlinkSync(toml, tomlLink, "file");
    expect(addTomlServer(tomlLink, "motion", { url: "https://mcp.motion.dev" })).toEqual({ ok: true });
    expect(lstatSync(tomlLink).isSymbolicLink()).toBe(true);
    expect(readFileSync(toml, "utf8")).toContain("[mcp_servers.motion]");
  });

  test("a new file holding a key is written readable by its owner only from the start, not changed to that after", () => {
    const writes = spyOn(fs, "writeFileSync");
    try {
      const p = join(dir(), "mcp.json");
      addJsonServer(p, "mcpServers", "21st", { url: "https://21st.dev/api/mcp", headers: { "x-api-key": "abcd1234" } }, true);
      const q = join(dir(), "config.toml");
      addTomlServer(q, "21st", { url: "https://21st.dev/api/mcp", headers: { "x-api-key": "abcd1234" } }, true);
      const temps = writes.mock.calls.filter((c) => String(c[0]).endsWith(".tmp"));
      expect(temps.map((c) => (c[2] as { mode?: number } | undefined)?.mode)).toEqual([0o600, 0o600]);
    } finally {
      writes.mockRestore();
    }
  });

  test("a comment after the last server stays on that server's line", () => {
    const p = join(dir(), "mcp.json");
    writeFileSync(p, '{\n  "mcpServers": {\n    "a": { "url": "https://a.example" }, // mine\n  }\n}\n');
    expect(addJsonServer(p, "mcpServers", "motion", { url: "https://mcp.motion.dev" })).toEqual({ ok: true });
    expect(readFileSync(p, "utf8")).toContain('    "a": { "url": "https://a.example" }, // mine\n    "motion": {');
    const q = join(dir(), "mcp.json");
    writeFileSync(q, '{\r\n  "mcpServers": {\r\n    "a": { "url": "https://a.example" } /* mine */\r\n  }\r\n}\r\n');
    expect(addJsonServer(q, "mcpServers", "motion", { url: "https://mcp.motion.dev" })).toEqual({ ok: true });
    const after = readFileSync(q, "utf8");
    expect(after).toContain('    "a": { "url": "https://a.example" }, /* mine */\r\n    "motion": {');
    expect(parse(after)).toEqual({ mcpServers: { a: { url: "https://a.example" }, motion: { url: "https://mcp.motion.dev" } } });
  });
});
