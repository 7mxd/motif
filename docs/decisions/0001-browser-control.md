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

## Follow-up

- macOS and Linux are verified by Plan 1C's CI integration test for `preview`/`shot`, which runs on all three OSes.
- The binary is ~96 MB, which is mostly the Bun runtime. Users download it once per Motif version (spec §10.1). Plan 1C should check whether `--minify` and `--bytecode` reduce it meaningfully.
