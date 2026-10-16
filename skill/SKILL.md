---
name: motif
description: Designs and builds polished, consistent app UI (theme, components, screens and motion) for web and mobile apps, and reviews existing UI against a design guide. Use when the developer wants to start a new app's look, add a screen or feature that matches their design, improve or review how their app looks and feels, or mentions DESIGN.md, a design system, theme values, mockups, motion or Motif.
license: MIT
compatibility: Runs the motif tool from this skill's bin folder (it downloads itself on first use and needs no Node.js). Mockups and screenshots need Chrome or Edge, or a browser Motif downloads with the developer's permission.
---

# Motif

Motif helps you build app UI that looks designed rather than generated, and keeps it consistent as the app grows. Each project gets a design guide: `DESIGN.md` for people and `design/tokens.json` for the exact theme values. Everything you design or build reads both, and the `motif` tool checks the results exactly.

The folder this file is in is the **skill folder**; the links below are relative to it.

## Running the motif tool

The tool is in the skill folder's `bin` folder. Run it by its full path, from the developer's project folder, in the form for your shell:

| Shell | Command |
|---|---|
| macOS, Linux, Git Bash, WSL | `"<skill folder>/bin/motif" <command>` |
| Windows PowerShell | `& "<skill folder>\bin\motif.cmd" <command>` |
| Windows Command Prompt | `"<skill folder>\bin\motif.cmd" <command>` |

Wherever Motif's files say `motif <command>`, run it this way.

- Add `--json` whenever you read the output yourself: it prints one JSON object. Tell the developer what it means in plain words.
- Exit codes: `0` all good, `1` problems found (the output lists them), `2` it couldn't run (the output says why).
- The first run downloads the tool for this computer once, checks it against the release's checksums and keeps it in `~/.motif`. If that fails (offline, a firewall), carry on without the exact steps: open mockups directly as [the preview kit](preview-kit/README.md) describes, review with judgement and the knowledge files, and say once that `motif doctor` will tell when the checks work again.
- `motif preview` keeps serving mockups until it's stopped. Use `--png-only` when you need pictures, and start a live preview only in the background, or ask the developer to run it.
- When a command reports `"status": "needs_browser"`, ask the developer before running `motif browser install`: it downloads a private browser of about 100 MB. If they'd rather not, keep HTML mockups and skip pictures.

## At the start of a session

1. Run `motif doctor --json` once. `apps` lists the apps in this folder with their stacks; `items` says whether there's a browser, the app's toolchain and a valid design guide, and which design sources are connected. Run it again only after something changes (an install, a new app).
2. Look through your own tools for the design sources the notes describe: [Motion](sources/motion-dev.md), [Refero](sources/refero.md), [21st.dev](sources/21st.md) and [60fps.design](sources/60fps.md) ([Supahero](sources/supahero.md) needs nothing). Tell the developer once, in one line, for example: "Connected: Motion · Optional: Refero, 21st.dev, 60fps.design (`motif connect` adds them later)." Don't repeat it in the same session.
3. If `design/.progress.json` exists, an earlier new app or feature stopped part-way. Offer to continue it before starting anything else.

## Choosing what to do

| The developer… | Follow |
|---|---|
| types /design, or asks for design help without saying what | [modes/design.md](modes/design.md) |
| wants a new app, or a new look from scratch | [modes/init.md](modes/init.md) |
| wants a new screen, flow or feature | [modes/feature.md](modes/feature.md) |
| wants to improve, review, audit or fix how the app looks | [modes/review.md](modes/review.md) |
| asks for a small change (one component, a spacing fix, a colour) | No mode: make the change under the rules below, then run `motif check` |

## Your stack

For each app in `apps`, read its stack guide, `adapters/<stack>/README.md`: [React web](adapters/react-web/README.md), or [plain web](adapters/plain-web/README.md) for a site of HTML, CSS and JavaScript without a framework. It says how to start a project, use the theme code, build components, animate, and fix what `motif check` and `motif shot` report.

Motif's guides for other stacks aren't ready yet. For an app on one of them, or on a stack Motif doesn't know, the design guide, the modes and the knowledge files still apply: `motif tokens` writes plain CSS variables and `design/generated/tokens.flat.json`, you map those values into the app by hand, and you tell the developer once that full support for their stack is on its way. [The stack guide template](adapters/_template/README.md) lists what each guide covers.

## Rules for every task

1. **The design guide decides.** Read `DESIGN.md` and `design/tokens.json` before you design anything, and follow [the four rules](contract/spec.md#the-four-rules): theme values only, no silent new values, exceptions say why, generated files aren't edited.
2. **Show, then build.** At each step marked ⏸ in a mode, show what you propose (a mockup, a change to the design guide, a list of findings), explain it in one or two plain sentences, and wait. If the developer says "skip previews" or "don't stop for approval", carry on and show everything at the end. Changes to the design guide are always shown, even then, without waiting.
   - Write a change into `DESIGN.md` or `design/tokens.json` (a new rule, role, value or wording) only after the developer approves that exact change, and name who approved it in the change-log line. Never put a name on an approval that didn't happen: with approvals turned off, write "not yet approved" and list the change at the end.
   - When what you built differs from what you showed (another approach, or a visible change you didn't describe), show it and ask before keeping it.
3. **Ask with choices.** Offer two to four options with a recommended default, plus "or tell me in your own words". Ask everything a step needs in one round, as a numbered list at the end of your message with one decision per item, and ask again any that wasn't answered before going on; "I don't know" is fine (use the default).
4. **Plain words.** Say "your design guide" and "theme values", never contract or tokens. Explain each finding in one line: what's wrong and why it matters. If the developer says "be brief", drop the explanations.
5. **Show pictures.** When `motif preview` or `motif shot` makes PNGs, show them if you can display images; otherwise give their paths and say what to look for.
6. **Never a dead end.** When something is missing, say in one sentence what it affects, skip only that part, and keep going (the table below).
7. **Mock data only.** Screens use realistic mock data from one clearly named file. Never write back-end logic, real sign-in or payments.
8. **Copy nothing protected.** Use design sources as their notes say: learn from them, restyle everything with the theme values, and keep links, never their images or text.
9. **Keys stay out of the chat.** Never ask the developer to paste an API key to you; `motif connect <source>` asks for it in their own terminal.

### When something is missing

| Problem | What to do |
|---|---|
| The motif tool can't download | Work without the exact checks, as above |
| No browser, and the developer declines the download | Keep HTML mockups; skip PNGs and screenshots |
| The app's toolchain is missing (Node.js for React apps; plain web sites need none) | Say what to install; skip running the app until it's there |
| A design source fails or runs out of calls | Use the free guidance instead and say so once |
| `DESIGN.md` or `tokens.json` is broken | `motif validate` names the line; offer to fix it |
| The code drifted from the design guide | `motif check` lists where; fix it, or offer a review |
| `motif validate` says the guide comes from a newer Motif | Don't edit it; ask the developer to update Motif |

## Progress

While a new app or feature is under way, write `design/.progress.json` after each step, so a later session can continue:

```json
{ "motifProgress": 1, "mode": "init", "done": ["brief", "scaffold"], "next": "research", "updated": "2026-10-14", "notes": "Pebble, a habit tracker for students. Liked the Soft style." }
```

Make sure `design/.gitignore` lists `.progress.json` and `directions/` (create it if needed): both are drafts that don't belong in git. Delete the progress file when the mode finishes.

## What's in the skill folder

- [contract/spec.md](contract/spec.md): the design guide format, with [DESIGN.template.md](contract/DESIGN.template.md) and [tokens.template.json](contract/tokens.template.json) to start from.
- Knowledge: [visual craft](knowledge/visual-craft.md), [anti-patterns](knowledge/anti-patterns.md), [motion](knowledge/motion.md), [accessibility](knowledge/accessibility.md), and one guide per UX pattern in `knowledge/ux-patterns/`, such as [sign-in](knowledge/ux-patterns/sign-in.md) and [lists and feeds](knowledge/ux-patterns/lists-feeds.md).
- `presets/<style>/`: the 8 starting styles (`tokens.json`, `about.md`, `sample.html`).
- [preview-kit/README.md](preview-kit/README.md): how to write mockups.
- `sources/`: one note per design source. `adapters/`: one guide per stack.
