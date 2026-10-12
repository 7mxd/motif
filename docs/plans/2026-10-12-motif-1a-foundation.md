# Motif 1A — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cross-platform `motif` single-file binary with `--version`, `doctor` and `validate`, the design-contract engine behind them, auto-downloading bootstrap scripts with checksum verification, and CI/release workflows — plus a recorded decision on how Motif drives the browser.

**Architecture:** TypeScript compiled with `bun build --compile` into one executable per OS. A pure `contract/` library (load → resolve aliases → validate values, roles, contrast, DESIGN.md) is wrapped by thin `commands/`. `detect/` finds apps, stacks, browsers and configured design sources for `doctor`. Shell/PowerShell bootstrap scripts in `skill/bin/` fetch the binary matching `skill/VERSION` from GitHub Releases and verify `SHA256SUMS`.

**Tech Stack:** Bun (runtime, test runner, compiler), TypeScript, `jsonc-parser` (JSON with source positions), `culori` (colour spaces + WCAG contrast), GitHub Actions.

**Spec:** `docs/specs/2026-10-12-motif-core-design.md` (this plan implements §5.4, §6.1–§6.4, §10.1, §10.2 `doctor` + `validate`, §10.3 detection part, §13.1 partially, §14 partially, §15 risks 1–2). Risk 2 was resolved while writing this plan: every value shape below (colour object with `colorSpace`/`components`/`alpha`/`hex`, `{value, unit}` dimensions in `px`/`rem`, durations in `ms`/`s`, `cubicBezier` x-values in [0, 1], typography and shadow fields, `{alias}` syntax, forbidden `.`/`{`/`}` in names) follows the published W3C DTCG Format Module 2025.10 (Final CG Report, 2025-10-28). Plans 1B–1E cover the rest of Part 1:

| Plan | Covers |
|---|---|
| **1A Foundation** (this) | spike, contract engine, `validate`, `doctor`, bootstrap scripts, CI, release |
| 1B React web exact half | `tokens`, `check`, `extract` |
| 1C Previews | preview kit, 8 presets, `preview`, `shot --audit` |
| 1D Skill content | `SKILL.md`, modes, knowledge, sources, React guidance, `connect`, Claude Code plugin |
| 1E Agent evals | fixtures, runners and graders for tests B, C, D; nightly workflow |

## Global Constraints

- One version for everything: `skill/VERSION` (starts at `0.1.0`); release tags are `v<version>`; `motif --version` prints it.
- Exit codes: `0` success, `1` findings/violations present, `2` usage or environment error.
- `--json` prints a single JSON object; default output is plain language.
- User-facing words: `DESIGN.md` is "your design guide"; tokens are "theme values". "Contract"/"tokens" only in `--json` and contributor docs.
- Tokens format: W3C DTCG Format Module 2025.10. Motif data lives under `$extensions["dev.motif"]`. Contract format version `motifContract: 1`.
- Contrast minimums (WCAG 2.2 AA): text 4.5:1; large text 3:1; UI components 3:1 — checked in light and dark.
- Springs are stored as duration `d` (s) + bounce `b`; mass 1; `k = (2π/d)²`; `b ≥ 0: c = 4π(1−b)/d`; `b < 0: c = 4π/(d(1+b))`; `ζ = c / (2√k)`.
- Binary targets: `windows-x64`, `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`. Asset names `motif-<os>-<arch>[.exe]`.
- Bootstrap: no Node.js, no admin rights, no global install, no PATH changes; cache `~/.motif/bin/<version>/`; verify `SHA256SUMS`; abort on mismatch.
- `skill/` stays agent-neutral: no hooks, no `allowed-tools`, no `context: fork`, no agent-specific tool names.
- No telemetry. Nothing is uploaded.
- Licence: MIT.

## Review Focus

1. **Windows line endings and paths with spaces** (`C:\Users\Jane Doe\my app`, CRLF `DESIGN.md`) → validate and doctor work; findings show forward-slash relative paths. Pinned in Task 9 (CRLF) and Task 10 (space in path).
2. **UTF-8 BOM at the start of `tokens.json`** (Notepad and some Windows editors add one) → parses normally, not "invalid JSON". Pinned in Task 3.
3. **Detection inside big or unusual folders** (a `node_modules/react` package, deep Swift trees) → never treats dependencies as apps, never scans without limits. Pinned in Task 11.
4. **Running `motif doctor` outside any project** (home folder, empty folder) → no crash, no full-disk scan, friendly "no app found" message. Pinned in Task 12.
5. **Failed or partial downloads** (404, network drop) → plain message, exit 2, nothing left in the cache that a later run would execute. Pinned in Task 13.

---

## File Structure

```
motif/
├── .gitignore
├── LICENSE                                  MIT
├── README.md                                one-paragraph placeholder until Plan 1D
├── docs/decisions/0001-browser-control.md   spike result (Task 1)
├── skill/
│   ├── VERSION                              "0.1.0"
│   └── bin/
│       ├── motif                            POSIX bootstrap
│       ├── motif.ps1                        Windows bootstrap
│       └── motif.cmd                        cmd shim → motif.ps1 (bypasses execution policy)
├── cli/
│   ├── package.json · bun.lock · tsconfig.json · .bun-version
│   ├── src/
│   │   ├── main.ts                          argument parsing + command dispatch
│   │   ├── version.ts                       VERSION from skill/VERSION (embedded at compile)
│   │   ├── env.d.ts                         module declaration for the VERSION text import
│   │   ├── findings.ts                      Finding type + plain-text formatting
│   │   ├── cli/output.ts                    CommandResult + emit (plain vs --json)
│   │   ├── contract/
│   │   │   ├── types.ts                     TokenType, FlatToken, TokenDocument, MOTIF_EXT
│   │   │   ├── load.ts                      parse tokens.json with line numbers → TokenDocument
│   │   │   ├── resolve.ts                   alias resolution, light/dark mode values
│   │   │   ├── values.ts                    DTCG value checks per $type
│   │   │   ├── tokens.ts                    validateTokens: types, aliases, values (incl. dark)
│   │   │   ├── color.ts                     DTCG colour → culori, contrast ratio with alpha
│   │   │   ├── contrast.ts                  contrast pairs check (light + dark)
│   │   │   ├── roles.ts                     required roles, springs, motion ranges, dark modes, version
│   │   │   ├── spring.ts                    spring physics + Motion output
│   │   │   └── design-md.ts                 DESIGN.md header + sections check
│   │   ├── detect/
│   │   │   ├── stacks.ts                    StackId, detectStack, detectApps
│   │   │   ├── browser.ts                   findBrowser (Chrome/Edge/Chromium)
│   │   │   └── sources.ts                   configured MCP design sources (Claude Code configs)
│   │   └── commands/
│   │       ├── validate.ts                  runValidate
│   │       └── doctor.ts                    runDoctor
│   └── test/
│       ├── helpers.ts
│       ├── fixtures/contract/DESIGN.md
│       ├── fixtures/contract/design/tokens.json
│       └── *.test.ts                        one test file per src module + bootstrap.test.ts
└── .github/workflows/
    ├── ci.yml                               typecheck + tests on Windows, macOS, Linux
    └── release.yml                          5 binaries + SHA256SUMS → GitHub Release
```

---

### Task 1: Spike — browser control from a compiled Bun binary (throwaway)

Resolves spec §15 risk 1. Output is a decision record, not kept code.

**Files:**
- Create (temporary, deleted in Step 7): `spike/browser/cdp-shot.ts`, `spike/browser/pw-shot.ts`
- Create: `docs/decisions/0001-browser-control.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a decision ("playwright-core" or "cdp") that Plan 1C follows.

- [ ] **Step 1: Install Bun (developer machine only; users never need it)**

Windows (PowerShell): `powershell -c "irm bun.sh/install.ps1 | iex"` · macOS/Linux: `curl -fsSL https://bun.sh/install | bash`
Then open a new terminal and run: `bun --version`
Expected: a version number such as `1.x.y`.

- [ ] **Step 2: Write the CDP spike**

Create `spike/browser/cdp-shot.ts`:

```ts
// Throwaway spike: can a `bun build --compile` binary drive the system browser over CDP?
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const candidates = [
  process.env.MOTIF_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((p): p is string => Boolean(p));
const browser = candidates.find((p) => existsSync(p));
if (!browser) throw new Error("No Chrome/Edge/Chromium found");

const profile = mkdtempSync(join(tmpdir(), "motif-spike-"));
const proc = spawn(browser, [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

const wsUrl: string = await new Promise((resolve, reject) => {
  let buf = "";
  proc.stderr!.on("data", (d) => {
    buf += d.toString();
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]!);
  });
  proc.on("exit", (code) => reject(new Error(`browser exited with ${code}`)));
  setTimeout(() => reject(new Error("browser did not start in 15s")), 15000);
});

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let nextId = 1;
const pending = new Map<number, (msg: any) => void>();
const listeners: ((msg: any) => void)[] = [];
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)!(msg); pending.delete(msg.id); }
  else listeners.forEach((f) => f(msg));
});
function send(method: string, params: object = {}, sessionId?: string): Promise<any> {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) =>
    pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result))));
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, sessionId);
const loaded = new Promise((r) => listeners.push((m) => m.method === "Page.loadEventFired" && r(null)));
const html = `<html><body style="margin:0;background:#111;color:#fff;font:24px system-ui"><h1>Motif spike</h1><button style="padding:12px 20px">Tap</button></body></html>`;
await send("Page.navigate", { url: "data:text/html," + encodeURIComponent(html) }, sessionId);
await loaded;
const { result } = await send("Runtime.evaluate", {
  expression: "document.querySelector('button').getBoundingClientRect().height", returnByValue: true,
}, sessionId);
const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
writeFileSync("spike-cdp.png", Buffer.from(data, "base64"));
console.log(JSON.stringify({ ok: true, approach: "cdp", browser, buttonHeight: result.value }));
ws.close();
proc.kill();
```

- [ ] **Step 3: Write the playwright-core spike**

Run: `cd spike/browser && bun init -y && bun add playwright-core`

Create `spike/browser/pw-shot.ts`:

```ts
// Throwaway spike: does playwright-core work inside a `bun build --compile` binary?
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const executablePath = [
  process.env.MOTIF_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p): p is string => Boolean(p) && existsSync(p!));
if (!executablePath) throw new Error("No Chrome/Edge/Chromium found");

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark" });
await page.setContent(`<html><body style="margin:0;background:#111;color:#fff;font:24px system-ui"><h1>Motif spike</h1><button style="padding:12px 20px">Tap</button></body></html>`);
const buttonHeight = await page.evaluate(() => document.querySelector("button")!.getBoundingClientRect().height);
await page.screenshot({ path: "spike-pw.png" });
console.log(JSON.stringify({ ok: true, approach: "playwright-core", browser: executablePath, buttonHeight }));
await browser.close();
```

- [ ] **Step 4: Compile and run both**

Run (from `spike/browser`):
```bash
bun build --compile cdp-shot.ts --outfile out/cdp-shot
bun build --compile pw-shot.ts --outfile out/pw-shot
./out/cdp-shot      # Windows: .\out\cdp-shot.exe
./out/pw-shot       # Windows: .\out\pw-shot.exe
ls -la out
```
Expected for each approach that works: one JSON line with `"ok":true` and `buttonHeight` around 49, plus `spike-cdp.png` / `spike-pw.png` (780×1688). Record for each: compiled? ran? binary size?

- [ ] **Step 5: Look at both PNGs**

Open `spike-cdp.png` and `spike-pw.png`. Expected: dark background, white "Motif spike" heading, a button. A blank image counts as a failure for that approach.

- [ ] **Step 6: Write the decision record**

Create `docs/decisions/0001-browser-control.md`, filling the table with the measured results:

```markdown
# 0001 — How Motif drives the browser

- Date: <today>
- Status: Accepted
- Context: spec §10.3 requires headless Chrome/Edge control from a single compiled binary with no Node.js.

## Results (Windows, <browser used>)

| Approach | Compiles | Runs | PNG correct | Binary size |
|---|---|---|---|---|
| playwright-core | yes/no | yes/no | yes/no | NN MB |
| Minimal CDP client | yes/no | yes/no | yes/no | NN MB |

## Decision rule

Choose playwright-core only if it compiled, ran, produced a correct PNG, and adds at most 15 MB over the CDP binary. Otherwise choose the minimal CDP client.

Chosen: **<playwright-core | cdp>**

## Follow-up

macOS and Linux are verified by Plan 1C's CI integration test for `preview`/`shot`, which runs on all three OSes.
```

- [ ] **Step 7: Delete the spike code and commit the decision**

```bash
rm -rf spike
git add docs/decisions/0001-browser-control.md
git commit -m "docs: record browser-control decision from spike"
```

---

### Task 2: Project scaffold, version and output plumbing

**Files:**
- Create: `.gitignore`, `LICENSE`, `README.md`, `skill/VERSION`
- Create: `cli/package.json` (via `bun init`), `cli/tsconfig.json`, `cli/.bun-version`
- Create: `cli/src/env.d.ts`, `cli/src/version.ts`, `cli/src/findings.ts`, `cli/src/cli/output.ts`, `cli/src/main.ts`
- Test: `cli/test/main.test.ts`, `cli/test/output.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `VERSION: string` from `src/version.ts`
  - `type Severity = "error" | "warning"`; `interface Finding { code: string; severity: Severity; message: string; file: string; line?: number; path?: string }`; `formatFindings(findings: Finding[]): string` from `src/findings.ts`
  - `interface CommandResult { command: string; exitCode: 0 | 1 | 2; text: string; data: Record<string, unknown> }`; `emit(result: CommandResult, json: boolean, out?: (s: string) => void): void` from `src/cli/output.ts`
  - `main(argv: string[]): Promise<number>` from `src/main.ts`, whose `switch (command)` later tasks extend

- [ ] **Step 1: Create root files**

`.gitignore`:
```gitignore
node_modules/
dist/
*.log
.DS_Store
cli/test/.tmp/
```

`LICENSE`: the standard MIT licence text with `Copyright (c) 2026 7mxd`.

`README.md`:
```markdown
# Motif

Design guide tools for AI coding agents: build web and mobile apps with polished UI, UX and motion — and keep them consistent as your app and team grow.

Work in progress. See `docs/specs/2026-10-12-motif-core-design.md`.
```

`skill/VERSION`:
```
0.1.0
```

- [ ] **Step 2: Initialise the CLI package**

Run:
```bash
cd cli
bun init -y
bun add culori jsonc-parser
bun add -d @types/bun @types/culori typescript
bun --version > .bun-version
rm -f index.ts README.md
```
Edit `cli/package.json` so its top-level fields are as below (keep the `dependencies` / `devDependencies` blocks bun wrote):
```json
{
  "name": "motif-cli",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "build": "bun build --compile --minify src/main.ts --outfile ../dist/motif"
  }
}
```

Replace `cli/tsconfig.json` with:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "types": ["bun"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Write the failing tests**

`cli/test/output.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { emit, type CommandResult } from "../src/cli/output";
import { formatFindings } from "../src/findings";

const result: CommandResult = { command: "demo", exitCode: 1, text: "Plain words", data: { count: 2 } };

describe("emit", () => {
  test("prints plain text with a trailing newline", () => {
    let out = "";
    emit(result, false, (s) => (out += s));
    expect(out).toBe("Plain words\n");
  });
  test("prints one JSON object with command, ok, exitCode and data", () => {
    let out = "";
    emit(result, true, (s) => (out += s));
    expect(JSON.parse(out)).toEqual({ command: "demo", ok: false, exitCode: 1, count: 2 });
  });
});

describe("formatFindings", () => {
  test("shows errors and warnings with file:line", () => {
    const text = formatFindings([
      { code: "a", severity: "error", message: "Broken.", file: "design/tokens.json", line: 4 },
      { code: "b", severity: "warning", message: "Odd.", file: "DESIGN.md" },
    ]);
    expect(text).toBe("  ✗ design/tokens.json:4 — Broken.\n  ⚠ DESIGN.md — Odd.");
  });
});
```

`cli/test/main.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MAIN = join(import.meta.dir, "../src/main.ts");
const run = (...args: string[]) => Bun.spawnSync([process.execPath, MAIN, ...args]);
const version = readFileSync(join(import.meta.dir, "../../skill/VERSION"), "utf8").trim();

describe("main", () => {
  test("--version prints skill/VERSION", () => {
    const r = run("--version");
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString().trim()).toBe(version);
  });
  test("help exits 0 and lists commands", () => {
    const r = run("help");
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString()).toContain("Usage: motif <command>");
  });
  test("no command prints help and exits 2", () => {
    expect(run().exitCode).toBe(2);
  });
  test("unknown command exits 2", () => {
    const r = run("fly");
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain('Unknown command "fly"');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd cli && bun test`
Expected: FAIL — modules `../src/cli/output` and `../src/findings` not found; `main.ts` missing.

- [ ] **Step 5: Implement**

`cli/src/env.d.ts`:
```ts
declare module "*VERSION" {
  const text: string;
  export default text;
}
```

`cli/src/version.ts`:
```ts
import VERSION_TEXT from "../../skill/VERSION" with { type: "text" };

export const VERSION = VERSION_TEXT.trim();
```

`cli/src/findings.ts`:
```ts
export type Severity = "error" | "warning";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  file: string;
  line?: number;
  path?: string;
}

export function formatFindings(findings: Finding[]): string {
  return findings
    .map((f) => `  ${f.severity === "error" ? "✗" : "⚠"} ${f.file}${f.line ? `:${f.line}` : ""} — ${f.message}`)
    .join("\n");
}
```

`cli/src/cli/output.ts`:
```ts
export interface CommandResult {
  command: string;
  exitCode: 0 | 1 | 2;
  /** Plain-language output for people. */
  text: string;
  /** Structured output merged into the --json object. */
  data: Record<string, unknown>;
}

export function emit(
  result: CommandResult,
  json: boolean,
  out: (s: string) => void = (s) => void process.stdout.write(s),
): void {
  if (json) {
    out(JSON.stringify({ command: result.command, ok: result.exitCode === 0, exitCode: result.exitCode, ...result.data }) + "\n");
  } else {
    out(result.text.endsWith("\n") ? result.text : result.text + "\n");
  }
}
```

`cli/src/main.ts`:
```ts
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { emit, type CommandResult } from "./cli/output";
import { VERSION } from "./version";

const HELP = `Motif ${VERSION} — design guide tools for coding agents

Usage: motif <command> [--json] [--cwd <folder>]

Commands:
  doctor     Explain what works on this computer and what's optional
  validate   Check your design guide (DESIGN.md + design/tokens.json)

Options:
  --json     Print one JSON object (for agents and CI)
  --cwd      Run in another folder (default: the current folder)
  --version  Print the version
`;

export async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        json: { type: "boolean", default: false },
        cwd: { type: "string" },
        version: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const command = positionals[0];
  if (values.help || command === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (!command) {
    process.stdout.write(HELP);
    return 2;
  }
  const runner = COMMANDS[command];
  if (!runner) {
    process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
    return 2;
  }
  const result = await runner(resolve(values.cwd ?? process.cwd()));
  emit(result, values.json ?? false);
  return result.exitCode;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
```

Add the command table just above `export async function main` (empty for now; Tasks 10 and 12 add `validate` and `doctor`):

```ts
type Runner = (cwd: string) => Promise<CommandResult>;

const COMMANDS: Record<string, Runner> = {};
```

- [ ] **Step 6: Run tests and typecheck**

Run: `cd cli && bun test && bun run typecheck`
Expected: all tests PASS; typecheck prints no errors.

- [ ] **Step 7: Build the binary and smoke-test it**

Run: `cd cli && bun run build && ../dist/motif --version` (Windows: `..\dist\motif.exe --version`)
Expected: `0.1.0`

- [ ] **Step 8: Commit**

```bash
git add .gitignore LICENSE README.md skill/VERSION cli
git commit -m "feat(cli): scaffold motif CLI with version, help and output plumbing"
```

---

### Task 3: Load `tokens.json` with line numbers + the valid sample design guide

**Files:**
- Create: `cli/src/contract/types.ts`, `cli/src/contract/load.ts`
- Create: `cli/test/fixtures/contract/design/tokens.json`, `cli/test/fixtures/contract/DESIGN.md`, `cli/test/helpers.ts`
- Test: `cli/test/load.test.ts`

**Interfaces:**
- Consumes: `Finding` from `src/findings.ts` (Task 2).
- Produces (from `src/contract/types.ts`):
  - `const MOTIF_EXT = "dev.motif"`
  - `const KNOWN_TYPES: readonly TokenType[]`
  - `type TokenType = "color" | "dimension" | "fontFamily" | "fontWeight" | "duration" | "cubicBezier" | "number" | "strokeStyle" | "border" | "transition" | "shadow" | "gradient" | "typography"`
  - `interface FlatToken { path: string; type: string | null; value: unknown; extensions: Record<string, unknown> | undefined; line: number }`
  - `interface TokenDocument { file: string; tokens: Map<string, FlatToken>; rootExtensions: Record<string, unknown> | undefined }`
- Produces (from `src/contract/load.ts`): `loadTokenDocument(file: string, rawText: string): { doc: TokenDocument | null; findings: Finding[] }`, `lineAt(text: string, offset: number): number`
- Produces (from `test/helpers.ts`): `FIXTURES: string`, `validTokens(): any` (fresh parsed copy of the fixture), `docFrom(obj: unknown): TokenDocument`, `validDesignMd(): string`

`FlatToken.type` is `string | null` (not `TokenType`) because the file may contain an unknown type name; Task 5 reports it.

- [ ] **Step 1: Create the valid sample design guide (fixture)**

This fixture is a complete, valid Motif design guide. Every later task tests against it, so it must pass all checks: all required roles, light + dark values, and every contrast pair ≥ its minimum (lowest pairs: light `success`/`warning` ≈ 5.0:1).

`cli/test/fixtures/contract/design/tokens.json`:
```json
{
  "$extensions": {
    "dev.motif": {
      "motifContract": 1,
      "pairs": [
        { "fg": "color.text-primary", "bg": "color.background", "kind": "text" },
        { "fg": "color.text-primary", "bg": "color.surface", "kind": "text" },
        { "fg": "color.text-primary", "bg": "color.surface-raised", "kind": "text" },
        { "fg": "color.text-secondary", "bg": "color.background", "kind": "text" },
        { "fg": "color.text-secondary", "bg": "color.surface", "kind": "text" },
        { "fg": "color.text-secondary", "bg": "color.surface-raised", "kind": "text" },
        { "fg": "color.on-action-primary", "bg": "color.action-primary", "kind": "text" },
        { "fg": "color.on-action-secondary", "bg": "color.action-secondary", "kind": "text" },
        { "fg": "color.on-success", "bg": "color.success", "kind": "text" },
        { "fg": "color.on-warning", "bg": "color.warning", "kind": "text" },
        { "fg": "color.on-danger", "bg": "color.danger", "kind": "text" },
        { "fg": "color.on-info", "bg": "color.info", "kind": "text" },
        { "fg": "color.focus", "bg": "color.background", "kind": "ui" }
      ]
    }
  },
  "primitive": {
    "color": {
      "$type": "color",
      "white": { "$value": { "colorSpace": "srgb", "components": [1, 1, 1], "hex": "#FFFFFF" } },
      "gray": {
        "50": { "$value": { "colorSpace": "srgb", "components": [0.9765, 0.9804, 0.9843], "hex": "#F9FAFB" } },
        "200": { "$value": { "colorSpace": "srgb", "components": [0.898, 0.9059, 0.9216], "hex": "#E5E7EB" } },
        "300": { "$value": { "colorSpace": "srgb", "components": [0.8196, 0.8353, 0.8588], "hex": "#D1D5DB" } },
        "400": { "$value": { "colorSpace": "srgb", "components": [0.6118, 0.6392, 0.6863], "hex": "#9CA3AF" } },
        "600": { "$value": { "colorSpace": "srgb", "components": [0.2941, 0.3333, 0.3882], "hex": "#4B5563" } },
        "700": { "$value": { "colorSpace": "srgb", "components": [0.2157, 0.2549, 0.3176], "hex": "#374151" } },
        "800": { "$value": { "colorSpace": "srgb", "components": [0.1216, 0.1608, 0.2157], "hex": "#1F2937" } },
        "900": { "$value": { "colorSpace": "srgb", "components": [0.0667, 0.0941, 0.1529], "hex": "#111827" } },
        "950": { "$value": { "colorSpace": "srgb", "components": [0.0118, 0.0275, 0.0706], "hex": "#030712" } }
      },
      "indigo": {
        "400": { "$value": { "colorSpace": "srgb", "components": [0.5059, 0.549, 0.9725], "hex": "#818CF8" } },
        "700": { "$value": { "colorSpace": "srgb", "components": [0.2627, 0.2196, 0.7922], "hex": "#4338CA" } }
      },
      "green": {
        "400": { "$value": { "colorSpace": "srgb", "components": [0.2902, 0.8706, 0.502], "hex": "#4ADE80" } },
        "700": { "$value": { "colorSpace": "srgb", "components": [0.0824, 0.502, 0.2392], "hex": "#15803D" } }
      },
      "amber": {
        "400": { "$value": { "colorSpace": "srgb", "components": [0.9843, 0.749, 0.1412], "hex": "#FBBF24" } },
        "700": { "$value": { "colorSpace": "srgb", "components": [0.7059, 0.3255, 0.0353], "hex": "#B45309" } }
      },
      "red": {
        "400": { "$value": { "colorSpace": "srgb", "components": [0.9725, 0.4431, 0.4431], "hex": "#F87171" } },
        "700": { "$value": { "colorSpace": "srgb", "components": [0.7255, 0.1098, 0.1098], "hex": "#B91C1C" } }
      },
      "blue": {
        "400": { "$value": { "colorSpace": "srgb", "components": [0.3765, 0.6471, 0.9804], "hex": "#60A5FA" } },
        "700": { "$value": { "colorSpace": "srgb", "components": [0.1137, 0.3059, 0.8471], "hex": "#1D4ED8" } }
      }
    },
    "font": {
      "sans": { "$type": "fontFamily", "$value": ["Inter", "system-ui", "sans-serif"] }
    }
  },
  "color": {
    "$type": "color",
    "background": { "$value": "{primitive.color.gray.50}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.950}" } } } },
    "surface": { "$value": "{primitive.color.white}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.900}" } } } },
    "surface-raised": { "$value": "{primitive.color.white}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.800}" } } } },
    "border": { "$value": "{primitive.color.gray.300}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.700}" } } } },
    "text-primary": { "$value": "{primitive.color.gray.900}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.50}" } } } },
    "text-secondary": { "$value": "{primitive.color.gray.600}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.400}" } } } },
    "text-inverse": { "$value": "{primitive.color.white}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.900}" } } } },
    "action-primary": { "$value": "{primitive.color.indigo.700}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.indigo.400}" } } } },
    "on-action-primary": { "$value": "{primitive.color.white}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.900}" } } } },
    "action-secondary": { "$value": "{primitive.color.gray.200}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.700}" } } } },
    "on-action-secondary": { "$value": "{primitive.color.gray.900}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.50}" } } } },
    "focus": { "$value": "{primitive.color.indigo.700}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.indigo.400}" } } } },
    "success": { "$value": "{primitive.color.green.700}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.green.400}" } } } },
    "on-success": { "$value": "{primitive.color.white}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.900}" } } } },
    "warning": { "$value": "{primitive.color.amber.700}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.amber.400}" } } } },
    "on-warning": { "$value": "{primitive.color.white}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.900}" } } } },
    "danger": { "$value": "{primitive.color.red.700}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.red.400}" } } } },
    "on-danger": { "$value": "{primitive.color.white}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.900}" } } } },
    "info": { "$value": "{primitive.color.blue.700}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.blue.400}" } } } },
    "on-info": { "$value": "{primitive.color.white}", "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.gray.900}" } } } }
  },
  "font": {
    "$type": "typography",
    "display": { "$value": { "fontFamily": "{primitive.font.sans}", "fontSize": { "value": 40, "unit": "px" }, "fontWeight": 700, "lineHeight": 1.1 } },
    "title": { "$value": { "fontFamily": "{primitive.font.sans}", "fontSize": { "value": 28, "unit": "px" }, "fontWeight": 700, "lineHeight": 1.2 } },
    "heading": { "$value": { "fontFamily": "{primitive.font.sans}", "fontSize": { "value": 20, "unit": "px" }, "fontWeight": 600, "lineHeight": 1.3 } },
    "body": { "$value": { "fontFamily": "{primitive.font.sans}", "fontSize": { "value": 16, "unit": "px" }, "fontWeight": 400, "lineHeight": 1.5 } },
    "label": { "$value": { "fontFamily": "{primitive.font.sans}", "fontSize": { "value": 14, "unit": "px" }, "fontWeight": 500, "lineHeight": 1.4 } },
    "caption": { "$value": { "fontFamily": "{primitive.font.sans}", "fontSize": { "value": 12, "unit": "px" }, "fontWeight": 400, "lineHeight": 1.4 } }
  },
  "space": {
    "$type": "dimension",
    "0": { "$value": { "value": 0, "unit": "px" } },
    "1": { "$value": { "value": 4, "unit": "px" } },
    "2": { "$value": { "value": 8, "unit": "px" } },
    "3": { "$value": { "value": 12, "unit": "px" } },
    "4": { "$value": { "value": 16, "unit": "px" } },
    "5": { "$value": { "value": 20, "unit": "px" } },
    "6": { "$value": { "value": 24, "unit": "px" } },
    "8": { "$value": { "value": 32, "unit": "px" } },
    "10": { "$value": { "value": 40, "unit": "px" } },
    "12": { "$value": { "value": 48, "unit": "px" } },
    "16": { "$value": { "value": 64, "unit": "px" } }
  },
  "radius": {
    "$type": "dimension",
    "none": { "$value": { "value": 0, "unit": "px" } },
    "sm": { "$value": { "value": 4, "unit": "px" } },
    "md": { "$value": { "value": 8, "unit": "px" } },
    "lg": { "$value": { "value": 16, "unit": "px" } },
    "full": { "$value": { "value": 9999, "unit": "px" } }
  },
  "shadow": {
    "$type": "shadow",
    "sm": { "$value": { "color": { "colorSpace": "srgb", "components": [0, 0, 0], "alpha": 0.08, "hex": "#000000" }, "offsetX": { "value": 0, "unit": "px" }, "offsetY": { "value": 1, "unit": "px" }, "blur": { "value": 2, "unit": "px" }, "spread": { "value": 0, "unit": "px" } } },
    "md": { "$value": { "color": { "colorSpace": "srgb", "components": [0, 0, 0], "alpha": 0.1, "hex": "#000000" }, "offsetX": { "value": 0, "unit": "px" }, "offsetY": { "value": 4, "unit": "px" }, "blur": { "value": 12, "unit": "px" }, "spread": { "value": 0, "unit": "px" } } },
    "lg": { "$value": { "color": { "colorSpace": "srgb", "components": [0, 0, 0], "alpha": 0.14, "hex": "#000000" }, "offsetX": { "value": 0, "unit": "px" }, "offsetY": { "value": 12, "unit": "px" }, "blur": { "value": 32, "unit": "px" }, "spread": { "value": 0, "unit": "px" } } }
  },
  "duration": {
    "$type": "duration",
    "instant": { "$value": { "value": 0, "unit": "ms" } },
    "fast": { "$value": { "value": 120, "unit": "ms" } },
    "base": { "$value": { "value": 200, "unit": "ms" } },
    "slow": { "$value": { "value": 320, "unit": "ms" } }
  },
  "easing": {
    "$type": "cubicBezier",
    "standard": { "$value": [0.2, 0, 0, 1] },
    "enter": { "$value": [0, 0, 0, 1] },
    "exit": { "$value": [0.3, 0, 1, 1] }
  },
  "spring": {
    "snappy": {
      "duration": { "$type": "duration", "$value": { "value": 0.25, "unit": "s" } },
      "bounce": { "$type": "number", "$value": 0 }
    },
    "smooth": {
      "duration": { "$type": "duration", "$value": { "value": 0.4, "unit": "s" } },
      "bounce": { "$type": "number", "$value": 0.1 }
    },
    "bouncy": {
      "duration": { "$type": "duration", "$value": { "value": 0.5, "unit": "s" } },
      "bounce": { "$type": "number", "$value": 0.3 }
    }
  }
}
```

`cli/test/fixtures/contract/DESIGN.md`:
```markdown
---
motifContract: 1
name: Fixture App
updated: 2026-10-12
---

# Fixture App design guide

Fixture App feels calm, clear and trustworthy. It uses a quiet grey base with one indigo accent for the main action, generous spacing, and quick, gentle motion.

## 1. Brief
A budgeting app for students who want to see where their money goes.

## 2. Direction
Preset: Minimal.

## 3. Foundations
Indigo is only for the main action on each screen.

## 4. Motion
Buttons respond to presses within 120 ms. Screens slide in with the smooth spring.

## 5. Components
Button, Input, Card, ListItem.

## 6. Patterns
Every list has loading, empty and error states.

## 7. Accessibility
Text meets WCAG 2.2 AA contrast. Tap targets are at least 44×44.

## 8. Platform notes
None yet.

## 9. Do / Don't
Do use one primary button per screen. Don't use the accent for decoration.

## 10. Change log
- 2026-10-12 — Created with Motif.
```

- [ ] **Step 2: Create test helpers**

`cli/test/helpers.ts`:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadTokenDocument } from "../src/contract/load";
import type { TokenDocument } from "../src/contract/types";

export const FIXTURES = join(import.meta.dir, "fixtures");

/** A fresh, mutable copy of the valid fixture tokens.json. */
export function validTokens(): any {
  return JSON.parse(readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8"));
}

export function validDesignMd(): string {
  return readFileSync(join(FIXTURES, "contract/DESIGN.md"), "utf8");
}

/** Load a tokens object through the real loader; throws if the loader reports findings. */
export function docFrom(obj: unknown): TokenDocument {
  const { doc, findings } = loadTokenDocument("design/tokens.json", JSON.stringify(obj, null, 2));
  if (!doc || findings.length > 0) throw new Error(`fixture failed to load: ${JSON.stringify(findings)}`);
  return doc;
}
```

- [ ] **Step 3: Write the failing tests**

`cli/test/load.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lineAt, loadTokenDocument } from "../src/contract/load";
import { FIXTURES } from "./helpers";

const fixtureText = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");

describe("loadTokenDocument", () => {
  test("loads the valid fixture without findings", () => {
    const { doc, findings } = loadTokenDocument("design/tokens.json", fixtureText);
    expect(findings).toEqual([]);
    expect(doc!.tokens.has("color.text-primary")).toBe(true);
    expect(doc!.tokens.has("primitive.color.gray.900")).toBe(true);
    expect(doc!.tokens.has("spring.snappy.bounce")).toBe(true);
  });

  test("inherits $type from the nearest group", () => {
    const { doc } = loadTokenDocument("t.json", fixtureText);
    expect(doc!.tokens.get("space.4")!.type).toBe("dimension");
    expect(doc!.tokens.get("primitive.font.sans")!.type).toBe("fontFamily");
  });

  test("records the 1-based line of each token", () => {
    const text = '{\n  "a": {\n    "$type": "number",\n    "$value": 1\n  }\n}';
    const { doc } = loadTokenDocument("t.json", text);
    expect(doc!.tokens.get("a")!.line).toBe(2);
  });

  test("keeps $extensions on tokens and at the root", () => {
    const { doc } = loadTokenDocument("t.json", fixtureText);
    expect(doc!.tokens.get("color.background")!.extensions).toEqual({
      "dev.motif": { modes: { dark: "{primitive.color.gray.950}" } },
    });
    expect((doc!.rootExtensions as any)["dev.motif"].motifContract).toBe(1);
  });

  test("accepts a UTF-8 byte-order mark (Windows editors add one)", () => {
    const { doc, findings } = loadTokenDocument("t.json", "﻿" + fixtureText);
    expect(findings).toEqual([]);
    expect(doc).not.toBeNull();
  });

  test("reports invalid JSON with its line", () => {
    const { doc, findings } = loadTokenDocument("design/tokens.json", '{\n  "a": {\n    "$value": 1,\n  }\n}');
    expect(doc).toBeNull();
    expect(findings[0]!.code).toBe("invalid-json");
    expect(findings[0]!.line).toBe(4);
  });

  test("reports names containing a dot", () => {
    const { findings } = loadTokenDocument("t.json", '{ "a.b": { "$type": "number", "$value": 1 } }');
    expect(findings.map((f) => f.code)).toEqual(["bad-name"]);
  });

  test("reports $ref as not supported yet", () => {
    const { findings } = loadTokenDocument("t.json", '{ "a": { "$ref": "#/b/$value" } }');
    expect(findings.map((f) => f.code)).toEqual(["unsupported-ref"]);
  });

  test("rejects a top-level array", () => {
    const { doc, findings } = loadTokenDocument("t.json", "[]");
    expect(doc).toBeNull();
    expect(findings[0]!.code).toBe("invalid-json");
  });
});

describe("lineAt", () => {
  test("counts newlines before the offset", () => {
    expect(lineAt("a\nb\nc", 0)).toBe(1);
    expect(lineAt("a\nb\nc", 2)).toBe(2);
    expect(lineAt("a\r\nb", 3)).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd cli && bun test test/load.test.ts`
Expected: FAIL — `../src/contract/load` not found.

- [ ] **Step 5: Implement**

`cli/src/contract/types.ts`:
```ts
export const MOTIF_EXT = "dev.motif";

export const KNOWN_TYPES = [
  "color", "dimension", "fontFamily", "fontWeight", "duration", "cubicBezier", "number",
  "strokeStyle", "border", "transition", "shadow", "gradient", "typography",
] as const;

export type TokenType = (typeof KNOWN_TYPES)[number];

export interface FlatToken {
  /** Dot path, e.g. "color.text-primary". */
  path: string;
  /** Own $type, else the nearest group's $type; null if none. May be an unknown name. */
  type: string | null;
  /** Raw $value as written (aliases unresolved). */
  value: unknown;
  extensions: Record<string, unknown> | undefined;
  /** 1-based line of the token's name in the file. */
  line: number;
}

export interface TokenDocument {
  file: string;
  tokens: Map<string, FlatToken>;
  rootExtensions: Record<string, unknown> | undefined;
}
```

`cli/src/contract/load.ts`:
```ts
import { getNodeValue, parseTree, printParseErrorCode, type Node, type ParseError } from "jsonc-parser";
import type { Finding } from "../findings";
import type { FlatToken, TokenDocument } from "./types";

export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function prop(obj: Node, name: string): Node | undefined {
  for (const p of obj.children ?? []) {
    const [key, value] = p.children ?? [];
    if (key?.value === name) return value;
  }
  return undefined;
}

export function loadTokenDocument(
  file: string,
  rawText: string,
): { doc: TokenDocument | null; findings: Finding[] } {
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (errors.length > 0 || !root) {
    const first = errors[0];
    return {
      doc: null,
      findings: [{
        code: "invalid-json",
        severity: "error",
        file,
        line: first ? lineAt(text, first.offset) : 1,
        message: `This file isn't valid JSON (${first ? printParseErrorCode(first.error) : "the file is empty"}). Fix the line shown, or ask your agent to repair it.`,
      }],
    };
  }
  if (root.type !== "object") {
    return {
      doc: null,
      findings: [{ code: "invalid-json", severity: "error", file, line: 1, message: "Your theme values file must contain a JSON object at the top level." }],
    };
  }

  const findings: Finding[] = [];
  const tokens = new Map<string, FlatToken>();

  const walk = (group: Node, segs: string[], inherited: string | null): void => {
    for (const p of group.children ?? []) {
      const [keyNode, valueNode] = p.children ?? [];
      const key = String(keyNode?.value);
      if (key.startsWith("$")) continue;
      const path = [...segs, key].join(".");
      const line = lineAt(text, p.offset);
      if (/[.{}]/.test(key)) {
        findings.push({ code: "bad-name", severity: "error", file, line, path, message: `The name "${key}" can't contain ".", "{" or "}".` });
        continue;
      }
      if (!valueNode || valueNode.type !== "object") {
        findings.push({ code: "not-object", severity: "error", file, line, path, message: `"${path}" must be an object: either a theme value (with "$value") or a group of them.` });
        continue;
      }
      const typeNode = prop(valueNode, "$type");
      const ownType = typeNode ? String(getNodeValue(typeNode)) : null;
      const valueProp = prop(valueNode, "$value");
      if (valueProp) {
        const extNode = prop(valueNode, "$extensions");
        tokens.set(path, {
          path,
          type: ownType ?? inherited,
          value: getNodeValue(valueProp),
          extensions: extNode ? getNodeValue(extNode) : undefined,
          line,
        });
      } else if (prop(valueNode, "$ref")) {
        findings.push({ code: "unsupported-ref", severity: "error", file, line, path, message: `"${path}" uses "$ref", which Motif doesn't support yet. Use an alias like "{primitive.color.gray.900}" instead.` });
      } else {
        walk(valueNode, [...segs, key], ownType ?? inherited);
      }
    }
  };

  const rootType = prop(root, "$type");
  walk(root, [], rootType ? String(getNodeValue(rootType)) : null);
  const rootExt = prop(root, "$extensions");
  return { doc: { file, tokens, rootExtensions: rootExt ? getNodeValue(rootExt) : undefined }, findings };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd cli && bun test test/load.test.ts && bun run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add cli/src/contract cli/test
git commit -m "feat(contract): load tokens.json with line numbers; add valid fixture"
```

---

### Task 4: Alias resolution and light/dark values

**Files:**
- Create: `cli/src/contract/resolve.ts`
- Test: `cli/test/resolve.test.ts`

**Interfaces:**
- Consumes: `TokenDocument`, `MOTIF_EXT` (Task 3); `docFrom`, `validTokens` (Task 3 helpers).
- Produces (from `src/contract/resolve.ts`):
  - `isAlias(v: unknown): v is string`
  - `type Resolved = { ok: true; value: unknown; type: string | null } | { ok: false; error: string }`
  - `resolveValue(doc: TokenDocument, value: unknown, chain?: string[]): Resolved` — resolves aliases anywhere inside the value (arrays, composite objects)
  - `resolveToken(doc: TokenDocument, path: string): Resolved` — type = the token's own/inherited type, else the alias target's type
  - `type Mode = "light" | "dark"`
  - `darkValueOf(doc: TokenDocument, path: string): unknown | undefined` — raw `$extensions["dev.motif"].modes.dark`
  - `resolveMode(doc: TokenDocument, path: string, mode: Mode): Resolved` — dark falls back to light when no dark value exists

- [ ] **Step 1: Write the failing tests**

`cli/test/resolve.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { darkValueOf, isAlias, resolveMode, resolveToken, resolveValue } from "../src/contract/resolve";
import { docFrom, validTokens } from "./helpers";

const num = (v: unknown) => ({ $type: "number", $value: v });

describe("isAlias", () => {
  test("recognises {a.b} only", () => {
    expect(isAlias("{a.b}")).toBe(true);
    expect(isAlias("a.b")).toBe(false);
    expect(isAlias("{a}{b}")).toBe(false);
    expect(isAlias(3)).toBe(false);
  });
});

describe("resolveToken", () => {
  test("follows a chain of aliases", () => {
    const doc = docFrom({ a: num(4), b: { $value: "{a}" }, c: { $value: "{b}" } });
    expect(resolveToken(doc, "c")).toEqual({ ok: true, value: 4, type: "number" });
  });

  test("an untyped alias takes its target's type", () => {
    const doc = docFrom(validTokens());
    const r = resolveToken(doc, "color.text-primary");
    expect(r.ok && r.type).toBe("color");
    expect(r.ok && (r.value as any).hex).toBe("#111827");
  });

  test("resolves aliases nested inside composite values", () => {
    const doc = docFrom(validTokens());
    const r = resolveToken(doc, "font.body");
    expect(r.ok && (r.value as any).fontFamily).toEqual(["Inter", "system-ui", "sans-serif"]);
  });

  test("reports a missing target", () => {
    const doc = docFrom({ a: { $type: "number", $value: "{nope}" } });
    const r = resolveToken(doc, "a");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('It points to "{nope}", which doesn\'t exist.');
  });

  test("reports a loop instead of hanging", () => {
    const doc = docFrom({ a: { $type: "number", $value: "{b}" }, b: { $type: "number", $value: "{a}" } });
    const r = resolveToken(doc, "a");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('"a" → "b" → "a" point to each other in a loop.');
  });

  test("reports an unknown path", () => {
    expect(resolveToken(docFrom({}), "x").ok).toBe(false);
  });
});

describe("modes", () => {
  test("darkValueOf returns the raw dark alias", () => {
    const doc = docFrom(validTokens());
    expect(darkValueOf(doc, "color.background")).toBe("{primitive.color.gray.950}");
    expect(darkValueOf(doc, "space.4")).toBeUndefined();
  });

  test("resolveMode returns light and dark values", () => {
    const doc = docFrom(validTokens());
    const light = resolveMode(doc, "color.background", "light");
    const dark = resolveMode(doc, "color.background", "dark");
    expect(light.ok && (light.value as any).hex).toBe("#F9FAFB");
    expect(dark.ok && (dark.value as any).hex).toBe("#030712");
  });

  test("dark falls back to light when no dark value exists", () => {
    const doc = docFrom({ a: num(1) });
    expect(resolveMode(doc, "a", "dark")).toEqual({ ok: true, value: 1, type: "number" });
  });

  test("resolveValue resolves plain values unchanged", () => {
    expect(resolveValue(docFrom({}), { value: 4, unit: "px" })).toEqual({ ok: true, value: { value: 4, unit: "px" }, type: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test test/resolve.test.ts`
Expected: FAIL — `../src/contract/resolve` not found.

- [ ] **Step 3: Implement**

`cli/src/contract/resolve.ts`:
```ts
import { MOTIF_EXT, type TokenDocument } from "./types";

const ALIAS = /^\{([^{}]+)\}$/;

export const isAlias = (v: unknown): v is string => typeof v === "string" && ALIAS.test(v);

export type Resolved =
  | { ok: true; value: unknown; type: string | null }
  | { ok: false; error: string };

export type Mode = "light" | "dark";

export function resolveValue(doc: TokenDocument, value: unknown, chain: string[] = []): Resolved {
  if (isAlias(value)) {
    const target = value.slice(1, -1);
    if (chain.includes(target)) {
      return { ok: false, error: `${[...chain, target].map((p) => `"${p}"`).join(" → ")} point to each other in a loop.` };
    }
    const tok = doc.tokens.get(target);
    if (!tok) return { ok: false, error: `It points to "{${target}}", which doesn't exist.` };
    const inner = resolveValue(doc, tok.value, [...chain, target]);
    if (!inner.ok) return inner;
    return { ok: true, value: inner.value, type: tok.type ?? inner.type };
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const r = resolveValue(doc, item, chain);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return { ok: true, value: out, type: null };
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = resolveValue(doc, v, chain);
      if (!r.ok) return r;
      out[k] = r.value;
    }
    return { ok: true, value: out, type: null };
  }
  return { ok: true, value, type: null };
}

export function resolveToken(doc: TokenDocument, path: string): Resolved {
  const tok = doc.tokens.get(path);
  if (!tok) return { ok: false, error: `"${path}" doesn't exist.` };
  const r = resolveValue(doc, tok.value, [path]);
  if (!r.ok) return r;
  return { ok: true, value: r.value, type: tok.type ?? r.type };
}

export function darkValueOf(doc: TokenDocument, path: string): unknown | undefined {
  const ext = doc.tokens.get(path)?.extensions?.[MOTIF_EXT] as { modes?: { dark?: unknown } } | undefined;
  return ext?.modes?.dark;
}

export function resolveMode(doc: TokenDocument, path: string, mode: Mode): Resolved {
  const light = resolveToken(doc, path);
  if (mode === "light") return light;
  const dark = darkValueOf(doc, path);
  if (dark === undefined) return light;
  const r = resolveValue(doc, dark, [path]);
  if (!r.ok) return r;
  return { ok: true, value: r.value, type: light.ok ? light.type : r.type };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && bun test test/resolve.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/contract/resolve.ts cli/test/resolve.test.ts
git commit -m "feat(contract): resolve aliases, loops and light/dark values"
```

---

### Task 5: Check every value against its DTCG type

**Files:**
- Create: `cli/src/contract/values.ts`, `cli/src/contract/tokens.ts`
- Test: `cli/test/values.test.ts`, `cli/test/tokens.test.ts`

**Interfaces:**
- Consumes: `KNOWN_TYPES`, `TokenDocument` (Task 3); `resolveToken`, `resolveValue`, `darkValueOf` (Task 4); `Finding` (Task 2).
- Produces (from `src/contract/values.ts`):
  - `COLOR_SPACES: readonly string[]`
  - `interface DtcgColor { colorSpace: string; components: (number | "none")[]; alpha?: number; hex?: string }`
  - `interface DtcgDuration { value: number; unit: "ms" | "s" }`
  - `validateValue(type: string, value: unknown): string | null` — `null` = valid; otherwise a lowercase sentence fragment explaining the problem
  - `durationToMs(d: DtcgDuration): number`
- Produces (from `src/contract/tokens.ts`): `validateTokens(doc: TokenDocument): Finding[]` — codes `missing-type`, `unknown-type`, `broken-alias`, `bad-value`

- [ ] **Step 1: Write the failing tests**

`cli/test/values.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { durationToMs, validateValue } from "../src/contract/values";

const px = (value: number) => ({ value, unit: "px" });
const black = { colorSpace: "srgb", components: [0, 0, 0] };

describe("validateValue", () => {
  test.each([
    ["color", { colorSpace: "srgb", components: [1, 0.5, 0], alpha: 1, hex: "#FF8000" }],
    ["color", { colorSpace: "oklch", components: [0.7, 0.1, "none"] }],
    ["dimension", px(16)],
    ["dimension", { value: 1.5, unit: "rem" }],
    ["duration", { value: 200, unit: "ms" }],
    ["duration", { value: 0.4, unit: "s" }],
    ["cubicBezier", [0.2, 0, 0, 1]],
    ["cubicBezier", [0.3, -0.5, 0.7, 1.5]],
    ["number", -0.5],
    ["fontFamily", "Inter"],
    ["fontFamily", ["Inter", "sans-serif"]],
    ["fontWeight", 600],
    ["fontWeight", "semi-bold"],
    ["shadow", { color: black, offsetX: px(0), offsetY: px(1), blur: px(2), spread: px(0) }],
    ["shadow", [{ color: black, offsetX: px(0), offsetY: px(1), blur: px(2), spread: px(0), inset: true }]],
    ["typography", { fontFamily: "Inter", fontSize: px(16), fontWeight: 400, lineHeight: 1.5 }],
    ["typography", { fontFamily: "Inter", fontSize: px(16), fontWeight: 400, lineHeight: 1.5, letterSpacing: px(0) }],
    ["gradient", "anything — not checked in v1"],
  ])("accepts valid %s", (type, value) => {
    expect(validateValue(type as string, value)).toBeNull();
  });

  test.each([
    ["color", "#FF0000", "a color must be an object with colorSpace and components"],
    ["color", { colorSpace: "cmyk", components: [0, 0, 0] }, 'unknown color space "cmyk"'],
    ["color", { colorSpace: "srgb", components: [0, 0] }, "components must be 3 numbers"],
    ["color", { colorSpace: "srgb", components: [0, 0, 0], alpha: 2 }, "alpha must be between 0 and 1"],
    ["color", { colorSpace: "srgb", components: [0, 0, 0], hex: "red" }, 'hex must look like "#1A2B3C"'],
    ["dimension", 16, 'a size must look like { "value": 16, "unit": "px" }'],
    ["dimension", { value: 16, unit: "pt" }, 'size unit must be "px" or "rem"'],
    ["duration", { value: -1, unit: "ms" }, "a duration can't be negative"],
    ["duration", { value: 1, unit: "min" }, 'duration unit must be "ms" or "s"'],
    ["cubicBezier", [1.2, 0, 0, 1], "an easing curve needs 4 numbers and its 1st and 3rd numbers must be between 0 and 1"],
    ["number", "3", "must be a number"],
    ["fontFamily", [], "a font family must be a name or a list of names"],
    ["fontWeight", 1200, "a font weight must be 1–1000 or a name like \"bold\""],
    ["typography", { fontFamily: "Inter", fontSize: px(16), fontWeight: 400 }, "lineHeight: must be a number"],
    ["shadow", { color: black, offsetX: px(0), offsetY: px(1), blur: 2, spread: px(0) }, 'blur: a size must look like { "value": 16, "unit": "px" }'],
  ])("rejects bad %s", (type, value, message) => {
    expect(validateValue(type as string, value)).toBe(message as string);
  });
});

describe("durationToMs", () => {
  test("converts seconds and milliseconds", () => {
    expect(durationToMs({ value: 0.25, unit: "s" })).toBe(250);
    expect(durationToMs({ value: 120, unit: "ms" })).toBe(120);
  });
});
```

`cli/test/tokens.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { validateTokens } from "../src/contract/tokens";
import { docFrom, validTokens } from "./helpers";

const codes = (obj: unknown) => validateTokens(docFrom(obj)).map((f) => f.code);

describe("validateTokens", () => {
  test("the valid fixture has no findings", () => {
    expect(validateTokens(docFrom(validTokens()))).toEqual([]);
  });

  test("reports a token with no type", () => {
    expect(codes({ a: { $value: 1 } })).toEqual(["missing-type"]);
  });

  test("reports an unknown type name", () => {
    expect(codes({ a: { $type: "colour", $value: 1 } })).toEqual(["unknown-type"]);
  });

  test("reports a broken alias with the token's line", () => {
    const t = validTokens();
    t.color["text-primary"].$value = "{primitive.color.gray.999}";
    const findings = validateTokens(docFrom(t));
    expect(findings.map((f) => f.code)).toEqual(["broken-alias"]);
    expect(findings[0]!.path).toBe("color.text-primary");
    expect(findings[0]!.line).toBeGreaterThan(1);
    expect(findings[0]!.message).toBe('"color.text-primary": It points to "{primitive.color.gray.999}", which doesn\'t exist.');
  });

  test("reports a bad value in plain words", () => {
    const t = validTokens();
    t.space["4"].$value = { value: 16, unit: "pt" };
    const findings = validateTokens(docFrom(t));
    expect(findings.map((f) => f.code)).toEqual(["bad-value"]);
    expect(findings[0]!.message).toBe('"space.4" has a problem: size unit must be "px" or "rem".');
  });

  test("checks dark values too", () => {
    const t = validTokens();
    t.color.surface.$extensions["dev.motif"].modes.dark = "{primitive.color.nope}";
    const findings = validateTokens(docFrom(t));
    expect(findings.map((f) => f.code)).toEqual(["broken-alias"]);
    expect(findings[0]!.message).toStartWith('"color.surface" (dark):');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test test/values.test.ts test/tokens.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `values.ts`**

`cli/src/contract/values.ts`:
```ts
export const COLOR_SPACES = [
  "srgb", "srgb-linear", "hsl", "hwb", "lab", "lch", "oklab", "oklch",
  "display-p3", "a98-rgb", "prophoto-rgb", "rec2020", "xyz-d65", "xyz-d50",
] as const;

const FONT_WEIGHT_NAMES = [
  "thin", "hairline", "extra-light", "ultra-light", "light", "normal", "regular", "book", "medium",
  "semi-bold", "demi-bold", "bold", "extra-bold", "ultra-bold", "black", "heavy", "extra-black", "ultra-black",
];

export interface DtcgColor {
  colorSpace: string;
  components: (number | "none")[];
  alpha?: number;
  hex?: string;
}

export interface DtcgDuration {
  value: number;
  unit: "ms" | "s";
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function checkColor(v: unknown): string | null {
  if (!isObj(v)) return "a color must be an object with colorSpace and components";
  if (!(COLOR_SPACES as readonly string[]).includes(String(v.colorSpace))) return `unknown color space "${String(v.colorSpace)}"`;
  if (!Array.isArray(v.components) || v.components.length !== 3 || !v.components.every((c) => isNum(c) || c === "none")) {
    return "components must be 3 numbers";
  }
  if (v.alpha !== undefined && !(isNum(v.alpha) && v.alpha >= 0 && v.alpha <= 1)) return "alpha must be between 0 and 1";
  if (v.hex !== undefined && !(typeof v.hex === "string" && /^#[0-9a-fA-F]{6}$/.test(v.hex))) return 'hex must look like "#1A2B3C"';
  return null;
}

function checkDimension(v: unknown): string | null {
  if (!isObj(v) || !isNum(v.value)) return 'a size must look like { "value": 16, "unit": "px" }';
  if (v.unit !== "px" && v.unit !== "rem") return 'size unit must be "px" or "rem"';
  return null;
}

function checkDuration(v: unknown): string | null {
  if (!isObj(v) || !isNum(v.value)) return 'a duration must look like { "value": 200, "unit": "ms" }';
  if (v.value < 0) return "a duration can't be negative";
  if (v.unit !== "ms" && v.unit !== "s") return 'duration unit must be "ms" or "s"';
  return null;
}

function checkCubicBezier(v: unknown): string | null {
  const ok = Array.isArray(v) && v.length === 4 && v.every(isNum) && v[0] >= 0 && v[0] <= 1 && v[2] >= 0 && v[2] <= 1;
  return ok ? null : "an easing curve needs 4 numbers and its 1st and 3rd numbers must be between 0 and 1";
}

function checkFontFamily(v: unknown): string | null {
  const ok = (typeof v === "string" && v.length > 0)
    || (Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string" && s.length > 0));
  return ok ? null : "a font family must be a name or a list of names";
}

function checkFontWeight(v: unknown): string | null {
  const ok = (isNum(v) && v >= 1 && v <= 1000) || (typeof v === "string" && FONT_WEIGHT_NAMES.includes(v));
  return ok ? null : 'a font weight must be 1–1000 or a name like "bold"';
}

function field(name: string, problem: string | null): string | null {
  return problem ? `${name}: ${problem}` : null;
}

function checkShadowLayer(v: unknown): string | null {
  if (!isObj(v)) return "a shadow must be an object with color, offsetX, offsetY, blur and spread";
  return field("color", checkColor(v.color))
    ?? field("offsetX", checkDimension(v.offsetX))
    ?? field("offsetY", checkDimension(v.offsetY))
    ?? field("blur", checkDimension(v.blur))
    ?? field("spread", checkDimension(v.spread))
    ?? (v.inset !== undefined && typeof v.inset !== "boolean" ? "inset: must be true or false" : null);
}

function checkShadow(v: unknown): string | null {
  if (Array.isArray(v)) {
    for (const layer of v) {
      const p = checkShadowLayer(layer);
      if (p) return p;
    }
    return v.length > 0 ? null : "a shadow list can't be empty";
  }
  return checkShadowLayer(v);
}

function checkTypography(v: unknown): string | null {
  if (!isObj(v)) return "typography must be an object with fontFamily, fontSize, fontWeight and lineHeight";
  return field("fontFamily", checkFontFamily(v.fontFamily))
    ?? field("fontSize", checkDimension(v.fontSize))
    ?? field("fontWeight", checkFontWeight(v.fontWeight))
    ?? field("lineHeight", isNum(v.lineHeight) ? null : "must be a number")
    ?? (v.letterSpacing !== undefined ? field("letterSpacing", checkDimension(v.letterSpacing)) : null);
}

/** Returns null when valid, otherwise a short lowercase explanation. Types Motif v1 doesn't inspect pass. */
export function validateValue(type: string, value: unknown): string | null {
  switch (type) {
    case "color": return checkColor(value);
    case "dimension": return checkDimension(value);
    case "duration": return checkDuration(value);
    case "cubicBezier": return checkCubicBezier(value);
    case "number": return isNum(value) ? null : "must be a number";
    case "fontFamily": return checkFontFamily(value);
    case "fontWeight": return checkFontWeight(value);
    case "shadow": return checkShadow(value);
    case "typography": return checkTypography(value);
    default: return null; // strokeStyle, border, transition, gradient: not inspected in v1
  }
}

export function durationToMs(d: DtcgDuration): number {
  return d.unit === "s" ? d.value * 1000 : d.value;
}
```

- [ ] **Step 4: Implement `tokens.ts`**

`cli/src/contract/tokens.ts`:
```ts
import type { Finding } from "../findings";
import { darkValueOf, resolveToken, resolveValue } from "./resolve";
import { KNOWN_TYPES, type TokenDocument } from "./types";
import { validateValue } from "./values";

export function validateTokens(doc: TokenDocument): Finding[] {
  const findings: Finding[] = [];
  const add = (code: string, path: string, line: number, message: string) =>
    findings.push({ code, severity: "error", file: doc.file, line, path, message });

  for (const tok of doc.tokens.values()) {
    const resolved = resolveToken(doc, tok.path);
    if (!resolved.ok) {
      add("broken-alias", tok.path, tok.line, `"${tok.path}": ${resolved.error}`);
      continue;
    }
    const type = resolved.type;
    if (type === null) {
      add("missing-type", tok.path, tok.line, `"${tok.path}" has no "$type", and no group above it sets one.`);
      continue;
    }
    if (!(KNOWN_TYPES as readonly string[]).includes(type)) {
      add("unknown-type", tok.path, tok.line, `"${tok.path}" has an unknown type "${type}".`);
      continue;
    }
    const problem = validateValue(type, resolved.value);
    if (problem) add("bad-value", tok.path, tok.line, `"${tok.path}" has a problem: ${problem}.`);

    const dark = darkValueOf(doc, tok.path);
    if (dark !== undefined) {
      const d = resolveValue(doc, dark, [tok.path]);
      if (!d.ok) add("broken-alias", tok.path, tok.line, `"${tok.path}" (dark): ${d.error}`);
      else {
        const dp = validateValue(type, d.value);
        if (dp) add("bad-value", tok.path, tok.line, `"${tok.path}" (dark) has a problem: ${dp}.`);
      }
    }
  }
  return findings;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cli && bun test test/values.test.ts test/tokens.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/contract/values.ts cli/src/contract/tokens.ts cli/test/values.test.ts cli/test/tokens.test.ts
git commit -m "feat(contract): validate every theme value against its DTCG type"
```

---

### Task 6: Colour conversion and contrast pairs (light + dark)

**Files:**
- Create: `cli/src/contract/color.ts`, `cli/src/contract/contrast.ts`
- Test: `cli/test/color.test.ts`, `cli/test/contrast.test.ts`

**Interfaces:**
- Consumes: `DtcgColor`, `validateValue` (Task 5); `resolveMode`, `Mode` (Task 4); `TokenDocument`, `MOTIF_EXT` (Task 3); `Finding` (Task 2).
- Produces (from `src/contract/color.ts`): `contrastRatio(fg: DtcgColor, bg: DtcgColor): number` — WCAG ratio; a translucent foreground is composited over the background first.
- Produces (from `src/contract/contrast.ts`):
  - `type PairKind = "text" | "large-text" | "ui"`
  - `MIN_RATIO: Record<PairKind, number>` = `{ text: 4.5, "large-text": 3, ui: 3 }`
  - `interface ContrastPair { fg: string; bg: string; kind: PairKind }`
  - `readPairs(doc: TokenDocument): { pairs: ContrastPair[]; findings: Finding[] }` — codes `no-pairs`, `bad-pair`
  - `checkContrast(doc: TokenDocument): { findings: Finding[]; checked: number }` — code `low-contrast`; `checked` = valid pairs × 2 modes

- [ ] **Step 1: Write the failing tests**

`cli/test/color.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { contrastRatio } from "../src/contract/color";

const srgb = (r: number, g: number, b: number, alpha?: number) => ({ colorSpace: "srgb", components: [r, g, b], ...(alpha === undefined ? {} : { alpha }) });
const white = srgb(1, 1, 1);
const black = srgb(0, 0, 0);

describe("contrastRatio", () => {
  test("black on white is 21:1", () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
  });
  test("#777777 on white is about 4.48:1", () => {
    const gray = srgb(0x77 / 255, 0x77 / 255, 0x77 / 255);
    expect(contrastRatio(gray, white)).toBeCloseTo(4.48, 2);
  });
  test("is symmetric", () => {
    const a = srgb(0.2, 0.3, 0.8);
    expect(contrastRatio(a, white)).toBeCloseTo(contrastRatio(white, a), 10);
  });
  test("understands hsl with 0–100 saturation and lightness", () => {
    expect(contrastRatio({ colorSpace: "hsl", components: [0, 0, 0] }, white)).toBeCloseTo(21, 5);
  });
  test("understands oklch, including a 'none' hue", () => {
    expect(contrastRatio({ colorSpace: "oklch", components: [1, 0, "none"] }, black)).toBeCloseTo(21, 1);
  });
  test("composites a translucent foreground over the background", () => {
    expect(contrastRatio(srgb(0, 0, 0, 0.5), white)).toBeCloseTo(3.98, 1);
  });
});
```

`cli/test/contrast.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { checkContrast, readPairs } from "../src/contract/contrast";
import { docFrom, validTokens } from "./helpers";

describe("checkContrast", () => {
  test("the valid fixture passes all 13 pairs in both modes", () => {
    const { findings, checked } = checkContrast(docFrom(validTokens()));
    expect(findings).toEqual([]);
    expect(checked).toBe(26);
  });

  test("flags hard-to-read text in dark mode only", () => {
    const t = validTokens();
    t.color["text-secondary"].$extensions["dev.motif"].modes.dark = "{primitive.color.gray.600}";
    const { findings } = checkContrast(docFrom(t));
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.code === "low-contrast" && f.message.startsWith("In dark mode"))).toBe(true);
    expect(findings[0]!.message).toBe('In dark mode, "text-secondary" on "background" is hard to read: 2.66:1, needs at least 4.5:1.');
    expect(findings[0]!.path).toBe("color.text-secondary");
  });

  test("uses the 3:1 minimum for UI pairs", () => {
    const t = validTokens();
    t.color.focus.$value = "{primitive.color.gray.300}";
    const { findings } = checkContrast(docFrom(t));
    expect(findings.map((f) => f.message)).toEqual([
      'In light mode, "focus" on "background" is hard to read: 1.41:1, needs at least 3:1.',
    ]);
  });
});

describe("readPairs", () => {
  test("reports when no pairs are listed", () => {
    const t = validTokens();
    delete t.$extensions["dev.motif"].pairs;
    expect(readPairs(docFrom(t)).findings.map((f) => f.code)).toEqual(["no-pairs"]);
  });

  test("reports pairs that name missing roles or unknown kinds", () => {
    const t = validTokens();
    t.$extensions["dev.motif"].pairs = [
      { fg: "color.nope", bg: "color.background", kind: "text" },
      { fg: "color.text-primary", bg: "color.background", kind: "huge" },
    ];
    const { pairs, findings } = readPairs(docFrom(t));
    expect(pairs).toEqual([]);
    expect(findings.map((f) => f.code)).toEqual(["bad-pair", "bad-pair"]);
  });
});
```

The expected ratios in the tests (2.66 and 1.41) are floored to 2 decimals, matching the implementation. If your run shows a value that differs only in the second decimal, recompute it by hand from the WCAG formula before changing the test — the fixture colours are fixed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test test/color.test.ts test/contrast.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `color.ts`**

`cli/src/contract/color.ts`:
```ts
import { clampRgb, converter, wcagContrast, type Color, type Rgb } from "culori";
import type { DtcgColor } from "./values";

const toRgb = converter("rgb");

/** DTCG colorSpace → culori mode, channel keys, and per-channel scale into culori's ranges. */
const SPACES: Record<string, { mode: string; keys: [string, string, string]; scale?: [number, number, number] }> = {
  "srgb": { mode: "rgb", keys: ["r", "g", "b"] },
  "srgb-linear": { mode: "lrgb", keys: ["r", "g", "b"] },
  "hsl": { mode: "hsl", keys: ["h", "s", "l"], scale: [1, 0.01, 0.01] },
  "hwb": { mode: "hwb", keys: ["h", "w", "b"], scale: [1, 0.01, 0.01] },
  "lab": { mode: "lab", keys: ["l", "a", "b"] },
  "lch": { mode: "lch", keys: ["l", "c", "h"] },
  "oklab": { mode: "oklab", keys: ["l", "a", "b"] },
  "oklch": { mode: "oklch", keys: ["l", "c", "h"] },
  "display-p3": { mode: "p3", keys: ["r", "g", "b"] },
  "a98-rgb": { mode: "a98", keys: ["r", "g", "b"] },
  "prophoto-rgb": { mode: "prophoto", keys: ["r", "g", "b"] },
  "rec2020": { mode: "rec2020", keys: ["r", "g", "b"] },
  "xyz-d65": { mode: "xyz65", keys: ["x", "y", "z"] },
  "xyz-d50": { mode: "xyz50", keys: ["x", "y", "z"] },
};

function toCulori(c: DtcgColor): Color {
  const space = SPACES[c.colorSpace];
  if (!space) throw new Error(`unsupported color space ${c.colorSpace}`);
  const out: Record<string, unknown> = { mode: space.mode };
  space.keys.forEach((key, i) => {
    const raw = c.components[i];
    if (raw === "none") {
      out[key] = key === "h" ? undefined : 0;
    } else {
      out[key] = (raw ?? 0) * (space.scale?.[i] ?? 1);
    }
  });
  if (c.alpha !== undefined) out.alpha = c.alpha;
  return out as unknown as Color;
}

function rgbOf(c: DtcgColor): Rgb {
  return clampRgb(toRgb(toCulori(c))) as Rgb;
}

export function contrastRatio(fg: DtcgColor, bg: DtcgColor): number {
  const b = rgbOf(bg);
  const f = rgbOf(fg);
  const a = f.alpha ?? 1;
  const over: Rgb = {
    mode: "rgb",
    r: f.r * a + b.r * (1 - a),
    g: f.g * a + b.g * (1 - a),
    b: f.b * a + b.b * (1 - a),
  };
  return wcagContrast(over, { mode: "rgb", r: b.r, g: b.g, b: b.b });
}
```

- [ ] **Step 4: Implement `contrast.ts`**

`cli/src/contract/contrast.ts`:
```ts
import type { Finding } from "../findings";
import { contrastRatio } from "./color";
import { resolveMode, type Mode } from "./resolve";
import { MOTIF_EXT, type TokenDocument } from "./types";
import { validateValue, type DtcgColor } from "./values";

export type PairKind = "text" | "large-text" | "ui";

export const MIN_RATIO: Record<PairKind, number> = { text: 4.5, "large-text": 3, ui: 3 };

export interface ContrastPair {
  fg: string;
  bg: string;
  kind: PairKind;
}

const short = (path: string) => path.replace(/^color\./, "");

export function readPairs(doc: TokenDocument): { pairs: ContrastPair[]; findings: Finding[] } {
  const raw = (doc.rootExtensions?.[MOTIF_EXT] as { pairs?: unknown } | undefined)?.pairs;
  if (!Array.isArray(raw)) {
    return {
      pairs: [],
      findings: [{
        code: "no-pairs", severity: "error", file: doc.file,
        message: 'Your theme values don\'t list which text colors sit on which backgrounds ("pairs"), so readability can\'t be checked.',
      }],
    };
  }
  const pairs: ContrastPair[] = [];
  const findings: Finding[] = [];
  raw.forEach((p: any, i: number) => {
    const fgOk = typeof p?.fg === "string" && doc.tokens.has(p.fg);
    const bgOk = typeof p?.bg === "string" && doc.tokens.has(p.bg);
    const kindOk = p?.kind in MIN_RATIO;
    if (fgOk && bgOk && kindOk) {
      pairs.push({ fg: p.fg, bg: p.bg, kind: p.kind });
      return;
    }
    const problem = !fgOk ? `"${String(p?.fg)}" doesn't exist` : !bgOk ? `"${String(p?.bg)}" doesn't exist` : `kind must be "text", "large-text" or "ui"`;
    findings.push({ code: "bad-pair", severity: "error", file: doc.file, message: `Contrast pair #${i + 1}: ${problem}.` });
  });
  return { pairs, findings };
}

function colorIn(doc: TokenDocument, path: string, mode: Mode): DtcgColor | null {
  const r = resolveMode(doc, path, mode);
  if (!r.ok || r.type !== "color" || validateValue("color", r.value) !== null) return null;
  return r.value as DtcgColor;
}

export function checkContrast(doc: TokenDocument): { findings: Finding[]; checked: number } {
  const { pairs, findings } = readPairs(doc);
  const modes: Mode[] = ["light", "dark"];
  for (const pair of pairs) {
    for (const mode of modes) {
      const fg = colorIn(doc, pair.fg, mode);
      const bg = colorIn(doc, pair.bg, mode);
      if (!fg || !bg) continue; // broken values are reported by validateTokens
      const ratio = contrastRatio(fg, bg);
      const min = MIN_RATIO[pair.kind];
      if (ratio < min) {
        const shown = (Math.floor(ratio * 100) / 100).toFixed(2);
        findings.push({
          code: "low-contrast", severity: "error", file: doc.file,
          line: doc.tokens.get(pair.fg)?.line, path: pair.fg,
          message: `In ${mode} mode, "${short(pair.fg)}" on "${short(pair.bg)}" is hard to read: ${shown}:1, needs at least ${min}:1.`,
        });
      }
    }
  }
  return { findings, checked: pairs.length * modes.length };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cli && bun test test/color.test.ts test/contrast.test.ts && bun run typecheck`
Expected: PASS. If `@types/culori` rejects a call signature, fix with a local cast (e.g. `as Rgb`) — do not change behaviour.

- [ ] **Step 6: Commit**

```bash
git add cli/src/contract/color.ts cli/src/contract/contrast.ts cli/test/color.test.ts cli/test/contrast.test.ts
git commit -m "feat(contract): check text/background contrast in light and dark"
```

---

### Task 7: Required roles, dark values, motion limits and format version

**Files:**
- Create: `cli/src/contract/roles.ts`
- Test: `cli/test/roles.test.ts`

**Interfaces:**
- Consumes: `resolveToken`, `darkValueOf` (Task 4); `durationToMs`, `DtcgDuration` (Task 5); `TokenDocument`, `MOTIF_EXT` (Task 3); `Finding` (Task 2).
- Produces (from `src/contract/roles.ts`):
  - `CONTRACT_VERSION = 1`
  - `REQUIRED_ROLES: Record<string, { type: string; names: string[] }>` (groups `color`, `font`, `space`, `radius`, `shadow`, `duration`, `easing`)
  - `REQUIRED_SPRINGS = ["snappy", "smooth", "bouncy"]`
  - `checkRoles(doc: TokenDocument): Finding[]` — codes `missing-version`, `newer-format`, `missing-role`, `wrong-type`, `missing-dark`, `motion-range`

- [ ] **Step 1: Write the failing tests**

`cli/test/roles.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { checkRoles } from "../src/contract/roles";
import { docFrom, validTokens } from "./helpers";

const run = (mutate: (t: any) => void) => {
  const t = validTokens();
  mutate(t);
  return checkRoles(docFrom(t));
};

describe("checkRoles", () => {
  test("the valid fixture has no findings", () => {
    expect(checkRoles(docFrom(validTokens()))).toEqual([]);
  });

  test("reports a missing required role in plain words", () => {
    const f = run((t) => delete t.color.focus);
    expect(f.map((x) => [x.code, x.path])).toEqual([["missing-role", "color.focus"]]);
    expect(f[0]!.message).toBe('Your theme values are missing "color.focus". Every Motif design guide needs it.');
  });

  test("reports a role with the wrong type", () => {
    const f = run((t) => (t.space["4"] = { $type: "number", $value: 16 }));
    expect(f.map((x) => x.code)).toEqual(["wrong-type"]);
  });

  test("requires a dark value for every colour role", () => {
    const f = run((t) => delete t.color.border.$extensions);
    expect(f.map((x) => [x.code, x.path])).toEqual([["missing-dark", "color.border"]]);
  });

  test("rejects durations over 2 seconds", () => {
    const f = run((t) => (t.duration.slow.$value = { value: 5000, unit: "ms" }));
    expect(f.map((x) => [x.code, x.path])).toEqual([["motion-range", "duration.slow"]]);
  });

  test("rejects spring bounce outside -1..1", () => {
    const f = run((t) => (t.spring.bouncy.bounce.$value = 1));
    expect(f.map((x) => [x.code, x.path])).toEqual([["motion-range", "spring.bouncy.bounce"]]);
  });

  test("rejects spring durations outside 0.05–2 s", () => {
    const f = run((t) => (t.spring.snappy.duration.$value = { value: 0.01, unit: "s" }));
    expect(f.map((x) => [x.code, x.path])).toEqual([["motion-range", "spring.snappy.duration"]]);
  });

  test("requires all three springs", () => {
    const f = run((t) => delete t.spring.smooth);
    expect(f.map((x) => x.path)).toEqual(["spring.smooth.duration", "spring.smooth.bounce"]);
  });

  test("requires the format version", () => {
    const f = run((t) => delete t.$extensions["dev.motif"].motifContract);
    expect(f.map((x) => x.code)).toEqual(["missing-version"]);
  });

  test("refuses a newer format with an update message", () => {
    const f = run((t) => (t.$extensions["dev.motif"].motifContract = 2));
    expect(f.map((x) => x.code)).toEqual(["newer-format"]);
    expect(f[0]!.message).toBe("These theme values were made by a newer version of Motif (format 2). Update Motif to use them.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test test/roles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`cli/src/contract/roles.ts`:
```ts
import type { Finding } from "../findings";
import { darkValueOf, resolveToken } from "./resolve";
import { MOTIF_EXT, type TokenDocument } from "./types";
import { durationToMs, type DtcgDuration } from "./values";

export const CONTRACT_VERSION = 1;

export const REQUIRED_ROLES: Record<string, { type: string; names: string[] }> = {
  color: {
    type: "color",
    names: [
      "background", "surface", "surface-raised", "border", "text-primary", "text-secondary", "text-inverse",
      "action-primary", "on-action-primary", "action-secondary", "on-action-secondary", "focus",
      "success", "on-success", "warning", "on-warning", "danger", "on-danger", "info", "on-info",
    ],
  },
  font: { type: "typography", names: ["display", "title", "heading", "body", "label", "caption"] },
  space: { type: "dimension", names: ["0", "1", "2", "3", "4", "5", "6", "8", "10", "12", "16"] },
  radius: { type: "dimension", names: ["none", "sm", "md", "lg", "full"] },
  shadow: { type: "shadow", names: ["sm", "md", "lg"] },
  duration: { type: "duration", names: ["instant", "fast", "base", "slow"] },
  easing: { type: "cubicBezier", names: ["standard", "enter", "exit"] },
};

export const REQUIRED_SPRINGS = ["snappy", "smooth", "bouncy"];

const MAX_DURATION_MS = 2000;
const SPRING_SECONDS: [number, number] = [0.05, 2];

export function checkRoles(doc: TokenDocument): Finding[] {
  const findings: Finding[] = [];
  const add = (code: string, message: string, path?: string) =>
    findings.push({ code, severity: "error", file: doc.file, message, path, line: path ? doc.tokens.get(path)?.line : undefined });

  // Format version
  const version = (doc.rootExtensions?.[MOTIF_EXT] as { motifContract?: unknown } | undefined)?.motifContract;
  if (typeof version !== "number") {
    add("missing-version", `Your theme values don't say which Motif format they use. Add "motifContract": ${CONTRACT_VERSION} under $extensions["${MOTIF_EXT}"].`);
  } else if (version > CONTRACT_VERSION) {
    add("newer-format", `These theme values were made by a newer version of Motif (format ${version}). Update Motif to use them.`);
  }

  // Required roles: present and of the right type (resolution problems are reported by validateTokens)
  const requireRole = (path: string, type: string): unknown | undefined => {
    if (!doc.tokens.has(path)) {
      // No line: the value doesn't exist yet. The path tells the agent exactly what to add.
      findings.push({ code: "missing-role", severity: "error", file: doc.file, path, message: `Your theme values are missing "${path}". Every Motif design guide needs it.` });
      return undefined;
    }
    const r = resolveToken(doc, path);
    if (!r.ok) return undefined;
    if (r.type !== type) {
      add("wrong-type", `"${path}" should be a ${type} value, but it is "${r.type ?? "untyped"}".`, path);
      return undefined;
    }
    return r.value;
  };

  for (const [group, { type, names }] of Object.entries(REQUIRED_ROLES)) {
    for (const name of names) {
      const path = `${group}.${name}`;
      const value = requireRole(path, type);
      if (group === "duration" && value !== undefined) {
        const ms = durationToMs(value as DtcgDuration);
        if (ms > MAX_DURATION_MS) {
          add("motion-range", `"${path}" is ${ms} ms. Anything over 2 seconds feels sluggish; use ${MAX_DURATION_MS} ms or less.`, path);
        }
      }
    }
  }

  for (const name of REQUIRED_SPRINGS) {
    const dPath = `spring.${name}.duration`;
    const bPath = `spring.${name}.bounce`;
    const d = requireRole(dPath, "duration");
    const b = requireRole(bPath, "number");
    if (d !== undefined) {
      const s = durationToMs(d as DtcgDuration) / 1000;
      if (s < SPRING_SECONDS[0] || s > SPRING_SECONDS[1]) {
        add("motion-range", `"${dPath}" should be between ${SPRING_SECONDS[0]} and ${SPRING_SECONDS[1]} seconds.`, dPath);
      }
    }
    if (b !== undefined && !((b as number) > -1 && (b as number) < 1)) {
      add("motion-range", `"${bPath}" must be greater than -1 and less than 1.`, bPath);
    }
  }

  // Every colour role needs a dark-mode value
  for (const tok of doc.tokens.values()) {
    if (tok.path.startsWith("color.") && darkValueOf(doc, tok.path) === undefined) {
      add("missing-dark", `"${tok.path}" has no dark-mode value. Add one under $extensions["${MOTIF_EXT}"].modes.dark.`, tok.path);
    }
  }

  return findings;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && bun test test/roles.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/contract/roles.ts cli/test/roles.test.ts
git commit -m "feat(contract): require roles, dark values, sane motion and format version"
```

---

### Task 8: Spring maths

**Files:**
- Create: `cli/src/contract/spring.ts`
- Test: `cli/test/spring.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `src/contract/spring.ts`):
  - `interface SpringParams { duration: number; bounce: number }` (seconds; −1 < bounce < 1)
  - `interface SpringPhysics { mass: 1; stiffness: number; damping: number; dampingRatio: number }`
  - `springPhysics(p: SpringParams): SpringPhysics` — throws `RangeError` outside the allowed ranges
  - `toMotionTransition(p: SpringParams): { type: "spring"; visualDuration: number; bounce: number }`

Plan 1B (Motion output) and Part 2 adapters (Flutter, Compose, Reanimated) call these; nothing in 1A consumes them yet.

- [ ] **Step 1: Write the failing tests**

`cli/test/spring.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { springPhysics, toMotionTransition } from "../src/contract/spring";

describe("springPhysics", () => {
  test("critically damped: 0.5 s, bounce 0 (matches SwiftUI Spring(duration: 0.5, bounce: 0))", () => {
    const s = springPhysics({ duration: 0.5, bounce: 0 });
    expect(s.mass).toBe(1);
    expect(s.stiffness).toBeCloseTo(157.9137, 3);
    expect(s.damping).toBeCloseTo(25.1327, 3);
    expect(s.dampingRatio).toBeCloseTo(1, 10);
  });

  test("bouncy: damping ratio is 1 − bounce", () => {
    const s = springPhysics({ duration: 0.5, bounce: 0.3 });
    expect(s.damping).toBeCloseTo(17.5929, 3);
    expect(s.dampingRatio).toBeCloseTo(0.7, 10);
  });

  test("negative bounce is overdamped: ratio is 1 / (1 + bounce)", () => {
    const s = springPhysics({ duration: 1, bounce: -0.5 });
    expect(s.stiffness).toBeCloseTo(39.4784, 3);
    expect(s.damping).toBeCloseTo(25.1327, 3);
    expect(s.dampingRatio).toBeCloseTo(2, 10);
  });

  test("rejects impossible values", () => {
    expect(() => springPhysics({ duration: 0, bounce: 0 })).toThrow(RangeError);
    expect(() => springPhysics({ duration: 0.3, bounce: 1 })).toThrow(RangeError);
    expect(() => springPhysics({ duration: 0.3, bounce: -1 })).toThrow(RangeError);
  });
});

describe("toMotionTransition", () => {
  test("passes duration and bounce straight through", () => {
    expect(toMotionTransition({ duration: 0.4, bounce: 0.1 })).toEqual({ type: "spring", visualDuration: 0.4, bounce: 0.1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test test/spring.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`cli/src/contract/spring.ts`:
```ts
/** Canonical Motif spring: perceptual duration (seconds) + bounce, the model SwiftUI and Motion use natively. */
export interface SpringParams {
  duration: number;
  bounce: number;
}

export interface SpringPhysics {
  mass: 1;
  stiffness: number;
  damping: number;
  dampingRatio: number;
}

export function springPhysics({ duration, bounce }: SpringParams): SpringPhysics {
  if (!(duration > 0)) throw new RangeError("spring duration must be greater than 0");
  if (!(bounce > -1 && bounce < 1)) throw new RangeError("spring bounce must be greater than -1 and less than 1");
  const stiffness = (2 * Math.PI / duration) ** 2;
  const damping = bounce >= 0
    ? (4 * Math.PI * (1 - bounce)) / duration
    : (4 * Math.PI) / (duration * (1 + bounce));
  return { mass: 1, stiffness, damping, dampingRatio: damping / (2 * Math.sqrt(stiffness)) };
}

export function toMotionTransition(p: SpringParams): { type: "spring"; visualDuration: number; bounce: number } {
  return { type: "spring", visualDuration: p.duration, bounce: p.bounce };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && bun test test/spring.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/contract/spring.ts cli/test/spring.test.ts
git commit -m "feat(contract): spring physics from duration and bounce"
```

---

### Task 9: Check `DESIGN.md` (header, sections, summary)

**Files:**
- Create: `cli/src/contract/design-md.ts`
- Test: `cli/test/design-md.test.ts`

**Interfaces:**
- Consumes: `CONTRACT_VERSION` (Task 7); `Finding` (Task 2); `validDesignMd` (Task 3 helpers).
- Produces (from `src/contract/design-md.ts`):
  - `REQUIRED_SECTIONS: string[]` = `["Brief", "Direction", "Foundations", "Motion", "Components", "Patterns", "Accessibility", "Platform notes", "Do / Don't", "Change log"]`
  - `checkDesignMd(file: string, raw: string): Finding[]` — codes `missing-header` (error), `missing-version` (error), `newer-format` (error), `bad-header` (warning), `missing-section` (error), `section-order` (warning), `missing-summary` (warning)

- [ ] **Step 1: Write the failing tests**

`cli/test/design-md.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { checkDesignMd } from "../src/contract/design-md";
import { validDesignMd } from "./helpers";

const lf = () => validDesignMd().replace(/\r\n/g, "\n");
const codes = (text: string) => checkDesignMd("DESIGN.md", text).map((f) => `${f.severity}:${f.code}`);

describe("checkDesignMd", () => {
  test("the valid fixture has no findings", () => {
    expect(checkDesignMd("DESIGN.md", lf())).toEqual([]);
  });

  test("Windows line endings are fine", () => {
    expect(checkDesignMd("DESIGN.md", lf().replace(/\n/g, "\r\n"))).toEqual([]);
  });

  test("a byte-order mark is fine", () => {
    expect(checkDesignMd("DESIGN.md", "﻿" + lf())).toEqual([]);
  });

  test("reports a missing section with its name", () => {
    const f = checkDesignMd("DESIGN.md", lf().replace("## 4. Motion", "## 4. Movement"));
    expect(f.map((x) => x.code)).toEqual(["missing-section"]);
    expect(f[0]!.message).toBe('Your design guide is missing the "Motion" section.');
  });

  test("sections out of order are a warning", () => {
    const text = lf().replace("## 1. Brief", "## 1. TEMP").replace("## 2. Direction", "## 2. Brief").replace("## 1. TEMP", "## 1. Direction");
    expect(codes(text)).toEqual(["warning:section-order"]);
  });

  test("accepts headings without numbers and with a curly apostrophe", () => {
    const text = lf().replace("## 9. Do / Don't", "## Do / Don’t").replace("## 1. Brief", "## Brief");
    expect(checkDesignMd("DESIGN.md", text)).toEqual([]);
  });

  test("requires the header", () => {
    expect(codes(lf().replace(/^---[\s\S]*?\n---\n/, ""))).toContain("error:missing-header");
  });

  test("an unclosed header is reported", () => {
    expect(codes("---\nmotifContract: 1\n# Title\n")).toContain("error:missing-header");
  });

  test("refuses a newer format", () => {
    expect(codes(lf().replace("motifContract: 1", "motifContract: 2"))).toEqual(["error:newer-format"]);
  });

  test("requires the version in the header", () => {
    expect(codes(lf().replace("motifContract: 1\n", ""))).toEqual(["error:missing-version"]);
  });

  test("warns about a missing name or date", () => {
    expect(codes(lf().replace("updated: 2026-10-12", "updated: soon"))).toEqual(["warning:bad-header"]);
  });

  test("warns when there is no plain-language summary", () => {
    expect(codes(lf().replace(/Fixture App feels calm[^\n]*\n/, ""))).toEqual(["warning:missing-summary"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test test/design-md.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`cli/src/contract/design-md.ts`:
```ts
import type { Finding } from "../findings";
import { CONTRACT_VERSION } from "./roles";

export const REQUIRED_SECTIONS = [
  "Brief", "Direction", "Foundations", "Motion", "Components",
  "Patterns", "Accessibility", "Platform notes", "Do / Don't", "Change log",
];

const norm = (s: string) =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();

export function checkDesignMd(file: string, raw: string): Finding[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const findings: Finding[] = [];
  const add = (code: string, severity: "error" | "warning", message: string, line?: number) =>
    findings.push({ code, severity, file, line, message });

  // Header (YAML-style front matter between --- lines)
  let bodyStart = 0;
  if (lines[0] !== "---") {
    add("missing-header", "error", `Your design guide should start with a small header between two "---" lines that includes "motifContract: ${CONTRACT_VERSION}".`, 1);
  } else {
    const end = lines.indexOf("---", 1);
    if (end === -1) {
      add("missing-header", "error", 'The header at the top of your design guide isn\'t closed with a "---" line.', 1);
    } else {
      const header: Record<string, string> = {};
      for (const l of lines.slice(1, end)) {
        const m = l.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
        if (m) header[m[1]!] = m[2]!.trim();
      }
      const version = Number(header.motifContract);
      if (header.motifContract === undefined || !Number.isInteger(version)) {
        add("missing-version", "error", `Add "motifContract: ${CONTRACT_VERSION}" to the header of your design guide.`, 1);
      } else if (version > CONTRACT_VERSION) {
        add("newer-format", "error", `Your design guide was made by a newer version of Motif (format ${version}). Update Motif to use it.`, 1);
      }
      if (!header.name) add("bad-header", "warning", 'Add a "name:" line to the header of your design guide.', 1);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(header.updated ?? "")) {
        add("bad-header", "warning", 'Add an "updated: YYYY-MM-DD" line to the header of your design guide.', 1);
      }
      bodyStart = end + 1;
    }
  }

  // Sections (level-2 headings, optional "N." prefix)
  const found: { name: string; line: number }[] = [];
  lines.forEach((l, i) => {
    if (i < bodyStart) return;
    const m = l.match(/^##\s+(?:\d+\.\s*)?(.+?)\s*#*\s*$/);
    if (m) found.push({ name: norm(m[1]!), line: i + 1 });
  });
  const positions: number[] = [];
  for (const section of REQUIRED_SECTIONS) {
    const idx = found.findIndex((f) => f.name === norm(section));
    if (idx === -1) add("missing-section", "error", `Your design guide is missing the "${section}" section.`);
    else positions.push(idx);
  }
  if (positions.some((p, i) => i > 0 && p < positions[i - 1]!)) {
    add("section-order", "warning", `The sections of your design guide are out of order. Expected: ${REQUIRED_SECTIONS.join(", ")}.`);
  }

  // Plain-language summary before the first section
  const firstSectionLine = found[0]?.line ?? lines.length + 1;
  const summary = lines.slice(bodyStart, firstSectionLine - 1).filter((l) => l.trim() !== "" && !l.startsWith("#"));
  if (summary.length === 0) {
    add("missing-summary", "warning", "Add a short plain-language summary at the top of your design guide, before the first section.");
  }

  return findings;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && bun test test/design-md.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/contract/design-md.ts cli/test/design-md.test.ts
git commit -m "feat(contract): check DESIGN.md header, sections and summary"
```

---

### Task 10: `motif validate`

**Files:**
- Create: `cli/src/commands/validate.ts`
- Modify: `cli/src/main.ts` (register the command), `cli/test/helpers.ts` (add `copyFixture`)
- Test: `cli/test/validate.test.ts`

**Interfaces:**
- Consumes: `loadTokenDocument` (Task 3), `validateTokens` (Task 5), `checkContrast` (Task 6), `checkRoles` (Task 7), `checkDesignMd` (Task 9), `CommandResult` (Task 2), `formatFindings` (Task 2).
- Produces (from `src/commands/validate.ts`):
  - `DESIGN_MD = "DESIGN.md"`, `TOKENS_JSON = "design/tokens.json"` (display paths, always forward slashes)
  - `runValidate(cwd: string): Promise<CommandResult>` — `data` is `{ findings: Finding[]; summary: { errors: number; warnings: number; tokens: number; contrastChecks: number } }`, or `{ error: "no-contract"; missing: string[] }` with exit 2
- Produces (from `test/helpers.ts`): `copyFixture(): string` — a temp project copy whose folder name contains a space

- [ ] **Step 1: Add the `copyFixture` helper**

Append to `cli/test/helpers.ts`:
```ts
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

/** Copy the valid fixture project into a fresh temp folder. The name has a space on purpose. */
export function copyFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif test "));
  cpSync(join(FIXTURES, "contract"), dir, { recursive: true });
  return dir;
}
```
(Move the two new imports to the top of the file with the others.)

- [ ] **Step 2: Write the failing tests**

`cli/test/validate.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runValidate } from "../src/commands/validate";
import { copyFixture } from "./helpers";

describe("runValidate", () => {
  test("a valid design guide passes, even in a folder with a space", async () => {
    const dir = copyFixture();
    expect(dir).toContain(" ");
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(0);
    expect(r.text).toStartWith("✓ Your design guide is valid");
    expect(r.data.summary).toEqual({ errors: 0, warnings: 0, tokens: expect.any(Number), contrastChecks: 26 });
  });

  test("no design guide → exit 2 with a friendly message", async () => {
    const dir = copyFixture();
    rmSync(join(dir, "DESIGN.md"));
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(2);
    expect(r.data).toEqual({ error: "no-contract", missing: ["DESIGN.md"] });
    expect(r.text).toContain("Start one with /design");
  });

  test("problems → exit 1, listed with forward-slash paths", async () => {
    const dir = copyFixture();
    const p = join(dir, "design", "tokens.json");
    const t = JSON.parse(readFileSync(p, "utf8"));
    t.color.focus.$value = "{primitive.color.gray.300}";
    writeFileSync(p, JSON.stringify(t, null, 2));
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(1);
    const findings = r.data.findings as any[];
    expect(findings.map((f) => f.code)).toEqual(["low-contrast"]);
    expect(findings[0].file).toBe("design/tokens.json");
    expect(r.text).toContain("✗ design/tokens.json:");
  });

  test("invalid JSON still checks DESIGN.md", async () => {
    const dir = copyFixture();
    writeFileSync(join(dir, "design", "tokens.json"), "{ nope");
    writeFileSync(join(dir, "DESIGN.md"), "no header");
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(1);
    const codes = (r.data.findings as any[]).map((f) => f.code);
    expect(codes).toContain("invalid-json");
    expect(codes).toContain("missing-header");
  });

  test("warnings alone don't fail", async () => {
    const dir = copyFixture();
    const p = join(dir, "DESIGN.md");
    writeFileSync(p, readFileSync(p, "utf8").replace(/Fixture App feels calm[^\n]*\n/, ""));
    const r = await runValidate(dir);
    expect(r.exitCode).toBe(0);
    expect((r.data.summary as any).warnings).toBe(1);
    expect(r.text).toContain("⚠ DESIGN.md");
  });

  test("motif validate --json works end to end", () => {
    const dir = copyFixture();
    const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "../src/main.ts"), "validate", "--json", "--cwd", dir]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout.toString())).toMatchObject({ command: "validate", ok: true, exitCode: 0 });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd cli && bun test test/validate.test.ts`
Expected: FAIL — `../src/commands/validate` not found.

- [ ] **Step 4: Implement**

`cli/src/commands/validate.ts`:
```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CommandResult } from "../cli/output";
import { checkContrast } from "../contract/contrast";
import { checkDesignMd } from "../contract/design-md";
import { loadTokenDocument } from "../contract/load";
import { checkRoles } from "../contract/roles";
import { validateTokens } from "../contract/tokens";
import { formatFindings, type Finding } from "../findings";

export const DESIGN_MD = "DESIGN.md";
export const TOKENS_JSON = "design/tokens.json";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function runValidate(cwd: string): Promise<CommandResult> {
  const mdPath = join(cwd, DESIGN_MD);
  const tokensPath = join(cwd, "design", "tokens.json");
  const missing = [
    ...(existsSync(mdPath) ? [] : [DESIGN_MD]),
    ...(existsSync(tokensPath) ? [] : [TOKENS_JSON]),
  ];
  if (missing.length > 0) {
    return {
      command: "validate",
      exitCode: 2,
      text: `No design guide found in this folder (missing ${missing.join(" and ")}).\nStart one with /design, or run this inside your app's folder.`,
      data: { error: "no-contract", missing },
    };
  }

  const { doc, findings: loadFindings } = loadTokenDocument(TOKENS_JSON, readFileSync(tokensPath, "utf8"));
  const findings: Finding[] = [...loadFindings];
  let contrastChecks = 0;
  if (doc) {
    findings.push(...validateTokens(doc), ...checkRoles(doc));
    const contrast = checkContrast(doc);
    findings.push(...contrast.findings);
    contrastChecks = contrast.checked;
  }
  findings.push(...checkDesignMd(DESIGN_MD, readFileSync(mdPath, "utf8")));

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const tokens = doc?.tokens.size ?? 0;

  let text: string;
  if (errors > 0) {
    text = `✗ Your design guide has ${plural(errors, "problem", "problems")}${warnings ? ` and ${plural(warnings, "suggestion", "suggestions")}` : ""}:\n`
      + `${formatFindings(findings)}\n`
      + `Fix these, or ask your agent: "fix my design guide".`;
  } else {
    text = `✓ Your design guide is valid — ${tokens} theme values and ${contrastChecks} readability checks (light + dark) passed.`
      + (warnings ? `\n${plural(warnings, "suggestion", "suggestions")}:\n${formatFindings(findings)}` : "");
  }

  return {
    command: "validate",
    exitCode: errors > 0 ? 1 : 0,
    text,
    data: { findings, summary: { errors, warnings, tokens, contrastChecks } },
  };
}
```

Register the command in `cli/src/main.ts`:
```ts
import { runValidate } from "./commands/validate";
```
and change the command table to:
```ts
const COMMANDS: Record<string, Runner> = {
  validate: runValidate,
};
```

- [ ] **Step 5: Run all tests and typecheck**

Run: `cd cli && bun test && bun run typecheck`
Expected: all PASS.

- [ ] **Step 6: Smoke-test the compiled binary**

Run: `cd cli && bun run build && ../dist/motif validate --cwd test/fixtures/contract`
Expected: `✓ Your design guide is valid — … theme values and 26 readability checks (light + dark) passed.` and exit code 0.

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/validate.ts cli/src/main.ts cli/test/helpers.ts cli/test/validate.test.ts
git commit -m "feat(cli): motif validate"
```

---

### Task 11: Detect apps and their stacks (all 8)

**Files:**
- Create: `cli/src/detect/stacks.ts`
- Test: `cli/test/stacks.test.ts`

**Interfaces:**
- Consumes: `Finding` (Task 2).
- Produces (from `src/detect/stacks.ts`):
  - `type StackId = "react-web" | "vue" | "svelte" | "angular" | "react-native" | "flutter" | "swiftui" | "compose"`
  - `STACK_IDS: readonly StackId[]`
  - `STACK_LABELS: Record<StackId, string>` (e.g. `"react-web": "React (web)"`)
  - `ADAPTERS_AVAILABLE: readonly StackId[]` = `["react-web"]` (Part 2 adds the rest)
  - `NODE_STACKS: readonly StackId[]` = `["react-web", "vue", "svelte", "angular", "react-native"]`
  - `detectStack(dir: string): StackId | null`
  - `interface AppInfo { path: string; stack: StackId | null; source: "motif.json" | "detected" }` (`path` relative to root, forward slashes, `"."` for the root)
  - `detectApps(root: string): { apps: AppInfo[]; findings: Finding[] }`

Detection rules (first match wins, in this order):

| Stack | Rule |
|---|---|
| angular | `package.json` depends on `@angular/core` |
| vue | depends on `nuxt` or `vue` |
| svelte | depends on `@sveltejs/kit` or `svelte` |
| react-native | depends on `expo` or `react-native` |
| react-web | depends on `react` |
| flutter | `pubspec.yaml` contains `sdk: flutter` or a top-level `flutter:` key |
| compose | `build.gradle(.kts)`, `app/build.gradle(.kts)` or `settings.gradle(.kts)` mentions `androidx.compose` or `compose = true` / `compose true` |
| swiftui | `Package.swift` or a `*.xcodeproj` folder exists **and** a `.swift` file within 4 folder levels (max 2000 files scanned, skipping `Pods`, `.build`, `DerivedData`, hidden folders) contains `import SwiftUI` |

`detectApps` order: if `design/motif.json` exists, use its `apps` (validating paths and stack ids). Otherwise check the root; if the root isn't an app, check direct subfolders of the root, `apps/`, and `packages/`. Never descend into `node_modules` or hidden folders.

- [ ] **Step 1: Write the failing tests**

`cli/test/stacks.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { detectApps, detectStack } from "../src/detect/stacks";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "motif-detect-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}
const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) =>
  JSON.stringify({ dependencies: deps, devDependencies: dev });

describe("detectStack", () => {
  test.each([
    ["angular", { "package.json": pkg({ "@angular/core": "^18" }) }],
    ["vue", { "package.json": pkg({ nuxt: "^3" }) }],
    ["vue", { "package.json": pkg({ vue: "^3" }) }],
    ["svelte", { "package.json": pkg({}, { "@sveltejs/kit": "^2" }) }],
    ["react-native", { "package.json": pkg({ expo: "^52", react: "^18" }) }],
    ["react-web", { "package.json": pkg({ next: "^15", react: "^19" }) }],
    ["flutter", { "pubspec.yaml": "name: app\ndependencies:\n  flutter:\n    sdk: flutter\n" }],
    ["compose", { "app/build.gradle.kts": "android {\n  buildFeatures {\n    compose = true\n  }\n}\n" }],
    ["compose", { "build.gradle": "implementation 'androidx.compose.ui:ui:1.7.0'\n" }],
    ["swiftui", { "Package.swift": "// swift-tools-version:5.9", "Sources/App/App.swift": "import SwiftUI\n@main struct A: App {}" }],
    ["swiftui", { "Demo.xcodeproj/project.pbxproj": "", "Demo/ContentView.swift": "import SwiftUI" }],
  ])("detects %s", (stack, files) => {
    expect(detectStack(project(files as Record<string, string>))).toBe(stack as any);
  });

  test("a UIKit-only Xcode project is not SwiftUI", () => {
    expect(detectStack(project({ "Demo.xcodeproj/project.pbxproj": "", "Demo/VC.swift": "import UIKit" }))).toBeNull();
  });

  test("an empty folder has no stack", () => {
    expect(detectStack(project({}))).toBeNull();
  });

  test("a broken package.json doesn't crash", () => {
    expect(detectStack(project({ "package.json": "{ nope" }))).toBeNull();
  });
});

describe("detectApps", () => {
  test("the root is the app when it has a stack", () => {
    const root = project({ "package.json": pkg({ react: "^19" }) });
    expect(detectApps(root).apps).toEqual([{ path: ".", stack: "react-web", source: "detected" }]);
  });

  test("finds apps in a monorepo (apps/web + apps/mobile)", () => {
    const root = project({
      "package.json": pkg({}),
      "apps/web/package.json": pkg({ react: "^19" }),
      "apps/mobile/pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n",
    });
    expect(detectApps(root).apps).toEqual([
      { path: "apps/mobile", stack: "flutter", source: "detected" },
      { path: "apps/web", stack: "react-web", source: "detected" },
    ]);
  });

  test("never treats node_modules packages as apps", () => {
    const root = project({ "node_modules/react/package.json": pkg({ react: "^19" }) });
    expect(detectApps(root).apps).toEqual([]);
  });

  test("uses design/motif.json when present", () => {
    const root = project({
      "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: "web", stack: "react-web" }] }),
    });
    expect(detectApps(root)).toEqual({ apps: [{ path: "web", stack: "react-web", source: "motif.json" }], findings: [] });
  });

  test("reports an unknown stack in motif.json", () => {
    const root = project({ "design/motif.json": JSON.stringify({ apps: [{ path: ".", stack: "cobol" }] }) });
    const { apps, findings } = detectApps(root);
    expect(apps).toEqual([{ path: ".", stack: null, source: "motif.json" }]);
    expect(findings.map((f) => f.code)).toEqual(["bad-settings"]);
  });

  test("reports broken motif.json and falls back to detection", () => {
    const root = project({ "design/motif.json": "{ nope", "package.json": pkg({ react: "^19" }) });
    const { apps, findings } = detectApps(root);
    expect(apps).toEqual([{ path: ".", stack: "react-web", source: "detected" }]);
    expect(findings.map((f) => f.code)).toEqual(["bad-settings"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test test/stacks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`cli/src/detect/stacks.ts`:
```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Finding } from "../findings";

export const STACK_IDS = ["react-web", "vue", "svelte", "angular", "react-native", "flutter", "swiftui", "compose"] as const;
export type StackId = (typeof STACK_IDS)[number];

export const STACK_LABELS: Record<StackId, string> = {
  "react-web": "React (web)",
  vue: "Vue / Nuxt",
  svelte: "Svelte / SvelteKit",
  angular: "Angular",
  "react-native": "React Native (Expo)",
  flutter: "Flutter",
  swiftui: "SwiftUI",
  compose: "Jetpack Compose",
};

export const ADAPTERS_AVAILABLE: readonly StackId[] = ["react-web"];
export const NODE_STACKS: readonly StackId[] = ["react-web", "vue", "svelte", "angular", "react-native"];

const SKIP_DIRS = new Set(["node_modules", "Pods", ".build", "DerivedData", "build", "dist"]);
const SWIFT_MAX_DEPTH = 4;
const SWIFT_MAX_FILES = 2000;

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function packageDeps(dir: string): Set<string> | null {
  const text = readText(join(dir, "package.json"));
  if (text === null) return null;
  try {
    const pkg = JSON.parse(text);
    return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  } catch {
    return null;
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function hasSwiftUIImport(dir: string): boolean {
  let scanned = 0;
  const visit = (d: string, depth: number): boolean => {
    if (depth > SWIFT_MAX_DEPTH || scanned >= SWIFT_MAX_FILES) return false;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return false;
    }
    for (const name of entries) {
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const p = join(d, name);
      if (name.endsWith(".swift")) {
        scanned++;
        if (readText(p)?.includes("import SwiftUI")) return true;
        if (scanned >= SWIFT_MAX_FILES) return false;
      } else if (isDir(p) && visit(p, depth + 1)) {
        return true;
      }
    }
    return false;
  };
  return visit(dir, 0);
}

export function detectStack(dir: string): StackId | null {
  const deps = packageDeps(dir);
  if (deps) {
    if (deps.has("@angular/core")) return "angular";
    if (deps.has("nuxt") || deps.has("vue")) return "vue";
    if (deps.has("@sveltejs/kit") || deps.has("svelte")) return "svelte";
    if (deps.has("expo") || deps.has("react-native")) return "react-native";
    if (deps.has("react")) return "react-web";
  }

  const pubspec = readText(join(dir, "pubspec.yaml"));
  if (pubspec && (/sdk:\s*flutter/.test(pubspec) || /^flutter:/m.test(pubspec))) return "flutter";

  const gradleFiles = ["build.gradle.kts", "build.gradle", "app/build.gradle.kts", "app/build.gradle", "settings.gradle.kts", "settings.gradle"];
  for (const f of gradleFiles) {
    const g = readText(join(dir, f));
    if (g && (g.includes("androidx.compose") || /compose\s*(=\s*)?true/.test(g))) return "compose";
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const looksLikeSwift = entries.includes("Package.swift") || entries.some((e) => e.endsWith(".xcodeproj"));
  if (looksLikeSwift && hasSwiftUIImport(dir)) return "swiftui";

  return null;
}

const rel = (path: string) => path.replace(/\\/g, "/");

function readSettings(root: string): { apps: AppInfo[] | null; findings: Finding[] } {
  const file = "design/motif.json";
  const text = readText(join(root, "design", "motif.json"));
  if (text === null) return { apps: null, findings: [] };
  const bad = (message: string): Finding => ({ code: "bad-settings", severity: "error", file, message });
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { apps: null, findings: [bad("design/motif.json isn't valid JSON, so Motif detected your apps instead.")] };
  }
  if (!Array.isArray(parsed?.apps)) {
    return { apps: null, findings: [bad('design/motif.json needs an "apps" list, so Motif detected your apps instead.')] };
  }
  const findings: Finding[] = [];
  const apps: AppInfo[] = parsed.apps.map((a: any) => {
    const stack = (STACK_IDS as readonly string[]).includes(a?.stack) ? (a.stack as StackId) : null;
    if (!stack) findings.push(bad(`Unknown stack "${String(a?.stack)}" for "${String(a?.path)}". Use one of: ${STACK_IDS.join(", ")}.`));
    return { path: rel(String(a?.path ?? ".")), stack, source: "motif.json" as const };
  });
  return { apps, findings };
}

export interface AppInfo {
  path: string;
  stack: StackId | null;
  source: "motif.json" | "detected";
}

export function detectApps(root: string): { apps: AppInfo[]; findings: Finding[] } {
  const settings = readSettings(root);
  if (settings.apps) return { apps: settings.apps, findings: settings.findings };

  const rootStack = detectStack(root);
  if (rootStack) return { apps: [{ path: ".", stack: rootStack, source: "detected" }], findings: settings.findings };

  const apps: AppInfo[] = [];
  const scan = (base: string) => {
    let entries: string[];
    try {
      entries = readdirSync(join(root, base)).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const relPath = base ? `${base}/${name}` : name;
      const abs = join(root, relPath);
      if (!isDir(abs)) continue;
      const stack = detectStack(abs);
      if (stack) apps.push({ path: rel(relPath), stack, source: "detected" });
    }
  };
  scan("");
  if (existsSync(join(root, "apps"))) scan("apps");
  if (existsSync(join(root, "packages"))) scan("packages");
  apps.sort((a, b) => a.path.localeCompare(b.path));
  return { apps, findings: settings.findings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && bun test test/stacks.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/detect/stacks.ts cli/test/stacks.test.ts
git commit -m "feat(detect): detect apps and all 8 stacks, honouring design/motif.json"
```

---

### Task 12: Browser finder, configured sources, and `motif doctor`

**Files:**
- Create: `cli/src/detect/browser.ts`, `cli/src/detect/sources.ts`, `cli/src/commands/doctor.ts`
- Modify: `cli/src/main.ts` (register `doctor`)
- Test: `cli/test/browser.test.ts`, `cli/test/sources.test.ts`, `cli/test/doctor.test.ts`

**Interfaces:**
- Consumes: `detectApps`, `ADAPTERS_AVAILABLE`, `NODE_STACKS`, `STACK_LABELS`, `AppInfo` (Task 11); `runValidate` (Task 10); `VERSION`, `CommandResult` (Task 2); `copyFixture` (Task 10 helpers).
- Produces (from `src/detect/browser.ts`):
  - `interface BrowserInfo { name: "Chrome" | "Edge" | "Chromium" | "Custom"; path: string }`
  - `interface BrowserEnv { platform: NodeJS.Platform; env: Record<string, string | undefined>; home: string; exists: (path: string) => boolean; which: (cmd: string) => string | null }`
  - `defaultBrowserEnv(): BrowserEnv`, `browserCandidates(e: BrowserEnv): BrowserInfo[]`, `findBrowser(e?: BrowserEnv): BrowserInfo | null` (honours `MOTIF_BROWSER`)
- Produces (from `src/detect/sources.ts`):
  - `type SourceId = "refero" | "21st" | "60fps" | "motion"`; `SOURCE_LABELS: Record<SourceId, string>`
  - `interface ConfiguredSource { id: SourceId; server: string; where: string }`
  - `findConfiguredSources(cwd: string, home: string): ConfiguredSource[]` — reads Claude Code configs only (`<cwd>/.mcp.json`, `~/.claude.json` top-level and per-project); Plan 1D replaces the name patterns with the verified MCP names; Part 3 adds other agents
- Produces (from `src/commands/doctor.ts`):
  - `interface DoctorItem { id: string; status: "ok" | "optional" | "needed"; label: string; detail: string }`
  - `interface DoctorDeps { platform: NodeJS.Platform; arch: string; home: string; findBrowser: () => BrowserInfo | null; which: (cmd: string) => string | null }`
  - `defaultDoctorDeps(): DoctorDeps`, `runDoctor(cwd: string, deps?: DoctorDeps): Promise<CommandResult>` — always exit 0; `data = { items: DoctorItem[]; apps: AppInfo[] }`

- [ ] **Step 1: Write the failing tests**

`cli/test/browser.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { findBrowser, type BrowserEnv } from "../src/detect/browser";

const env = (over: Partial<BrowserEnv> & { present?: string[] }): BrowserEnv => ({
  platform: "linux",
  env: {},
  home: "/home/u",
  which: () => null,
  ...over,
  exists: (p) => (over.present ?? []).includes(p),
});

describe("findBrowser", () => {
  test("Windows: finds Chrome under Program Files", () => {
    const path = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    expect(findBrowser(env({ platform: "win32", env: { ProgramFiles: "C:\\Program Files" }, present: [path] })))
      .toEqual({ name: "Chrome", path });
  });

  test("Windows: falls back to Edge", () => {
    const path = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    expect(findBrowser(env({ platform: "win32", env: { "ProgramFiles(x86)": "C:\\Program Files (x86)" }, present: [path] })))
      .toEqual({ name: "Edge", path });
  });

  test("macOS: finds Chrome in the user's Applications folder", () => {
    const path = "/Users/u/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    expect(findBrowser(env({ platform: "darwin", home: "/Users/u", present: [path] }))).toEqual({ name: "Chrome", path });
  });

  test("Linux: uses whichever browser command exists", () => {
    const e = env({ which: (c) => (c === "chromium" ? "/usr/bin/chromium" : null), present: ["/usr/bin/chromium"] });
    expect(findBrowser(e)).toEqual({ name: "Chromium", path: "/usr/bin/chromium" });
  });

  test("MOTIF_BROWSER wins when it exists", () => {
    expect(findBrowser(env({ env: { MOTIF_BROWSER: "/opt/b" }, present: ["/opt/b"] }))).toEqual({ name: "Custom", path: "/opt/b" });
  });

  test("returns null when nothing is installed", () => {
    expect(findBrowser(env({}))).toBeNull();
  });
});
```

`cli/test/sources.test.ts`:
```ts
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

  test("broken config files are ignored", () => {
    const cwd = tmp();
    const home = tmp();
    writeFileSync(join(cwd, ".mcp.json"), "{ nope");
    writeFileSync(join(home, ".claude.json"), "{ nope");
    expect(findConfiguredSources(cwd, home)).toEqual([]);
  });
});
```

`cli/test/doctor.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor, type DoctorDeps, type DoctorItem } from "../src/commands/doctor";
import { copyFixture } from "./helpers";

const deps = (over: Partial<DoctorDeps> = {}): DoctorDeps => ({
  platform: "linux",
  arch: "x64",
  home: mkdtempSync(join(tmpdir(), "motif-home-")),
  findBrowser: () => null,
  which: () => null,
  ...over,
});
const item = (items: DoctorItem[], id: string) => items.find((i) => i.id === id);

describe("runDoctor", () => {
  test("an empty folder: friendly, no crash, exit 0", async () => {
    const r = await runDoctor(mkdtempSync(join(tmpdir(), "motif-empty-")), deps());
    const items = r.data.items as DoctorItem[];
    expect(r.exitCode).toBe(0);
    expect(item(items, "app")).toMatchObject({ status: "optional" });
    expect(item(items, "browser")).toMatchObject({ status: "needed" });
    expect(item(items, "guide")).toMatchObject({ status: "optional" });
    expect(item(items, "sources")).toMatchObject({ status: "optional" });
    expect(item(items, "node")).toBeUndefined();
    expect(r.text).toStartWith("Motif doctor");
  });

  test("a React app with a valid guide, a browser and Node", async () => {
    const dir = copyFixture();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    const r = await runDoctor(dir, deps({
      findBrowser: () => ({ name: "Edge", path: "C:\\edge.exe" }),
      which: (c) => (c === "node" ? "/usr/bin/node" : null),
    }));
    const items = r.data.items as DoctorItem[];
    expect(item(items, "app:.")).toMatchObject({ status: "ok", detail: "Full support for React (web)." });
    expect(item(items, "browser")).toMatchObject({ status: "ok", detail: "Using Edge." });
    expect(item(items, "node")).toMatchObject({ status: "ok" });
    expect(item(items, "guide")).toMatchObject({ status: "ok", detail: "Valid." });
  });

  test("a Flutter app is detected but marked as coming soon", async () => {
    const dir = mkdtempSync(join(tmpdir(), "motif-flutter-"));
    writeFileSync(join(dir, "pubspec.yaml"), "dependencies:\n  flutter:\n    sdk: flutter\n");
    const r = await runDoctor(dir, deps());
    const app = item(r.data.items as DoctorItem[], "app:.")!;
    expect(app.status).toBe("optional");
    expect(app.detail).toContain("Flutter detected");
  });

  test("a design guide with problems is flagged", async () => {
    const dir = copyFixture();
    const p = join(dir, "design", "tokens.json");
    const t = JSON.parse(readFileSync(p, "utf8"));
    delete t.color.focus;
    writeFileSync(p, JSON.stringify(t));
    const r = await runDoctor(dir, deps());
    expect(item(r.data.items as DoctorItem[], "guide")).toMatchObject({ status: "needed" });
  });

  test("lists connected design sources", async () => {
    const dir = mkdtempSync(join(tmpdir(), "motif-src-"));
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { refero: { url: "https://x" } } }));
    const r = await runDoctor(dir, deps());
    expect(item(r.data.items as DoctorItem[], "sources")).toMatchObject({ status: "ok", detail: "Connected: Refero." });
  });

  test("motif doctor --json works end to end", () => {
    const dir = mkdtempSync(join(tmpdir(), "motif-e2e-"));
    const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "../src/main.ts"), "doctor", "--json", "--cwd", dir]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout.toString())).toMatchObject({ command: "doctor", ok: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test test/browser.test.ts test/sources.test.ts test/doctor.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `browser.ts`**

`cli/src/detect/browser.ts`:
```ts
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";

export interface BrowserInfo {
  name: "Chrome" | "Edge" | "Chromium" | "Custom";
  path: string;
}

export interface BrowserEnv {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  home: string;
  exists: (path: string) => boolean;
  which: (cmd: string) => string | null;
}

export function defaultBrowserEnv(): BrowserEnv {
  return { platform: process.platform, env: process.env, home: homedir(), exists: existsSync, which: (c) => Bun.which(c) };
}

export function browserCandidates(e: BrowserEnv): BrowserInfo[] {
  if (e.platform === "win32") {
    const j = win32.join;
    const pf = e.env["ProgramFiles"] ?? "C:\\Program Files";
    const pf86 = e.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const local = e.env["LOCALAPPDATA"] ?? j(e.home, "AppData", "Local");
    return [
      { name: "Chrome", path: j(pf, "Google", "Chrome", "Application", "chrome.exe") },
      { name: "Chrome", path: j(pf86, "Google", "Chrome", "Application", "chrome.exe") },
      { name: "Chrome", path: j(local, "Google", "Chrome", "Application", "chrome.exe") },
      { name: "Edge", path: j(pf86, "Microsoft", "Edge", "Application", "msedge.exe") },
      { name: "Edge", path: j(pf, "Microsoft", "Edge", "Application", "msedge.exe") },
    ];
  }
  if (e.platform === "darwin") {
    const j = posix.join;
    return ["/Applications", j(e.home, "Applications")].flatMap((dir): BrowserInfo[] => [
      { name: "Chrome", path: j(dir, "Google Chrome.app", "Contents", "MacOS", "Google Chrome") },
      { name: "Edge", path: j(dir, "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge") },
      { name: "Chromium", path: j(dir, "Chromium.app", "Contents", "MacOS", "Chromium") },
    ]);
  }
  const commands: [BrowserInfo["name"], string][] = [
    ["Chrome", "google-chrome"], ["Chrome", "google-chrome-stable"],
    ["Chromium", "chromium"], ["Chromium", "chromium-browser"],
    ["Edge", "microsoft-edge"], ["Edge", "microsoft-edge-stable"],
  ];
  return commands.flatMap(([name, cmd]): BrowserInfo[] => {
    const path = e.which(cmd);
    return path ? [{ name, path }] : [];
  });
}

export function findBrowser(e: BrowserEnv = defaultBrowserEnv()): BrowserInfo | null {
  const override = e.env.MOTIF_BROWSER;
  if (override && e.exists(override)) return { name: "Custom", path: override };
  return browserCandidates(e).find((b) => e.exists(b.path)) ?? null;
}
```

- [ ] **Step 4: Implement `sources.ts`**

`cli/src/detect/sources.ts`:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SourceId = "refero" | "21st" | "60fps" | "motion";

export const SOURCE_LABELS: Record<SourceId, string> = {
  refero: "Refero",
  "21st": "21st.dev",
  "60fps": "60fps",
  motion: "Motion",
};

/** Provisional patterns matched against "<server name>\n<server config JSON>". Plan 1D pins verified names. */
const SOURCE_PATTERNS: Record<SourceId, RegExp> = {
  refero: /refero/i,
  "21st": /21st/i,
  "60fps": /60fps/i,
  motion: /^motion$|motion\.dev|motion-?mcp/im,
};

export interface ConfiguredSource {
  id: SourceId;
  server: string;
  where: string;
}

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const normPath = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

export function findConfiguredSources(cwd: string, home: string): ConfiguredSource[] {
  const servers: { name: string; def: unknown; where: string }[] = [];
  const addAll = (map: unknown, where: string) => {
    if (map && typeof map === "object") {
      for (const [name, def] of Object.entries(map)) servers.push({ name, def, where });
    }
  };

  addAll(readJson(join(cwd, ".mcp.json"))?.mcpServers, ".mcp.json");
  const user = readJson(join(home, ".claude.json"));
  addAll(user?.mcpServers, "~/.claude.json");
  for (const [projectPath, project] of Object.entries(user?.projects ?? {})) {
    if (normPath(projectPath) === normPath(cwd)) addAll((project as any)?.mcpServers, "~/.claude.json (this project)");
  }

  const found: ConfiguredSource[] = [];
  for (const s of servers) {
    const text = `${s.name}\n${JSON.stringify(s.def)}`;
    for (const id of Object.keys(SOURCE_PATTERNS) as SourceId[]) {
      if (SOURCE_PATTERNS[id].test(text) && !found.some((f) => f.id === id)) {
        found.push({ id, server: s.name, where: s.where });
      }
    }
  }
  return found;
}
```

- [ ] **Step 5: Implement `doctor.ts`**

`cli/src/commands/doctor.ts`:
```ts
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CommandResult } from "../cli/output";
import { findBrowser, type BrowserInfo } from "../detect/browser";
import { findConfiguredSources, SOURCE_LABELS } from "../detect/sources";
import { ADAPTERS_AVAILABLE, detectApps, NODE_STACKS, STACK_LABELS } from "../detect/stacks";
import { VERSION } from "../version";
import { runValidate } from "./validate";

export interface DoctorItem {
  id: string;
  status: "ok" | "optional" | "needed";
  label: string;
  detail: string;
}

export interface DoctorDeps {
  platform: NodeJS.Platform;
  arch: string;
  home: string;
  findBrowser: () => BrowserInfo | null;
  which: (cmd: string) => string | null;
}

export function defaultDoctorDeps(): DoctorDeps {
  return {
    platform: process.platform,
    arch: process.arch,
    home: homedir(),
    findBrowser: () => findBrowser(),
    which: (c) => Bun.which(c),
  };
}

const SYMBOL: Record<DoctorItem["status"], string> = { ok: "✓", optional: "○", needed: "✗" };

export async function runDoctor(cwd: string, deps: DoctorDeps = defaultDoctorDeps()): Promise<CommandResult> {
  const items: DoctorItem[] = [];
  const push = (id: string, status: DoctorItem["status"], label: string, detail: string) =>
    items.push({ id, status, label, detail });

  push("tool", "ok", "Motif tool", `Version ${VERSION} (${deps.platform}-${deps.arch}).`);

  const { apps, findings } = detectApps(cwd);
  for (const f of findings) push("settings", "needed", "Project settings", f.message);
  if (apps.length === 0) {
    push("app", "optional", "Your app", "No app found in this folder yet. That's fine — /design can start a new one.");
  }
  for (const app of apps) {
    const label = `App (${app.path === "." ? "this folder" : app.path})`;
    if (!app.stack) {
      push(`app:${app.path}`, "needed", label, "Motif couldn't tell which framework this app uses. Add it to design/motif.json.");
    } else if (ADAPTERS_AVAILABLE.includes(app.stack)) {
      push(`app:${app.path}`, "ok", label, `Full support for ${STACK_LABELS[app.stack]}.`);
    } else {
      push(`app:${app.path}`, "optional", label, `${STACK_LABELS[app.stack]} detected. Full support is coming soon; Motif will still help using general guidance.`);
    }
  }

  const browser = deps.findBrowser();
  if (browser) push("browser", "ok", "Screenshots and previews", `Using ${browser.name}.`);
  else push("browser", "needed", "Screenshots and previews", "No Chrome or Edge found. Motif can download a browser the first time you need screenshots (it will ask first).");

  if (apps.some((a) => a.stack && NODE_STACKS.includes(a.stack))) {
    if (deps.which("node")) push("node", "ok", "Node.js", "Found. Your app needs it to run (Motif itself doesn't).");
    else push("node", "needed", "Node.js", "Not found. Your app needs Node.js to run — install it from nodejs.org.");
  }

  const hasGuide = existsSync(join(cwd, "DESIGN.md")) && existsSync(join(cwd, "design", "tokens.json"));
  if (!hasGuide) {
    push("guide", "optional", "Design guide", "None yet — /design will create one.");
  } else {
    const v = await runValidate(cwd);
    if (v.exitCode === 0) push("guide", "ok", "Design guide", "Valid.");
    else {
      const errors = (v.data.summary as { errors: number }).errors;
      push("guide", "needed", "Design guide", `Has ${errors} ${errors === 1 ? "problem" : "problems"}. Run "motif validate" to see them.`);
    }
  }

  const sources = findConfiguredSources(cwd, deps.home);
  if (sources.length > 0) push("sources", "ok", "Design sources", `Connected: ${sources.map((s) => SOURCE_LABELS[s.id]).join(", ")}.`);
  else push("sources", "optional", "Design sources", 'None connected. Everything works without them; you can add them later with "motif connect".');

  const text = ["Motif doctor", ...items.map((i) => `  ${SYMBOL[i.status]} ${i.label} — ${i.detail}`)].join("\n");
  return { command: "doctor", exitCode: 0, text, data: { items, apps } };
}
```

Register in `cli/src/main.ts`:
```ts
import { runDoctor } from "./commands/doctor";
```
```ts
const COMMANDS: Record<string, Runner> = {
  doctor: (cwd) => runDoctor(cwd),
  validate: runValidate,
};
```

- [ ] **Step 6: Run all tests and typecheck**

Run: `cd cli && bun test && bun run typecheck`
Expected: all PASS.

- [ ] **Step 7: Try it on a real folder**

Run: `cd cli && bun run build && ../dist/motif doctor --cwd ~` (Windows: `..\dist\motif.exe doctor --cwd $HOME`)
Expected: returns within a couple of seconds, exit 0, plain lines starting `✓`/`○`/`✗`, no stack trace.

- [ ] **Step 8: Commit**

```bash
git add cli/src/detect/browser.ts cli/src/detect/sources.ts cli/src/commands/doctor.ts cli/src/main.ts cli/test/browser.test.ts cli/test/sources.test.ts cli/test/doctor.test.ts
git commit -m "feat(cli): motif doctor with browser, stack and source detection"
```

---

### Task 13: Bootstrap scripts (download once, verify, cache, run)

**Files:**
- Create: `skill/bin/motif` (POSIX sh), `skill/bin/motif.ps1` (Windows PowerShell 5.1+), `skill/bin/motif.cmd` (cmd shim), `.gitattributes`
- Test: `cli/test/bootstrap.test.ts`

**Interfaces:**
- Consumes: `skill/VERSION` (Task 2); the compiled binary's `--version` and unknown-command behaviour (Task 2).
- Produces: the only entry points the skill will use (Plan 1D):
  - macOS / Linux / Git Bash: `<skill>/bin/motif <args>`
  - Windows PowerShell or cmd: `<skill>/bin/motif.cmd <args>` (wraps `powershell -NoProfile -ExecutionPolicy Bypass -File motif.ps1`, because Windows blocks unsigned scripts by default)
- Environment variables (all optional): `MOTIF_BIN` (use this binary, no download — development), `MOTIF_HOME` (cache root, default `~/.motif`), `MOTIF_REPO` (default `7mxd/motif`), `MOTIF_DOWNLOAD_BASE` (default `https://github.com/<repo>/releases/download/v<version>`; tests point it at a local server).

Behaviour (both scripts): if `<MOTIF_HOME>/bin/<version>/motif[.exe]` exists, run it. Otherwise download the asset and `SHA256SUMS` into a temp folder, compare hashes, and only then move the binary into the cache (via a `.partial` name and a same-folder rename, so an interrupted copy is never executed). Any failure: one plain sentence on stderr, exit 2, nothing new in the cache. Arguments and exit codes pass straight through.

- [ ] **Step 1: Write the failing test**

`cli/test/bootstrap.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO_ROOT, "skill/VERSION"), "utf8").trim();
const isWin = process.platform === "win32";
const OS = isWin ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
const ARCH = isWin ? "x64" : process.arch === "arm64" ? "arm64" : "x64";
const ASSET = `motif-${OS}-${ARCH}${isWin ? ".exe" : ""}`;
const slash = (p: string) => p.replace(/\\/g, "/");

let builtPath = "";
let binary: Uint8Array;
let server: ReturnType<typeof Bun.serve>;
let hits = 0;

beforeAll(() => {
  builtPath = join(mkdtempSync(join(tmpdir(), "motif-build-")), isWin ? "motif.exe" : "motif");
  const build = Bun.spawnSync([process.execPath, "build", "--compile", join(REPO_ROOT, "cli/src/main.ts"), "--outfile", builtPath]);
  if (build.exitCode !== 0) throw new Error(build.stderr.toString());
  binary = readFileSync(builtPath);
  const goodSums = `${createHash("sha256").update(binary).digest("hex")}  ${ASSET}\n`;
  const badSums = `${"0".repeat(64)}  ${ASSET}\n`;
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === `/ok/${ASSET}` || path === `/bad/${ASSET}`) {
        hits++;
        return new Response(binary);
      }
      if (path === "/ok/SHA256SUMS") return new Response(goodSums);
      if (path === "/bad/SHA256SUMS") return new Response(badSums);
      return new Response("not found", { status: 404 });
    },
  });
}, 180_000);

afterAll(() => server?.stop(true));

const sh = Bun.which("sh");
const RUNNERS = [
  { name: "posix sh", available: Boolean(sh), cmd: (a: string[]) => [sh!, join(REPO_ROOT, "skill/bin/motif"), ...a] },
  { name: "windows cmd → powershell", available: isWin, cmd: (a: string[]) => ["cmd", "/c", join(REPO_ROOT, "skill/bin/motif.cmd"), ...a] },
];

for (const runner of RUNNERS) {
  describe.skipIf(!runner.available)(`bootstrap via ${runner.name}`, () => {
    const freshHome = () => slash(mkdtempSync(join(tmpdir(), "motif-home-")));
    const cached = (home: string) => join(home, "bin", VERSION, isWin ? "motif.exe" : "motif");
    const run = (base: string, home: string, args: string[], extra: Record<string, string> = {}) =>
      Bun.spawnSync(runner.cmd(args), {
        env: { ...process.env, MOTIF_HOME: home, MOTIF_DOWNLOAD_BASE: `http://127.0.0.1:${server.port}/${base}`, ...extra },
      });

    test("downloads once, verifies, caches, then runs from the cache", () => {
      const home = freshHome();
      const before = hits;
      const first = run("ok", home, ["--version"]);
      expect(first.stderr.toString()).toContain("one time only");
      expect(first.exitCode).toBe(0);
      expect(first.stdout.toString().trim()).toBe(VERSION);
      expect(existsSync(cached(home))).toBe(true);
      const second = run("ok", home, ["--version"]);
      expect(second.exitCode).toBe(0);
      expect(second.stderr.toString()).not.toContain("one time only");
      expect(hits - before).toBe(1);
    }, 120_000);

    test("passes arguments and exit codes through", () => {
      const r = run("ok", freshHome(), ["fly"]);
      expect(r.exitCode).toBe(2);
      expect(r.stderr.toString()).toContain('Unknown command "fly"');
    }, 120_000);

    test("a checksum mismatch aborts with a plain message and caches nothing", () => {
      const home = freshHome();
      const r = run("bad", home, ["--version"]);
      expect(r.exitCode).toBe(2);
      expect(r.stderr.toString()).toContain("failed its safety check");
      expect(existsSync(cached(home))).toBe(false);
    }, 120_000);

    test("a failed download aborts with a plain message and caches nothing", () => {
      const home = freshHome();
      const r = run("missing", home, ["--version"]);
      expect(r.exitCode).toBe(2);
      expect(r.stderr.toString()).toContain("couldn't download");
      expect(existsSync(join(home, "bin"))).toBe(false);
    }, 120_000);

    test("MOTIF_BIN skips the download entirely", () => {
      const r = run("missing", freshHome(), ["--version"], { MOTIF_BIN: slash(builtPath) });
      expect(r.exitCode).toBe(0);
      expect(r.stdout.toString().trim()).toBe(VERSION);
    }, 120_000);
  });
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/bootstrap.test.ts`
Expected: FAIL — the scripts don't exist (sh: cannot open `skill/bin/motif`; cmd: not recognised).

- [ ] **Step 3: Write the POSIX script**

`skill/bin/motif`:
```sh
#!/bin/sh
# Motif bootstrap: runs the Motif tool that matches this skill's VERSION,
# downloading and verifying it once if it isn't cached yet.
set -eu

SKILL_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=$(tr -d ' \r\n' < "$SKILL_DIR/VERSION")

if [ -n "${MOTIF_BIN:-}" ]; then
  exec "$MOTIF_BIN" "$@"
fi

REPO="${MOTIF_REPO:-7mxd/motif}"
case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  MINGW*|MSYS*|CYGWIN*) OS=windows ;;
  *) echo "Motif: this operating system ($(uname -s)) isn't supported yet." >&2; exit 2 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) echo "Motif: this processor type ($(uname -m)) isn't supported yet." >&2; exit 2 ;;
esac
EXT=""
if [ "$OS" = windows ]; then EXT=".exe"; ARCH=x64; fi

ASSET="motif-$OS-$ARCH$EXT"
CACHE_DIR="${MOTIF_HOME:-$HOME/.motif}/bin/$VERSION"
BIN="$CACHE_DIR/motif$EXT"

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -q "$1" -O "$2"
  else return 1
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d ' ' -f 1
  else shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}

if [ ! -x "$BIN" ]; then
  BASE="${MOTIF_DOWNLOAD_BASE:-https://github.com/$REPO/releases/download/v$VERSION}"
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  echo "Motif: downloading the Motif tool v$VERSION (one time only)..." >&2
  if ! fetch "$BASE/$ASSET" "$TMP/$ASSET" || ! fetch "$BASE/SHA256SUMS" "$TMP/SHA256SUMS"; then
    echo "Motif: couldn't download the Motif tool. Check your internet connection and try again." >&2
    exit 2
  fi
  EXPECTED=$(grep " $ASSET\$" "$TMP/SHA256SUMS" | cut -d ' ' -f 1 || true)
  ACTUAL=$(sha256 "$TMP/$ASSET")
  if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "Motif: the downloaded tool failed its safety check, so it wasn't used. Please try again later, or report this at https://github.com/$REPO/issues" >&2
    exit 2
  fi
  mkdir -p "$CACHE_DIR"
  chmod +x "$TMP/$ASSET"
  mv "$TMP/$ASSET" "$BIN.partial"
  mv "$BIN.partial" "$BIN"
  rm -rf "$TMP"
  trap - EXIT
fi

exec "$BIN" "$@"
```

- [ ] **Step 4: Write the Windows scripts**

`skill/bin/motif.ps1`:
```powershell
# Motif bootstrap (Windows): runs the Motif tool that matches this skill's VERSION,
# downloading and verifying it once if it isn't cached yet.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$SkillDir = Split-Path -Parent $PSScriptRoot
$Version = (Get-Content -Raw -Path (Join-Path $SkillDir 'VERSION')).Trim()

if ($env:MOTIF_BIN) {
  & $env:MOTIF_BIN @args
  exit $LASTEXITCODE
}

$Repo = if ($env:MOTIF_REPO) { $env:MOTIF_REPO } else { '7mxd/motif' }
$Asset = 'motif-windows-x64.exe'
$MotifHome = if ($env:MOTIF_HOME) { $env:MOTIF_HOME } else { Join-Path $env:USERPROFILE '.motif' }
$CacheDir = Join-Path (Join-Path $MotifHome 'bin') $Version
$Bin = Join-Path $CacheDir 'motif.exe'

if (-not (Test-Path -LiteralPath $Bin)) {
  $Base = if ($env:MOTIF_DOWNLOAD_BASE) { $env:MOTIF_DOWNLOAD_BASE } else { "https://github.com/$Repo/releases/download/v$Version" }
  $Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('motif-' + [System.Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  try {
    [Console]::Error.WriteLine("Motif: downloading the Motif tool v$Version (one time only)...")
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile (Join-Path $Tmp $Asset)
      Invoke-WebRequest -UseBasicParsing -Uri "$Base/SHA256SUMS" -OutFile (Join-Path $Tmp 'SHA256SUMS')
    } catch {
      [Console]::Error.WriteLine("Motif: couldn't download the Motif tool. Check your internet connection and try again.")
      exit 2
    }
    $Expected = $null
    foreach ($line in Get-Content -Path (Join-Path $Tmp 'SHA256SUMS')) {
      $parts = $line.Trim() -split '\s+'
      if ($parts.Count -ge 2 -and $parts[1].TrimStart('*') -eq $Asset) { $Expected = $parts[0].ToLower() }
    }
    $Actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Tmp $Asset)).Hash.ToLower()
    if (-not $Expected -or $Expected -ne $Actual) {
      [Console]::Error.WriteLine("Motif: the downloaded tool failed its safety check, so it wasn't used. Please try again later, or report this at https://github.com/$Repo/issues")
      exit 2
    }
    New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
    Move-Item -Force -LiteralPath (Join-Path $Tmp $Asset) -Destination "$Bin.partial"
    Move-Item -Force -LiteralPath "$Bin.partial" -Destination $Bin
  } finally {
    Remove-Item -Recurse -Force -LiteralPath $Tmp -ErrorAction SilentlyContinue
  }
}

& $Bin @args
exit $LASTEXITCODE
```

`skill/bin/motif.cmd`:
```bat
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0motif.ps1" %*
exit /b %ERRORLEVEL%
```

`.gitattributes` (keeps the sh script LF on Windows checkouts, so Git Bash can run it):
```gitattributes
* text=auto
skill/bin/motif text eol=lf
*.sh text eol=lf
*.ps1 text eol=crlf
*.cmd text eol=crlf
```

Mark the POSIX script executable (needed when committing from Windows):
```bash
chmod +x skill/bin/motif
git add --chmod=+x skill/bin/motif
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd cli && bun test test/bootstrap.test.ts`
Expected: PASS for every available runner (on Windows both runners run if Git Bash's `sh` is on PATH; on macOS/Linux only the POSIX runner runs). Takes up to a minute because it compiles a real binary.

- [ ] **Step 6: Run the whole suite**

Run: `cd cli && bun test && bun run typecheck`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add .gitattributes skill/bin cli/test/bootstrap.test.ts
git commit -m "feat(skill): bootstrap scripts that download, verify and cache the motif tool"
```

---

### Task 14: CI on three OSes, release workflow, and the public repo

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `cli/.bun-version`, `bun test`, `bun run typecheck` (Task 2); `skill/VERSION`; asset names and `SHA256SUMS` format expected by the bootstrap scripts (Task 13): `motif-<os>-<arch>[.exe]`, lines `<sha256>  <asset>`.
- Produces: green CI on Windows, macOS and Linux for every push/PR; a release workflow that, on a `v*` tag, publishes the 5 binaries + `SHA256SUMS`, and on manual dispatch builds and smoke-tests them without publishing.

- [ ] **Step 1: Write the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: cli/.bun-version
      - name: Install
        working-directory: cli
        run: bun install --frozen-lockfile
      - name: Typecheck
        working-directory: cli
        run: bun run typecheck
      - name: Test
        working-directory: cli
        run: bun test --timeout 120000
```

- [ ] **Step 2: Write the release workflow**

`.github/workflows/release.yml`:
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
        run: bun build --compile --minify --target=${{ matrix.target }} src/main.ts --outfile ../dist/${{ matrix.asset }}
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

  publish:
    needs: build
    if: startsWith(github.ref, 'refs/tags/')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: dist
          merge-multiple: true
      - name: Checksums
        working-directory: dist
        run: sha256sum motif-* > SHA256SUMS && cat SHA256SUMS
      - name: Create release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh release create "$GITHUB_REF_NAME" dist/* --repo "$GITHUB_REPOSITORY" --title "Motif $GITHUB_REF_NAME" --generate-notes
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows
git commit -m "ci: test on Windows, macOS and Linux; release workflow for 5 binaries"
```

- [ ] **Step 4: Ask the user before publishing anything**

Creating a public repository is outward-facing. Ask the user: "Ready to create the public GitHub repo `7mxd/motif` and push? It will contain the spec, this plan and the 1A code." Continue only after an explicit yes.

- [ ] **Step 5: Create the repo and push**

```bash
gh repo create 7mxd/motif --public --source . --remote origin --description "Design guide tools for AI coding agents: polished, consistent UI, UX and motion for web and mobile apps." --push
```
Expected: the repo URL is printed; `git remote -v` shows `origin`.

- [ ] **Step 6: Watch CI go green on all three OSes**

Run: `gh run watch --exit-status $(gh run list --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: the `test` job passes on `ubuntu-latest`, `macos-latest` and `windows-latest`. If one fails, read the log (`gh run view --log-failed`), fix the cause on a branch, and repeat — do not mark the task done with a red OS.

- [ ] **Step 7: Dry-run the release build (no publishing)**

Run: `gh workflow run release.yml --ref main`, then `gh run watch --exit-status $(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: all 5 build jobs pass (3 run the smoke test); the `publish` job is skipped because this isn't a tag. Download one artifact to confirm naming: `gh run download --name motif-linux-x64 --dir /tmp/motif-art && ls /tmp/motif-art` → `motif-linux-x64`.

No tag is pushed in Plan 1A. The first real release (`v0.1.0`) happens when Plan 1D ships a usable skill.

---

## After this plan

Plan 1A leaves the repo with a tested `motif` binary (`--version`, `doctor`, `validate`), verified downloads, and CI on all three OSes. Next: **Plan 1B — React web exact half** (`tokens`, `check`, `extract`), written after 1A is reviewed so it can build on the real code.
