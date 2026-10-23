# Stack guide template

Every stack Motif supports has two halves: a guide in `adapters/<stack>/` that agents read, and code in the motif tool that runs exactly (spec §11.1). This file lists what a guide covers; [React web](../react-web/README.md) is the reference.

## Files

| File | Part | Covers | Matching code in the motif tool |
|---|---|---|---|
| `README.md` | 0. Detect and scaffold | How the stack is recognised, the official starter commands, the folders that matter, how to build and type-check | Stack detection; route discovery for `motif shot` |
| `tokens.md` | 1. Theme code | What `motif tokens` writes, how to wire it in, how components use it, how to load the theme's fonts | The theme code generator |
| `components.md` | 2. Components | Where components live, how to build one the stack's way, the starter set, every state | Agents list components by reading the folder |
| `motion.md` | 3. Motion | The motion roles in the stack's animation API, common patterns, reduced motion | Spring and easing output (spec §6.4) |
| `platform.md` | 4. Platform rules | The platform's conventions and accessibility specifics | — |
| `checks.md` | 5. Checks and screenshots | Each `motif check` rule and `motif shot --audit` finding on this stack, and how to fix it | The check rules and the screenshot driver |

## A finished guide

A stack is finished when the developer gets all of this on it, and the guide says how (spec §4, the parity checklist):

- **Detection and the toolchain:** `motif doctor` recognises the app, also inside a monorepo, says what's missing and how to install it, and `init` knows the stack's official starter.
- **Theme code:** colours (light, dark, every variant), type roles with the Arabic companion, spacing, corners, shadows, durations, easings and springs, and the theme's fonts wired in.
- **Checks:** typed colours, sizes, fonts and animation timings found with file, line and fix, with `motif-ok` exceptions.
- **Drafting a guide** from an existing app with `motif extract`.
- **Components:** where they live, so the `feature` mode can list them.
- **Screenshots:** three phone sizes, a tablet and, where the stack runs on desktops, a desktop; light and dark; every variant; right-to-left; state scripts for screens behind a form or a tap; comparing with mockups.
- **The audit:** contrast, tap-target size, accessible names and reduced motion, as rendered.
- **Skill, evals and agents:** this guide, the `init`, `feature` and `review` modes working on the stack, fixture apps and eval cases, and all agent packages.

## Rules for every guide

- Use the stack's own words and APIs, and link the official docs for anything that changes often.
- Theme values only, always through the generated theme code. Examples must pass `motif check`.
- Every component example shows its states, its focus style and its accessible name.
- Commands are single commands that work in every shell.
- Keep each file under 400 lines.

## Adding a stack

1. Create `adapters/<stack>/` with the six files above, filled for the stack.
2. Add the tool code for each row of the table, with tests.
3. Add two fixtures: a small app that follows a design guide, and an app with seeded issues (Motif's evaluations use both).
