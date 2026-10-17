# Motif v0.1.0 Preview Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare Motif's first release so that, once the developer approves each gate, anyone with Claude Code installs Motif with two commands and Motif fetches its own checked tool.

**Architecture:** The release workflow gains a job that zips the Claude Code plugin (built from `skill/` as today) and attaches it to the release next to the five tool binaries, `SHA256SUMS` and a notices file; the release is marked pre-release and carries written notes; a post-release job on Windows, macOS and Linux installs the plugin from the release and runs `doctor` through its bootstrap. A script writes `.claude-plugin/marketplace.json` (an `archive` source pinned by SHA-256) after the release exists. The skill runs its POSIX bootstrap with `sh` so a lost executable flag can't break it.

**Tech Stack:** Bun 1.4.3 (TypeScript, `bun:test`), fflate (zip), GitHub Actions, `gh`, Claude Code's `claude plugin` commands.

**Spec:** `docs/specs/2026-10-17-motif-v0.1.0-release-design.md`

## Global Constraints

- Release assets, exactly: `motif-linux-x64`, `motif-linux-arm64`, `motif-windows-x64.exe`, `motif-darwin-arm64`, `motif-darwin-x64`, `motif-claude-code.zip`, `SHA256SUMS`, `THIRD-PARTY-NOTICES.txt`.
- `SHA256SUMS` covers every `motif-*` asset, the zip included.
- Marketplace and plugin entry are both named `motif`; install id `motif@motif`; the entry's source is `archive` with `url` `https://github.com/7mxd/motif/releases/download/v<version>/motif-claude-code.zip` and a 64-hex `sha256`; the entry sets no `version`.
- Minimum Claude Code for users: 2.1.224 (the first with `archive` sources). Users also need git.
- Releases below 1.0 are published with `--prerelease`; notes come from `docs/releases/<tag>.md`.
- The tag must equal `v` + `skill/VERSION` (today `0.1.0`), and the built plugin's `plugin.json` version must equal `skill/VERSION`.
- On macOS, Linux, Git Bash and WSL the skill runs `sh "<skill folder>/bin/motif" <command>`; Windows keeps `motif.cmd`.
- Nothing is pushed, tagged or published without the developer's approval at each approval point (A, B, C below). The agent never starts an unattended Claude session; only `claude plugin …` commands run.
- Commits use `7mxd <7895735+7mxd@users.noreply.github.com>` and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- From `cli/`: `bun run typecheck`, `bun test --timeout 300000`. Prefix shell commands with `export PATH="$HOME/.bun/bin:$PATH"`.
- Skill text stays agent-neutral (the skill lint in `cli/test/skill-lint.ts` forbids agent tool names in `skill/`).
- Docs are written in plain words, like the existing READMEs.

## Review Focus

1. **The plugin is unpacked without the executable flag** (macOS, Linux): the bootstrap must still run. Pinned by Task 1 (the `sh` form), Task 6 (the check job removes the flag before running), Task 7 (the rehearsal does the same).
2. **The bootstrap inside the zip has Windows line endings**: `sh` would fail on `\r`. Pinned by Task 2 (no `\r` in the zipped bootstrap).
3. **`SHA256SUMS` written in binary mode (`hash *name`), with uppercase hex or Windows line endings**: the marketplace script must still find the zip's checksum. Pinned by Task 3.
4. **A 1.x tag marked pre-release, or a 0.x tag not**: pinned by Task 6 (the `v0.*` rule).
5. **A tag with no release notes**: the release must stop before anything is published. Pinned by Task 6 (the notes check runs before `gh release create`).

---

## File Structure

| File | Responsibility |
|---|---|
| `skill/SKILL.md` (modify, line 20) | How agents run the tool: `sh` form for POSIX shells |
| `cli/scripts/zip-plugin.ts` (create) | Zip a built plugin folder deterministically, with Unix modes; refuse a version mismatch |
| `cli/scripts/marketplace.ts` (create) | Build `marketplace.json` from a release's tag and `SHA256SUMS`; check a marketplace file's shape; CLI writes the file |
| `cli/scripts/notices.ts` (create) | Assemble `THIRD-PARTY-NOTICES.txt` from the licence files in the repo |
| `THIRD-PARTY-NOTICES.txt` (create, generated) | The notices file uploaded with each release |
| `docs/releases/v0.1.0.md` (create) | Release notes, used by the workflow |
| `.github/workflows/release.yml` (modify) | Plugin job, version checks, pre-release + notes + notices, post-release check |
| `cli/package.json` (modify) | `plugin:zip` and `notices` scripts |
| Tests (create): `cli/test/plugin-zip.test.ts`, `cli/test/marketplace.test.ts`, `cli/test/notices.test.ts`, `cli/test/release.test.ts` | One per unit above; `release.test.ts` covers the workflow and the notes |
| `cli/test/skill-modes.test.ts` (modify, line 30) | The `sh` form |

---

### Task 1: Run the POSIX bootstrap with `sh`

**Files:**
- Modify: `skill/SKILL.md:20`
- Modify: `cli/test/skill-modes.test.ts:30`

**Interfaces:**
- Consumes: nothing.
- Produces: the documented POSIX form `sh "<skill folder>/bin/motif" <command>`, which Task 6's check job and Task 7's rehearsal use.

- [ ] **Step 1: Write the failing test**

In `cli/test/skill-modes.test.ts`, replace the first form in the loop and add a check that no POSIX row runs the file directly:

```ts
  test("says how to run the tool from every common shell", () => {
    for (const form of ['sh "<skill folder>/bin/motif" <command>', '& "<skill folder>\\bin\\motif.cmd" <command>', '"<skill folder>\\bin\\motif.cmd" <command>']) {
      expect(skill).toContain(form);
    }
    // Claude Code unpacks the plugin from a zip, which may drop the executable flag: POSIX shells run the bootstrap with sh.
    expect(skill).not.toMatch(/\| `"<skill folder>\/bin\/motif"/);
    // Windows' default script policy blocks running a .ps1 directly; motif.cmd starts it with the policy bypassed.
    expect(skill).not.toContain("motif.ps1");
    for (const s of ["--json", "--png-only", "needs_browser", "motif browser install"]) expect(skill).toContain(s);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd cli && bun test test/skill-modes.test.ts -t "every common shell"`
Expected: FAIL — `Expected to contain: "sh \"<skill folder>/bin/motif\" <command>"`.

- [ ] **Step 3: Change the skill**

In `skill/SKILL.md`, line 20, replace

```
| macOS, Linux, Git Bash, WSL | `"<skill folder>/bin/motif" <command>` |
```

with

```
| macOS, Linux, Git Bash, WSL | `sh "<skill folder>/bin/motif" <command>` |
```

Then check nothing else in `skill/` or `plugin/` shows the old form:

Run: `grep -rn '"<skill folder>/bin/motif"' skill plugin | grep -v 'sh "<skill folder>/bin/motif"'`
Expected: no output.

- [ ] **Step 4: Run the skill tests**

Run: `cd cli && bun test test/skill-modes.test.ts test/skill-content.test.ts test/plugin.test.ts`
Expected: all pass (the lint's `MOTIF_CALL` pattern still finds `motif <command>` after `sh "…/bin/`).

- [ ] **Step 5: Commit**

```bash
git add skill/SKILL.md cli/test/skill-modes.test.ts
git commit -m "fix(skill): run the POSIX bootstrap with sh, so a lost executable flag can't stop it"
```

---

### Task 2: Zip the built plugin

**Files:**
- Create: `cli/scripts/zip-plugin.ts`
- Modify: `cli/package.json` (scripts)
- Test: `cli/test/plugin-zip.test.ts`

**Interfaces:**
- Consumes: `buildPlugin(outDir: string, repo?: string): void` from `cli/scripts/build-plugin.ts`.
- Produces: `export const ZIP_NAME = "motif-claude-code.zip"`; `export function zipPlugin(pluginDir: string, expectedVersion: string): Uint8Array`; `bun run plugin:zip` writes `dist/motif-claude-code.zip` from `dist/claude-code`.

- [ ] **Step 1: Write the failing test**

Create `cli/test/plugin-zip.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { buildPlugin } from "../scripts/build-plugin";
import { ZIP_NAME, zipPlugin } from "../scripts/zip-plugin";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO, "skill/VERSION"), "utf8").trim();

/** Each entry's name and Unix mode, read from the zip's central directory. */
function modes(zip: Uint8Array): Map<string, number> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, number>();
  for (let n = 0; n < count; n++) {
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    out.set(new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength)), view.getUint32(at + 38, true) >>> 16);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

describe("the plugin zip a release carries", () => {
  const dir = join(tempDir("motif-pluginzip-"), "claude-code");
  buildPlugin(dir);
  const zip = zipPlugin(dir, VERSION);
  const files = unzipSync(zip);

  test("is named as the release and the marketplace expect", () => {
    expect(ZIP_NAME).toBe("motif-claude-code.zip");
  });

  test("holds the plugin with its manifest and skills at the top, with forward slashes", () => {
    for (const f of [
      ".claude-plugin/plugin.json", "skills/motif/SKILL.md", "skills/motif/VERSION", "skills/motif/bin/motif", "skills/motif/bin/motif.cmd",
      "skills/design/SKILL.md", "skills/feature/SKILL.md", "skills/init/SKILL.md", "skills/review/SKILL.md",
    ]) expect(Object.keys(files)).toContain(f);
    expect(JSON.parse(new TextDecoder().decode(files[".claude-plugin/plugin.json"]!)).version).toBe(VERSION);
    expect(Object.keys(files).filter((f) => f.includes("\\"))).toEqual([]);
  });

  test("the bootstrap is executable with Unix line endings; other files aren't executable", () => {
    const m = modes(zip);
    expect(m.get("skills/motif/bin/motif")! & 0o111).not.toBe(0);
    expect(m.get("skills/motif/SKILL.md")! & 0o777).toBe(0o644);
    expect(new TextDecoder().decode(files["skills/motif/bin/motif"]!)).not.toContain("\r");
  });

  test("the same build gives the same zip", () => {
    expect(zipPlugin(dir, VERSION)).toEqual(zip);
  });

  test("a build of another version is refused", () => {
    expect(() => zipPlugin(dir, "9.9.9")).toThrow(`The plugin's version is ${VERSION}, not 9.9.9`);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd cli && bun test test/plugin-zip.test.ts`
Expected: FAIL — `Cannot find module '../scripts/zip-plugin'`.

- [ ] **Step 3: Write the script**

Create `cli/scripts/zip-plugin.ts`:

```ts
// Zips the built Claude Code plugin for a release: files in a fixed order with a fixed date, so the same build gives the
// same zip, and Unix modes kept (the bootstrap executable, everything else 644).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { zipSync, type Zippable } from "fflate";

const REPO = resolve(import.meta.dir, "../..");
export const ZIP_NAME = "motif-claude-code.zip";
const FIXED_DATE = new Date("2000-01-01T00:00:00Z");
const EXECUTABLE = new Set(["skills/motif/bin/motif"]);

/** Every file under dir, as forward-slash paths, sorted. */
function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/** The plugin folder as a zip. Refuses a build whose plugin.json version isn't the expected one. */
export function zipPlugin(pluginDir: string, expectedVersion: string): Uint8Array {
  const manifest = JSON.parse(readFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), "utf8"));
  if (manifest.version !== expectedVersion) {
    throw new Error(`The plugin's version is ${manifest.version}, not ${expectedVersion}: rebuild it with "bun run plugin".`);
  }
  const entries: Zippable = {};
  for (const path of files(pluginDir)) {
    const mode = EXECUTABLE.has(path) ? 0o100755 : 0o100644;
    entries[path] = [readFileSync(join(pluginDir, path)), { os: 3, attrs: (mode << 16) >>> 0, mtime: FIXED_DATE }];
  }
  return zipSync(entries, { level: 9 });
}

if (import.meta.main) {
  const pluginDir = resolve(process.argv[2] ?? join(REPO, "dist", "claude-code"));
  const out = resolve(process.argv[3] ?? join(REPO, "dist", ZIP_NAME));
  const version = readFileSync(join(REPO, "skill", "VERSION"), "utf8").trim();
  writeFileSync(out, zipPlugin(pluginDir, version));
  console.log(`Zipped the Claude Code plugin ${version} into ${out}`);
}
```

In `cli/package.json`, add next to `"plugin"`:

```json
    "plugin:zip": "bun scripts/zip-plugin.ts",
```

- [ ] **Step 4: Run the tests and the script**

Run: `cd cli && bun test test/plugin-zip.test.ts && bun run plugin && bun run plugin:zip`
Expected: 5 pass; then `Zipped the Claude Code plugin 0.1.0 into …\dist\motif-claude-code.zip`.

- [ ] **Step 5: Commit**

```bash
git add cli/scripts/zip-plugin.ts cli/package.json cli/test/plugin-zip.test.ts
git commit -m "feat(release): zip the Claude Code plugin the same way every time, keeping the bootstrap executable"
```

---

### Task 3: The marketplace file

**Files:**
- Create: `cli/scripts/marketplace.ts`
- Test: `cli/test/marketplace.test.ts`

**Interfaces:**
- Consumes: `pluginManifest(version: string): Record<string, unknown>` from `cli/scripts/build-plugin.ts`; `ZIP_NAME` from `cli/scripts/zip-plugin.ts`.
- Produces: `export const RELEASES = "https://github.com/7mxd/motif/releases/download"`; `export interface Marketplace`; `export function marketplaceFile(tag: string, sums: string): Marketplace`; `export function marketplaceProblems(file: unknown): string[]`; CLI `bun scripts/marketplace.ts <tag>` writes `.claude-plugin/marketplace.json` at the repo root (used at approval point C).

- [ ] **Step 1: Write the failing test**

Create `cli/test/marketplace.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pluginManifest } from "../scripts/build-plugin";
import { marketplaceFile, marketplaceProblems } from "../scripts/marketplace";

const REPO = join(import.meta.dir, "../..");
const FILE = join(REPO, ".claude-plugin", "marketplace.json");
const ZIP_SUM = "b".repeat(64);
const SUMS = [`${"a".repeat(64)}  motif-linux-x64`, `${ZIP_SUM}  motif-claude-code.zip`, ""].join("\n");

describe("the marketplace file", () => {
  test("points at a release's plugin zip, pinned by the checksum in its SHA256SUMS", () => {
    expect(marketplaceFile("v0.1.0", SUMS)).toEqual({
      name: "motif",
      description: "Motif: design guide tools for AI coding agents.",
      owner: { name: "7mxd", url: "https://github.com/7mxd" },
      plugins: [{
        name: "motif",
        description: (pluginManifest("0.1.0") as { description: string }).description,
        source: { source: "archive", url: "https://github.com/7mxd/motif/releases/download/v0.1.0/motif-claude-code.zip", sha256: ZIP_SUM },
      }],
    });
    expect(marketplaceProblems(marketplaceFile("v0.1.0", SUMS))).toEqual([]);
  });

  test("reads SHA256SUMS written in binary mode, in capitals, or with Windows line endings", () => {
    const sums = `${"A".repeat(64)} *motif-claude-code.zip\r\n`;
    expect(marketplaceFile("v0.1.0", sums).plugins[0]!.source.sha256).toBe("a".repeat(64));
  });

  test("a tag that isn't a release, or sums without the plugin, is a plain error", () => {
    expect(() => marketplaceFile("0.1.0", SUMS)).toThrow('"0.1.0" isn\'t a release tag such as v0.1.0.');
    expect(() => marketplaceFile("v0.1.0", `${"a".repeat(64)}  motif-linux-x64\n`)).toThrow("v0.1.0's SHA256SUMS has no motif-claude-code.zip");
  });

  test("names what's wrong with a marketplace file", () => {
    const good = marketplaceFile("v0.1.0", SUMS);
    const entry = good.plugins[0]!;
    const bad = {
      ...good,
      name: "tools",
      plugins: [{ ...entry, name: "motif-plugin", version: "0.1.0", source: { source: "archive", url: "http://example.com/x.zip", sha256: "abc" } }],
    };
    expect(marketplaceProblems(bad)).toEqual([
      'The marketplace must be named "motif".',
      'The plugin entry must be named "motif", as the plugin itself is.',
      "The plugin entry must not set a version: the zip's own plugin.json gives it.",
      "The plugin's URL must be a release's motif-claude-code.zip, not http://example.com/x.zip.",
      "The plugin's sha256 must be 64 lowercase hex characters.",
    ]);
    expect(marketplaceProblems({ ...good, plugins: [{ ...entry, source: { source: "github", repo: "7mxd/motif" } }] })).toContain(
      "The plugin must come from an archive source: the release's zip.",
    );
  });

  test.skipIf(!existsSync(FILE))("the repository's marketplace file is well formed", () => {
    expect(marketplaceProblems(JSON.parse(readFileSync(FILE, "utf8")))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd cli && bun test test/marketplace.test.ts`
Expected: FAIL — `Cannot find module '../scripts/marketplace'`.

- [ ] **Step 3: Write the script**

Create `cli/scripts/marketplace.ts`:

```ts
// Writes .claude-plugin/marketplace.json for a published release: Motif's plugin as that release's zip, pinned by the
// checksum in its SHA256SUMS. Run it only after the release exists: bun scripts/marketplace.ts v0.1.0
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pluginManifest } from "./build-plugin";
import { ZIP_NAME } from "./zip-plugin";

const REPO = resolve(import.meta.dir, "../..");
export const RELEASES = "https://github.com/7mxd/motif/releases/download";
const TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const NAME = (pluginManifest("0") as { name: string }).name;

export interface Marketplace {
  name: string;
  description: string;
  owner: { name: string; url: string };
  plugins: { name: string; description: string; source: { source: "archive"; url: string; sha256: string } }[];
}

/** The marketplace file for a release, from its tag and the text of its SHA256SUMS. */
export function marketplaceFile(tag: string, sums: string): Marketplace {
  if (!TAG.test(tag)) throw new Error(`"${tag}" isn't a release tag such as v0.1.0.`);
  const line = sums
    .split(/\r?\n/)
    .map((l) => l.trim().match(/^([0-9a-fA-F]{64}) [ *]?(\S+)$/))
    .find((m) => m?.[2] === ZIP_NAME);
  if (!line) throw new Error(`${tag}'s SHA256SUMS has no ${ZIP_NAME}: is it a release that carries the plugin?`);
  const manifest = pluginManifest(tag.slice(1)) as { name: string; description: string };
  return {
    name: "motif",
    description: "Motif: design guide tools for AI coding agents.",
    owner: { name: "7mxd", url: "https://github.com/7mxd" },
    plugins: [{
      name: manifest.name,
      description: manifest.description,
      source: { source: "archive", url: `${RELEASES}/${tag}/${ZIP_NAME}`, sha256: line[1]!.toLowerCase() },
    }],
  };
}

/** What's wrong with a marketplace file, in plain words; empty when it's well formed. */
export function marketplaceProblems(file: unknown): string[] {
  const m = (file ?? {}) as Record<string, any>;
  const problems: string[] = [];
  if (m.name !== "motif") problems.push('The marketplace must be named "motif".');
  if (!m.owner?.name) problems.push("The marketplace must name its owner.");
  const plugins: any[] = Array.isArray(m.plugins) ? m.plugins : [];
  if (plugins.length !== 1) problems.push("The marketplace must list one plugin, Motif.");
  for (const p of plugins) {
    if (p?.name !== NAME) problems.push(`The plugin entry must be named "${NAME}", as the plugin itself is.`);
    if (p && "version" in p) problems.push("The plugin entry must not set a version: the zip's own plugin.json gives it.");
    const s = p?.source ?? {};
    if (s.source !== "archive") {
      problems.push("The plugin must come from an archive source: the release's zip.");
      continue;
    }
    const url = String(s.url ?? "");
    const tag = url.match(/^https:\/\/github\.com\/7mxd\/motif\/releases\/download\/([^/]+)\/motif-claude-code\.zip$/)?.[1];
    if (!tag || !TAG.test(tag)) problems.push(`The plugin's URL must be a release's ${ZIP_NAME}, not ${url || "nothing"}.`);
    if (!/^[0-9a-f]{64}$/.test(String(s.sha256 ?? ""))) problems.push("The plugin's sha256 must be 64 lowercase hex characters.");
  }
  return problems;
}

if (import.meta.main) {
  const tag = process.argv[2] ?? "";
  if (!TAG.test(tag)) {
    console.error(`Usage: bun scripts/marketplace.ts <tag>, such as v0.1.0 (got "${tag}").`);
    process.exit(2);
  }
  const res = await fetch(`${RELEASES}/${tag}/SHA256SUMS`);
  if (!res.ok) {
    console.error(`Couldn't read ${tag}'s SHA256SUMS (HTTP ${res.status}). Is the release published?`);
    process.exit(1);
  }
  const file = marketplaceFile(tag, await res.text());
  const out = join(REPO, ".claude-plugin", "marketplace.json");
  mkdirSync(join(REPO, ".claude-plugin"), { recursive: true });
  writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`Wrote ${out}: Motif ${tag}, sha256 ${file.plugins[0]!.source.sha256}`);
}
```

- [ ] **Step 4: Run the tests**

Run: `cd cli && bun test test/marketplace.test.ts`
Expected: 4 pass, 1 skip (no `.claude-plugin/marketplace.json` yet).

- [ ] **Step 5: Commit**

```bash
git add cli/scripts/marketplace.ts cli/test/marketplace.test.ts
git commit -m "feat(release): write the marketplace file from a published release's checksums"
```

---

### Task 4: Third-party notices

**Files:**
- Create: `cli/scripts/notices.ts`
- Create (generated): `THIRD-PARTY-NOTICES.txt`
- Modify: `cli/package.json` (scripts)
- Test: `cli/test/notices.test.ts`

**Interfaces:**
- Consumes: the licence files `cli/vendor/axe-core/LICENSE`, `cli/vendor/axe-core/LICENSE-3RD-PARTY.txt`, `skill/preview-kit/vendor/LICENSE-motion.txt`, `skill/preview-kit/fonts/LICENSE-*.txt` (11 files).
- Produces: `export function noticesText(repo?: string): string`; `export const FONT_NAMES: Record<string, string>`; `bun run notices` writes `THIRD-PARTY-NOTICES.txt` at the repo root (Task 6 uploads it).

- [ ] **Step 1: Write the failing test**

Create `cli/test/notices.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FONT_NAMES, noticesText } from "../scripts/notices";

const REPO = join(import.meta.dir, "../..");
const lf = (s: string) => s.replace(/\r\n/g, "\n");

describe("THIRD-PARTY-NOTICES.txt", () => {
  test("is up to date with the licence files (run bun run notices after changing them)", () => {
    expect(lf(readFileSync(join(REPO, "THIRD-PARTY-NOTICES.txt"), "utf8"))).toBe(noticesText());
  });

  test("covers axe-core, Motion, Bun and every bundled font, each with its licence", () => {
    const text = noticesText();
    for (const s of ["axe-core 4.14.0", "Mozilla Public License", "Motion", "The MIT License", "Bun", "https://bun.com/docs/project/license", "SIL OPEN FONT LICENSE"]) {
      expect(text).toContain(s);
    }
    const files = readdirSync(join(REPO, "skill/preview-kit/fonts")).filter((f) => /^LICENSE-.+\.txt$/.test(f));
    expect(files).toHaveLength(11);
    for (const f of files) {
      expect(FONT_NAMES[f] ? f : `${f} has no display name in FONT_NAMES`).toBe(f);
      expect(text).toContain(`${FONT_NAMES[f]}, in the Claude Code plugin`);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd cli && bun test test/notices.test.ts`
Expected: FAIL — `Cannot find module '../scripts/notices'`.

- [ ] **Step 3: Write the script**

Create `cli/scripts/notices.ts`:

```ts
// Assembles THIRD-PARTY-NOTICES.txt: the licences of the other works Motif ships. Run: bun run notices
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "../..");
const RULE = "=".repeat(78);
const FONT_DIR = "skill/preview-kit/fonts";

/** Each bundled font's licence file and the font's name. */
export const FONT_NAMES: Record<string, string> = {
  "LICENSE-archivo.txt": "Archivo",
  "LICENSE-dm-sans.txt": "DM Sans",
  "LICENSE-fraunces.txt": "Fraunces",
  "LICENSE-fredoka.txt": "Fredoka",
  "LICENSE-ibm-plex-sans.txt": "IBM Plex Sans",
  "LICENSE-inter.txt": "Inter",
  "LICENSE-nunito.txt": "Nunito",
  "LICENSE-playfair-display.txt": "Playfair Display",
  "LICENSE-source-sans-3.txt": "Source Sans 3",
  "LICENSE-source-serif-4.txt": "Source Serif 4",
  "LICENSE-space-grotesk.txt": "Space Grotesk",
};

const read = (repo: string, path: string) => readFileSync(join(repo, path), "utf8").replace(/\r\n/g, "\n").trimEnd();

export function noticesText(repo: string = REPO): string {
  const fonts = readdirSync(join(repo, FONT_DIR)).filter((f) => /^LICENSE-.+\.txt$/.test(f)).sort();
  const sections: [string, string][] = [
    [
      "axe-core 4.14.0, in the motif tool (the accessibility audit of screenshots). Mozilla Public License 2.0.\nSource: https://github.com/dequelabs/axe-core (Motif's copy: cli/vendor/axe-core/)",
      `${read(repo, "cli/vendor/axe-core/LICENSE")}\n\n${read(repo, "cli/vendor/axe-core/LICENSE-3RD-PARTY.txt")}`,
    ],
    [
      "Motion, in the Claude Code plugin (skills/motif/preview-kit/vendor/motion.js). MIT License.\nSource: https://github.com/motiondivision/motion",
      read(repo, "skill/preview-kit/vendor/LICENSE-motion.txt"),
    ],
    ...fonts.map((f): [string, string] => [
      `${FONT_NAMES[f] ?? f}, in the Claude Code plugin (skills/motif/preview-kit/fonts/). SIL Open Font License 1.1.`,
      read(repo, `${FONT_DIR}/${f}`),
    ]),
    [
      "Bun, in the motif tool: each binary is a Bun single-file executable, which includes the Bun runtime. MIT License.",
      "Bun's licence: https://github.com/oven-sh/bun/blob/main/LICENSE.md\nThe third-party components the runtime includes, and their licences: https://bun.com/docs/project/license",
    ],
  ];
  return [
    "Third-party notices for Motif",
    "",
    "Motif's own code is under the MIT License (see LICENSE). It ships these other works, under their own licences.",
    "",
    ...sections.flatMap(([title, text]) => [RULE, title, RULE, "", text, ""]),
  ].join("\n");
}

if (import.meta.main) {
  const out = join(REPO, "THIRD-PARTY-NOTICES.txt");
  writeFileSync(out, noticesText());
  console.log(`Wrote ${out}`);
}
```

In `cli/package.json`, add:

```json
    "notices": "bun scripts/notices.ts",
```

- [ ] **Step 4: Generate the file and run the tests**

Run: `cd cli && bun run notices && bun test test/notices.test.ts`
Expected: `Wrote …\THIRD-PARTY-NOTICES.txt`; 2 pass. Open the file and check that each section has its licence text.

- [ ] **Step 5: Commit**

```bash
git add cli/scripts/notices.ts cli/package.json cli/test/notices.test.ts THIRD-PARTY-NOTICES.txt
git commit -m "docs(release): third-party notices for what Motif ships, generated from the licence files"
```

---

### Task 5: Release notes

**Files:**
- Create: `docs/releases/v0.1.0.md`
- Test: `cli/test/release.test.ts` (created here; Task 6 adds to it)

**Interfaces:**
- Consumes: `skill/VERSION`.
- Produces: `docs/releases/v<VERSION>.md`, which the workflow passes to `gh release create --notes-file` (Task 6).

- [ ] **Step 1: Write the failing test**

Create `cli/test/release.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO, "skill/VERSION"), "utf8").trim();
const NOTES = join(REPO, "docs/releases", `v${VERSION}.md`);

describe("the release notes", () => {
  test("exist for this version, so tagging it can publish", () => {
    expect(existsSync(NOTES)).toBe(true);
  });

  test("say how to install, what's needed, what's in it and what isn't", () => {
    const notes = readFileSync(NOTES, "utf8");
    for (const s of [
      "/plugin marketplace add 7mxd/motif", "/plugin install motif@motif", "Claude Code 2.1.224", "git", "SHA256SUMS",
      "preview", "React web", "plain web", "## Known limits", "aren't code-signed", "motif-claude-code.zip", "THIRD-PARTY-NOTICES.txt",
    ]) expect(notes).toContain(s);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd cli && bun test test/release.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` with `Received: false` for the notes file.

- [ ] **Step 3: Write the notes**

Create `docs/releases/v0.1.0.md`:

````markdown
# Motif v0.1.0 (preview)

The first release of Motif: design guide tools for AI coding agents. This preview works in **Claude Code**, for **React web** apps and **plain web** sites (HTML, CSS and JavaScript without a framework).

Motif keeps your app's design in a guide your agent follows, `DESIGN.md` and `design/tokens.json`. It shows mockups before code, screenshots your real app after, checks your code against the guide, and reviews the result in plain words.

## Install

In Claude Code:

```
/plugin marketplace add 7mxd/motif
/plugin install motif@motif
```

Then ask for design work ("make this screen look better"), or type `/motif:design`.

You need Claude Code 2.1.224 or later and git. The first time Motif runs, it downloads its tool (about 100 MB) from this release and checks it against `SHA256SUMS`. Screenshots and previews use the Chrome or Edge you have; if you have neither, Motif asks before downloading a private browser (about 120 MB to download, about 300 MB on disk).

Motif runs on your computer. Previews and screenshots stay there, nothing is uploaded, and there's no telemetry.

## What's in it

- `/motif:design`, `/motif:init`, `/feature` and `/motif:review`: start an app, add a feature that matches it, or review and improve what's there.
- The `motif` tool: `doctor`, `validate`, `tokens`, `check`, `extract`, `preview`, `shot` (with `--audit`, `--state` and `--against`), `connect` and `browser`.
- Checked with Motif's agent evals: five features built consistently, reviews that find seeded problems, and three new apps from a brief, all passing.

## Known limits

- Claude Code only. Packages for Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode come in a later release.
- React web and plain web only. Vue, Svelte, Angular, React Native, Flutter, SwiftUI and Jetpack Compose come later.
- The tool binaries aren't code-signed. The plugin downloads and checks them, so they run without a warning; a binary you download by hand may get one from macOS or Windows.
- Windows on ARM runs the x64 tool.

## Files

| File | What it is |
|---|---|
| `motif-claude-code.zip` | The Claude Code plugin, installed through the marketplace |
| `motif-windows-x64.exe`, `motif-darwin-arm64`, `motif-darwin-x64`, `motif-linux-x64`, `motif-linux-arm64` | The `motif` tool, downloaded by the plugin when it's first needed |
| `SHA256SUMS` | Checksums of all of the above |
| `THIRD-PARTY-NOTICES.txt` | The licences of the other works Motif ships |
````

- [ ] **Step 4: Run the test**

Run: `cd cli && bun test test/release.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add docs/releases/v0.1.0.md cli/test/release.test.ts
git commit -m "docs(release): notes for v0.1.0"
```

---

### Task 6: The release workflow

**Files:**
- Modify: `.github/workflows/release.yml` (replace the whole file)
- Test: `cli/test/release.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `bun run plugin`, `bun run plugin:zip` (Task 2); `THIRD-PARTY-NOTICES.txt` (Task 4); `docs/releases/<tag>.md` (Task 5); the `sh` bootstrap form (Task 1).
- Produces: the published release (approval point B) and its post-release check.

- [ ] **Step 1: Write the failing test**

Add to `cli/test/release.test.ts`:

```ts
describe("the release workflow", () => {
  const wf = readFileSync(join(REPO, ".github/workflows/release.yml"), "utf8").replace(/\r\n/g, "\n");
  /** One job's text: from its "  name:" line to the next job's. */
  const section = (name: string) => {
    const start = wf.indexOf(`\n  ${name}:\n`);
    expect(start).toBeGreaterThan(-1);
    const next = wf.slice(start + 1).search(/\n  [a-z][\w-]*:\n/);
    return next === -1 ? wf.slice(start) : wf.slice(start, start + 1 + next);
  };

  test("builds and zips the plugin, with the tag and the plugin's version checked", () => {
    const plugin = section("plugin");
    for (const s of ["bun run plugin", "bun run plugin:zip", "dist/motif-claude-code.zip", 'test "v$(tr -d \' \\r\\n\' < skill/VERSION)" = "$GITHUB_REF_NAME"']) {
      expect(plugin).toContain(s);
    }
  });

  test("publishes a pre-release below 1.0, with written notes and the notices, only after checking the notes exist", () => {
    const publish = section("publish");
    expect(publish).toContain("needs: [build, plugin]");
    expect(publish).toContain('case "$GITHUB_REF_NAME" in v0.*) pre="--prerelease" ;; esac');
    expect(publish).toContain('--notes-file "docs/releases/$GITHUB_REF_NAME.md"');
    expect(publish).not.toContain("--generate-notes");
    expect(publish).toContain("cp THIRD-PARTY-NOTICES.txt dist/");
    expect(publish.indexOf('test -f "docs/releases/$GITHUB_REF_NAME.md"')).toBeGreaterThan(-1);
    expect(publish.indexOf('test -f "docs/releases/$GITHUB_REF_NAME.md"')).toBeLessThan(publish.indexOf("gh release create"));
  });

  test("checks the published release on Windows, macOS and Linux through the plugin's own bootstrap", () => {
    const check = section("check");
    expect(check).toContain("needs: publish");
    for (const os of ["ubuntu-latest", "macos-latest", "windows-latest"]) expect(check).toContain(os);
    for (const s of [
      "gh release download", "--pattern motif-claude-code.zip", "--pattern SHA256SUMS", "sha256sum -c", "shasum -a 256 -c",
      "chmod a-x plugin/skills/motif/bin/motif", "sh plugin/skills/motif/bin/motif --version", "sh plugin/skills/motif/bin/motif doctor --json",
      "motif.cmd --version", "motif.cmd doctor --json", "MOTIF_HOME", "unset MOTIF_BIN",
    ]) expect(check).toContain(s);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd cli && bun test test/release.test.ts`
Expected: FAIL in the three workflow tests (no `plugin` or `check` job yet).

- [ ] **Step 3: Replace the workflow**

Replace `.github/workflows/release.yml` with:

```yaml
name: release

on:
  push:
    tags: ["v*"]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: true
      matrix:
        include:
          - { os: ubuntu-latest, target: bun-linux-x64, asset: motif-linux-x64, smoke: true }
          - { os: ubuntu-latest, target: bun-linux-arm64, asset: motif-linux-arm64, smoke: false }
          - { os: windows-latest, target: bun-windows-x64, asset: motif-windows-x64.exe, smoke: true }
          - { os: macos-latest, target: bun-darwin-arm64, asset: motif-darwin-arm64, smoke: true }
          - { os: macos-latest, target: bun-darwin-x64, asset: motif-darwin-x64, smoke: false }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: cli/.bun-version
      - name: Tag matches skill/VERSION
        if: startsWith(github.ref, 'refs/tags/')
        shell: bash
        run: test "v$(tr -d ' \r\n' < skill/VERSION)" = "$GITHUB_REF_NAME"
      - name: Install
        working-directory: cli
        run: bun install --frozen-lockfile
      - name: Build
        working-directory: cli
        shell: bash
        run: mkdir -p ../dist && bun build --compile --minify --target=${{ matrix.target }} src/main.ts --outfile ../dist/${{ matrix.asset }}
      - name: Ad-hoc sign (macOS)
        if: runner.os == 'macOS'
        run: codesign --force --sign - dist/${{ matrix.asset }}
      - name: Smoke test
        if: matrix.smoke
        shell: bash
        run: test "$(./dist/${{ matrix.asset }} --version)" = "$(tr -d ' \r\n' < skill/VERSION)"
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.asset }}
          path: dist/${{ matrix.asset }}
          if-no-files-found: error

  plugin:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: cli/.bun-version
      - name: Tag matches skill/VERSION
        if: startsWith(github.ref, 'refs/tags/')
        shell: bash
        run: test "v$(tr -d ' \r\n' < skill/VERSION)" = "$GITHUB_REF_NAME"
      - name: Install
        working-directory: cli
        run: bun install --frozen-lockfile
      - name: Build and zip the Claude Code plugin (refuses a plugin.json version other than skill/VERSION)
        working-directory: cli
        run: |
          bun run plugin
          bun run plugin:zip
      - uses: actions/upload-artifact@v4
        with:
          name: motif-claude-code.zip
          path: dist/motif-claude-code.zip
          if-no-files-found: error

  publish:
    needs: [build, plugin]
    if: startsWith(github.ref, 'refs/tags/')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Release notes exist
        run: test -f "docs/releases/$GITHUB_REF_NAME.md"
      - uses: actions/download-artifact@v4
        with:
          path: dist
          merge-multiple: true
      - name: Checksums
        working-directory: dist
        run: sha256sum motif-* > SHA256SUMS && cat SHA256SUMS
      - name: Notices
        run: cp THIRD-PARTY-NOTICES.txt dist/
      - name: Create release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        shell: bash
        run: |
          pre=""
          case "$GITHUB_REF_NAME" in v0.*) pre="--prerelease" ;; esac
          gh release create "$GITHUB_REF_NAME" dist/* --repo "$GITHUB_REPOSITORY" --title "Motif $GITHUB_REF_NAME" --notes-file "docs/releases/$GITHUB_REF_NAME.md" $pre

  check:
    needs: publish
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - name: Download the plugin and the checksums from the release
        shell: bash
        run: gh release download "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" --pattern motif-claude-code.zip --pattern SHA256SUMS --dir release
      - name: The zip matches SHA256SUMS
        shell: bash
        working-directory: release
        run: |
          grep ' motif-claude-code.zip$' SHA256SUMS > zip.sha256
          if command -v sha256sum >/dev/null 2>&1; then sha256sum -c zip.sha256; else shasum -a 256 -c zip.sha256; fi
      - name: Unpack (macOS, Linux)
        if: runner.os != 'Windows'
        shell: bash
        run: |
          unzip -q release/motif-claude-code.zip -d plugin
          # Claude Code may unpack the plugin without the executable flag; the skill runs the bootstrap with sh either way.
          chmod a-x plugin/skills/motif/bin/motif
      - name: Unpack (Windows)
        if: runner.os == 'Windows'
        shell: pwsh
        run: Expand-Archive -Path release/motif-claude-code.zip -DestinationPath plugin
      - name: The plugin's bootstrap fetches the tool from the release and runs it (macOS, Linux)
        if: runner.os != 'Windows'
        shell: bash
        env:
          MOTIF_HOME: ${{ runner.temp }}/motif-home
        run: |
          unset MOTIF_BIN
          test "$(sh plugin/skills/motif/bin/motif --version)" = "${GITHUB_REF_NAME#v}"
          sh plugin/skills/motif/bin/motif doctor --json > doctor.json
          python3 -c 'import json; d = json.load(open("doctor.json")); assert d["command"] == "doctor" and d["ok"], d'
      - name: The plugin's bootstrap fetches the tool from the release and runs it (Windows)
        if: runner.os == 'Windows'
        shell: pwsh
        env:
          MOTIF_HOME: ${{ runner.temp }}\motif-home
        run: |
          Remove-Item Env:MOTIF_BIN -ErrorAction SilentlyContinue
          $version = & .\plugin\skills\motif\bin\motif.cmd --version
          if ($version -ne $env:GITHUB_REF_NAME.Substring(1)) { throw "motif --version printed '$version'" }
          $json = & .\plugin\skills\motif\bin\motif.cmd doctor --json | Out-String
          $doctor = $json | ConvertFrom-Json
          if ($doctor.command -ne 'doctor' -or -not $doctor.ok) { throw "doctor --json printed: $json" }
```

- [ ] **Step 4: Run the tests**

Run: `cd cli && bun test test/release.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml cli/test/release.test.ts
git commit -m "feat(release): ship the Claude Code plugin with each release, as a pre-release below 1.0, and check it on three systems"
```

---

### Task 7: Rehearse the release locally

No new code: this task proves the prepared pieces work together before anything leaves the PC. Record each command's output in the ledger.

**Files:** none changed (scratch files go in the session's scratchpad directory).

**Interfaces:**
- Consumes: everything from Tasks 1–6; `dist/motif.exe` built from this branch.
- Produces: evidence for approval point A.

- [ ] **Step 1: Full suite and typecheck**

Run: `cd cli && bun run typecheck && bun test --timeout 300000`
Expected: typecheck clean; all tests pass (3 skips plus the marketplace file test skipped).

- [ ] **Step 2: Build the tool, the plugin and the zip; validate the plugin**

Run: `cd cli && bun run build && bun run plugin && bun run plugin:zip && claude plugin validate ../dist/claude-code`
Expected: the build writes `dist/motif.exe`; `Zipped the Claude Code plugin 0.1.0 …`; the last line of `validate` reads `✔ Validation passed`.

- [ ] **Step 3: Install the built plugin through a local marketplace, in a throwaway Claude Code configuration**

With `S` the scratchpad directory (bash):

```bash
rm -rf "$S/rehearsal" && mkdir -p "$S/rehearsal/market/.claude-plugin" "$S/rehearsal/config"
cd "$S/rehearsal/market" && python -c "import zipfile; zipfile.ZipFile(r'C:/Users/PC/GitHub/motif/dist/motif-claude-code.zip').extractall('plugins/motif')"
cat > .claude-plugin/marketplace.json <<'JSON'
{ "name": "motif-rehearsal", "owner": { "name": "7mxd" }, "plugins": [ { "name": "motif", "source": "./plugins/motif" } ] }
JSON
export CLAUDE_CONFIG_DIR="$S/rehearsal/config"
claude plugin validate .
claude plugin marketplace add "$S/rehearsal/market"
claude plugin install motif@motif-rehearsal
claude plugin details motif
claude plugin list
```

Expected: `✔ Validation passed`; `Successfully added marketplace: motif-rehearsal`; `Successfully installed plugin: motif@motif-rehearsal`; the component inventory lists five skills (design, feature, init, motif, review). Unpacking with Python's `zipfile` drops the executable flag, as Claude Code may.

Ruling to apply if `claude plugin` ignores `CLAUDE_CONFIG_DIR` (the add lands in the developer's own settings): stop, remove `motif-rehearsal` with `claude plugin marketplace remove motif-rehearsal`, and report before going on.

- [ ] **Step 4: Run the installed plugin's bootstrap without the executable flag**

```bash
P="$S/rehearsal/market/plugins/motif"
MOTIF_BIN="C:/Users/PC/GitHub/motif/dist/motif.exe" sh "$P/skills/motif/bin/motif" --version
MOTIF_BIN="C:/Users/PC/GitHub/motif/dist/motif.exe" sh "$P/skills/motif/bin/motif" doctor --json | python -c "import json,sys; d=json.load(sys.stdin); print(d['command'], d['ok'])"
```

Expected: `0.1.0`, then `doctor True`. (`MOTIF_BIN` stands in for the release, which doesn't exist yet; the post-release check covers the real download.)

- [ ] **Step 5: Confirm the developer's own configuration is untouched, then clean up**

Run (without `CLAUDE_CONFIG_DIR`): `claude plugin marketplace list`
Expected: no `motif-rehearsal`. Then `rm -rf "$S/rehearsal"`.

---

## Approval points (each needs the developer's explicit OK)

### A. Push the prepared `main` and dry-run the release workflow

1. Merge the branch into `main` locally (fast-forward), run the full suite on `main`, push `main`, and wait for CI on all three systems.
2. Run `gh workflow run release.yml --ref main` and wait for it: the `build` and `plugin` jobs pass; `publish` and `check` are skipped (no tag). Download the `motif-claude-code.zip` artifact with `gh run download <run-id> -n motif-claude-code.zip` and confirm it unzips with `.claude-plugin/plugin.json` at the top.

### B. Tag v0.1.0

1. `git tag -a v0.1.0 -m "Motif v0.1.0 (preview)"` on `main`, then `git push origin v0.1.0`.
2. Watch the release workflow: `build`, `plugin`, `publish` and the three `check` jobs pass. Check the release page: marked Pre-release, titled "Motif v0.1.0", notes from `docs/releases/v0.1.0.md`, eight assets.
3. If anything fails after publishing: report it; with the developer's OK, `gh release delete v0.1.0 --yes --cleanup-tag`, fix on `main`, and tag again.

### C. The marketplace commit, the READMEs, and a real install

1. `cd cli && bun scripts/marketplace.ts v0.1.0` writes `.claude-plugin/marketplace.json`.
2. In `README.md`, replace the line starting `> Work in progress.` with:

   ```markdown
   > **Preview (v0.1.0).** Motif works in Claude Code today, for React web apps and plain web sites. Packages for other agents, more stacks, and the first full release come next.
   ```

   and add, before `## The \`motif\` tool`:

   ````markdown
   ## Install

   In Claude Code:

   ```
   /plugin marketplace add 7mxd/motif
   /plugin install motif@motif
   ```

   Then ask for design work ("make this screen look better"), or type `/motif:design`.

   You need Claude Code 2.1.224 or later and git. The first time Motif runs, it downloads its tool (about 100 MB) from the [release](https://github.com/7mxd/motif/releases/tag/v0.1.0) and checks it against the release's checksums. See the [release notes](docs/releases/v0.1.0.md).
   ````

3. In `plugin/claude-code/README.md`, replace the title line through the end of the "Try it" section with:

   ````markdown
   # Motif for Claude Code

   Four short commands that start the Motif skill in Claude Code. The build copies them and the whole `skill/` folder into a plugin; each release attaches it as `motif-claude-code.zip`. (Motif's packages for other agents, in Part 3, come later.)

   ## Install

   ```
   /plugin marketplace add 7mxd/motif
   /plugin install motif@motif
   ```

   You need Claude Code 2.1.224 or later and git.

   ## Develop

   From the repository's `cli` folder, `bun run plugin` replaces `dist/claude-code/` with a fresh build. Run it again after changing anything in `skill/` or here, then type `/reload-plugins` in Claude Code. `bun run plugin:zip` zips it as a release does.

   To try your build, point the skill at a local build of the tool:

   1. In `cli`, run `bun run build`. It writes `dist/motif` (`dist/motif.exe` on Windows).
   2. Start Claude Code in your app's folder with `MOTIF_BIN` set to that file and the plugin loaded:
      - macOS, Linux or Git Bash: `MOTIF_BIN=/path/to/motif/dist/motif claude --plugin-dir /path/to/motif/dist/claude-code`
      - PowerShell: first `$env:MOTIF_BIN = "C:\path\to\motif\dist\motif.exe"`, then `claude --plugin-dir C:\path\to\motif\dist\claude-code`
   ````

4. Add to `cli/test/release.test.ts` a test that `README.md` and `plugin/claude-code/README.md` both contain `/plugin marketplace add 7mxd/motif` and `/plugin install motif@motif`; run the full suite (the marketplace file test now runs too) and `claude plugin validate .` at the repository root.
5. Commit (`docs: install Motif from its marketplace`), push `main`, wait for CI.
6. A real install from GitHub in a throwaway configuration (bash, `S` the scratchpad):

   ```bash
   mkdir -p "$S/install/config" && export CLAUDE_CONFIG_DIR="$S/install/config" CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1
   claude plugin marketplace add 7mxd/motif
   claude plugin install motif@motif
   claude plugin details motif
   ```

   Expected: the marketplace `motif` is added, `motif@motif` installs, and five skills are listed. Then find the installed plugin's folder (`claude plugin list --json` or under `$S/install/config/plugins/`), and run `MOTIF_HOME="$S/install/home" sh "<plugin>/skills/motif/bin/motif" doctor --json` with `MOTIF_BIN` unset: the tool downloads from the release, passes its checksum, and `doctor` returns `"ok": true`. Confirm `claude plugin marketplace list` without `CLAUDE_CONFIG_DIR` doesn't show `motif`, then delete `$S/install`.
