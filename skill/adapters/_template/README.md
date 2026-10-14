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
