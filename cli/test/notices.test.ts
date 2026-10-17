import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { FONT_NAMES, noticesText } from "../scripts/notices";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");
const lf = (s: string) => s.replace(/\r\n/g, "\n");

/** The smallest repo noticesText can read: no fonts or libraries, and an axe.min.js that starts with firstLine. */
function tinyRepo(firstLine: string): string {
  const repo = tempDir("motif-notices-");
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  put("cli/vendor/axe-core/axe.min.js", `${firstLine}\n * Copyright (c) Deque Systems, Inc.\n */\n`);
  put("cli/vendor/axe-core/LICENSE", "axe-core licence");
  put("cli/vendor/axe-core/LICENSE-3RD-PARTY.txt", "axe-core's third-party licences");
  put("cli/package.json", JSON.stringify({ dependencies: {} }));
  put("skill/preview-kit/vendor/LICENSE-motion.txt", "Motion licence");
  mkdirSync(join(repo, "skill/preview-kit/fonts"), { recursive: true });
  return repo;
}

describe("THIRD-PARTY-NOTICES.txt", () => {
  test("is up to date with the licence files (run bun run notices after changing them)", () => {
    expect(lf(readFileSync(join(REPO, "THIRD-PARTY-NOTICES.txt"), "utf8"))).toBe(noticesText());
  });

  test("covers axe-core, Motion, Bun and every bundled font, each with its licence", () => {
    const text = noticesText();
    expect(text).toMatch(/axe-core \d+\.\d+\.\d+, in the motif tool/);
    for (const s of ["Mozilla Public License", "Motion", "The MIT License", "Bun", "https://bun.com/docs/project/license", "SIL OPEN FONT LICENSE"]) {
      expect(text).toContain(s);
    }
    const files = readdirSync(join(REPO, "skill/preview-kit/fonts")).filter((f) => /^LICENSE-.+\.txt$/.test(f));
    expect(files).toHaveLength(11);
    for (const f of files) {
      expect(FONT_NAMES[f] ? f : `${f} has no display name in FONT_NAMES`).toBe(f);
      expect(text).toContain(`${FONT_NAMES[f]}, in the Claude Code plugin`);
    }
  });

  test("covers every library compiled into the tool: cli/package.json's dependencies, each with its licence (final review)", () => {
    const text = noticesText();
    const deps = Object.keys(JSON.parse(readFileSync(join(REPO, "cli/package.json"), "utf8")).dependencies);
    expect(deps.length).toBeGreaterThan(0);
    for (const d of deps) {
      const dir = join(REPO, "cli/node_modules", d);
      const version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
      expect(text).toContain(`${d} ${version}, in the motif tool.`);
      const licence = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f))!;
      expect(text).toContain(lf(readFileSync(join(dir, licence), "utf8")).trim().split("\n")[0]!);
    }
  });

  test("names the axe-core version written in the vendored file, so upgrading the file updates the notices (final review)", () => {
    const text = noticesText(tinyRepo("/*! axe v9.8.7"));
    expect(text).toContain("axe-core 9.8.7, in the motif tool");
    expect(text).not.toContain("4.14.0");
    expect(() => noticesText(tinyRepo("/* another file */"))).toThrow('cli/vendor/axe-core/axe.min.js doesn\'t start with "/*! axe v');
  });

  test("says Motion and the fonts are in the tool too, and that Bun links LGPL-2 code (final review)", () => {
    const text = noticesText();
    expect(text).toContain("Motion, in the Claude Code plugin and the motif tool");
    expect(text).toContain("Nunito, in the Claude Code plugin and the motif tool");
    for (const s of ["Bun itself is MIT-licensed", "JavaScriptCore (and WebKit)", "LGPL-2", "https://github.com/oven-sh/webkit"]) expect(text).toContain(s);
    expect(text).not.toMatch(/Bun, in the motif tool[^\n]*MIT License\./);
  });
});
