# 0001 — How Motif drives the browser

- Date: 2026-10-12
- Status: Accepted
- Context: spec §10.3 requires headless Chrome/Edge control from a single compiled binary with no Node.js.

## Results (Windows 11, Google Chrome, Bun 1.4.3)

| Approach | Compiles | Runs | PNG correct | Binary size |
|---|---|---|---|---|
| playwright-core | no — `bun build --compile` fails: `Could not resolve "chromium-bidi/lib/cjs/cdp/CdpConnection"` (also after adding `chromium-bidi` explicitly) | — | — | — |
| Minimal CDP client | yes | yes — launched Chrome headless, set a 390×844 @2× mobile viewport and dark colour scheme, read an element's size, captured a screenshot | yes — 780×1688, dark page with heading and button | 96 MB (almost all of it is the Bun runtime) |

## Decision rule

Choose playwright-core only if it compiled, ran, produced a correct PNG, and adds at most 15 MB over the CDP binary. Otherwise choose the minimal CDP client.

Chosen: **cdp** — a minimal Chrome DevTools Protocol client over the WebSocket built into Bun. It covers everything Plan 1C needs (launch, viewport, emulated media such as `prefers-color-scheme` and `prefers-reduced-motion`, navigate, evaluate JavaScript, screenshot) with no extra dependencies.

## Follow-up (Plan 1C-1)

- macOS and Linux: covered by `cli/test/preview-e2e.test.ts`, which runs the compiled binary's `preview --png-only` in CI on Ubuntu, macOS and Windows (GitHub's runners ship Chrome). On Linux, `launchBrowser` retries once with `--no-sandbox` when Chrome's sandbox is blocked.
- Binary size (Bun 1.4.3, Windows x64): `--minify` builds a binary of 96.9 MB; `--minify --bytecode` gives no binary: `error: Expected ";" but found ")"` at the top-level `await` in `src/main.ts` (bytecode builds don't support top-level await). The build script keeps `--minify` only, because bytecode trades size for start-up time and start-up isn't the bottleneck for these commands.
