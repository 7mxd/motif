# Feature: add a screen or flow that matches the app

A new feature that looks as if it was always part of the app: built from the design guide and the existing components, shown as a mockup first, then compared with that mockup. Steps marked ⏸ wait for the developer unless they turned approvals off. Keep `design/.progress.json` up to date (`"mode": "feature"`, with the feature's name in `notes`).

## 1. Read what exists

1. Read `DESIGN.md`, `design/tokens.json` and `design/motif.json`.
2. List the existing components. The stack guide says where they live (React web: [components](../adapters/react-web/components.md); plain web: the `Component:` lines in `components.css`, [components](../adapters/plain-web/components.md); Flutter: the public widgets in `lib/widgets/` and `lib/features/*/widgets/`, [components](../adapters/flutter/components.md); Jetpack Compose: the public composables in `ui/components/` and the feature folders under `ui/`, [components](../adapters/compose/components.md); SwiftUI: the views that aren't `private` in `Components/` and `Features/*/`, [components](../adapters/swiftui/components.md); React Native: the exported components in `components/` and `features/*/components/`, [components](../adapters/react-native/components.md)). Note each one's name, variants and states, so you reuse them rather than rebuild them.
3. No design guide yet? Run [review's extract step](review.md#2-extract-only-when-there-is-no-design-guide) first, then come back here.

## 2. Understand the feature

Ask, with choices where you can: what the feature does, who uses it, and their path through it (where they start, each step, where they end up). Name every screen and state the path needs.

## 3. Research the pattern

Read the matching UX pattern guides in `knowledge/ux-patterns/` in the skill folder: a settings screen needs [settings](../knowledge/ux-patterns/settings.md); a list people search needs [lists and feeds](../knowledge/ux-patterns/lists-feeds.md) and [search and filters](../knowledge/ux-patterns/search-filters.md). With Refero connected, also see how real products handle it ([Refero](../sources/refero.md)). Note the anatomy and required states you'll build.

## 4. Mockup ⏸

Write a mockup of every new screen and state as `design/previews/<feature>-<screen>.html`, with [the preview kit](../preview-kit/README.md) and nothing but the design guide: kit classes only, no colours, sizes or fonts of your own. Show the loading, empty and error states the pattern guide lists, each in its own frame. Mark each state's frame with `data-state="<state>"`, the name its state script will have in `design/states/` (`<div class="mk-frame mk-phone mk-ios" data-state="empty">`), so it's later compared with that state of the app.

Run `motif preview design/previews/<feature>-<screen>.html --png-only` and show the PNGs (light and dark). When the app has variants, add `--variant all`: a new screen has to work in every one. Change the mockup until the developer approves it.

## 5. Build

- Reuse existing components first; extend one with a new variant before creating a new component.
- Use theme values only ([the four rules](../contract/spec.md#the-four-rules)).
- If the feature truly needs something the design guide doesn't have (a new component, a new value), stop and propose the change ⏸: what changes, from what to what, and why, in plain words. Once approved, update `design/tokens.json` and `DESIGN.md` (the component in section 5, a change-log line), run `motif validate` and `motif tokens`, and continue.
- While you build, compare the app with the approved mockup whenever a screen takes shape: `motif shot --routes <route> --against design/previews/<feature>-<screen>.html` puts them side by side. For a quick look while you iterate, add `--sizes 390,1440` (a phone and a desktop); the final checks below use every size. Show the images if you can display them.

## 6. Verify

1. Run `motif check` (no findings apart from justified `motif-ok` exceptions) and the project's build and type check.
2. Run `motif shot --audit --routes <the new routes>` (it covers every variant), adding `--state` for each new screen behind a form or a click. Fix the critical and major findings and run it again.
3. For each screen, run `motif shot --routes <route> --state design/states/<state>.js --against design/previews/<feature>-<screen>.html`, with a `--state` for each state the mockup shows (`.dart` for a Flutter app, `.kt` for a Compose app, `.swift` for a SwiftUI app, whose new screens are its previews, named with `--screen <preview>` instead of `--routes`): each frame is put next to the same state of the app, and the output names any state you left out. Fix differences that change the design.
4. Confirm every state from the mockup exists in the app: loading, empty, error, disabled. With variants, look at the screen in each: `motif shot --routes <route> --variant all`.
5. Show the developer the side-by-side images and a short summary of what was built and checked.

Delete `design/.progress.json`.
