# Motif 1E-1 — Eval Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the apps and briefs Motif's evals run against: a Next.js app that follows a design guide, the same app with 20+ planted problems (and an exact list of them), and three new-app briefs — each with self-checks that run in normal CI without any model.

**Architecture:** Fixtures live in `tests/fixtures/` (spec §5.1). `react-contract-app/` is a real Next.js 16 + Tailwind v4 app ("Larder", a grocery-ordering app) made with `create-next-app`, given a design guide from the Warm starting style, the 20 starter components of the React web guide, an app shell and three screens. `react-seeded-app/` is an *overlay*: files that replace or add to a copy of the contract app, plus `seeded-issues.json` listing every planted problem with its category and exact location. `tests/fixtures/assemble.ts` builds a working copy of either app; CI self-tests assemble them and check, with the motif tool's own functions, that the contract app is clean and that every exactly-detectable planted problem is reported where the list says. Builds and screenshots of the fixtures are verified by hand during this plan (they need `npm install` and a browser).

**Tech Stack:** Next.js 16.4 (`create-next-app@16.4.0`), React 19, Tailwind CSS v4.3, Motion, Radix (`radix-ui`), Fontsource (`@fontsource/dm-sans`, `@fontsource/fraunces`), TypeScript; Bun tests in `cli/test/`.

**Spec:** `docs/specs/2026-10-12-motif-core-design.md` — §5.1 (`tests/fixtures/`), §11.1 (each adapter ships "a minimal contract-governed app and a seeded-issue app"), §13.2 (tests B, C, D and their fixtures).

**Split:** 1E is two plans. **1E-1 (this plan)** builds the fixtures. **1E-2 The eval runner** runs tests B, C and D through the developer's signed-in Claude Code (no API key: the developer's decision), grades them and reports.

**Builds on:** Plans 1A–1D-2 (current `main`). Read `skill/adapters/react-web/*.md` (the fixtures follow it), `skill/presets/warm/`, `cli/src/commands/check.ts`, `cli/src/commands/validate.ts`, `cli/src/check/rules/app.ts` and `cli/test/project.ts` before starting.

**Verified while planning (2026-10-14):**
- `create-next-app` 16.4.0 is the latest and supports `--no-agent-feedback`, `--no-agents-md`, `--no-linter`, `--disable-git` (and `--no-*` negates any default).
- The Warm style: Fraunces (display, title 700; heading 600) and DM Sans (body 400; label 500; caption 400); spacing steps 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16 (so `p-7` is off the scale); corners 6 / 12 / 20 px.
- `motif check` reports a missing `MotionConfig reducedMotion="user"` once, against the first source file that imports Motion, and a hand-edited generated file as a *warning* (`generated-edited`, line 1). Motif's generated CSS stops CSS animations under reduced motion, so a problem `motif shot --audit` can see under reduced motion must be a Motion (JavaScript) animation.
- Node.js 22.14 and npm 11.13 are on the development machine.

## Global Constraints

- Fixtures follow the React web guide (`skill/adapters/react-web/`) exactly: theme values only, the generated theme code, Fontsource for fonts, `MotionConfig reducedMotion="user"` at the root, the starter set's states and focus styles.
- Mock data only, in one file (`src/mock-data.ts`), clearly fictional.
- The contract app is clean: `motif validate` 0 errors and 0 warnings; `motif check` 0 violations, 0 exceptions, 0 warnings; `npm run build` and `npx tsc --noEmit` pass; `motif shot --audit` reports no critical or major findings on its three screens.
- Every planted problem in the seeded app is listed in `seeded-issues.json` with an exact location (file and line, a screen, or the whole app); nothing else in it is wrong on purpose. At least 20 problems: at least 12 that the tool can detect, at least 8 that need judgement (spec §13.2).
- `node_modules/`, `.next/` and test outputs are never committed; `package-lock.json` is.
- Fixtures are original: no third-party images or copy; images are drawn with theme colours.

## Review Focus

1. **The seeded app drifts from its list** (a planted line moves, a problem is fixed by accident) → a CI self-test assembles the app and checks every tool-detectable problem is reported at the listed file and line. Pinned: Task 4.
2. **The contract app picks up a violation** (a later edit, or a Motif rule change) → a CI self-test runs `motif check` and `motif validate` on it and expects nothing. Pinned: Tasks 1–3.
3. **Assembling a fixture into a folder that holds something else** → `assemble` refuses a non-empty destination. Pinned: Task 4.
4. **A seeded problem that only the browser can see isn't really there** (the contrast, tap-target and motion problems) → verified by hand with `motif shot --audit` during Task 4, and recorded in the fixture README. Pinned: Task 4 (manual step).
5. **Windows line endings** shifting what a test reads → every self-test normalises line endings before comparing lines. Pinned: Tasks 1–5.

---

## File Structure

```
tests/
├── README.md                                  what the fixtures are; how the evals use them
├── fixtures/
│   ├── assemble.ts                            copies a fixture (and an overlay) into a folder
│   ├── react-contract-app/                    Larder: Next.js 16 + Tailwind v4, design guide, 20 components, 3 screens
│   │   ├── DESIGN.md · design/tokens.json · design/motif.json · design/.gitignore
│   │   ├── package.json · package-lock.json · next.config.ts · tsconfig.json · postcss.config.mjs · .gitignore
│   │   └── src/app/… · src/components/… · src/styles/… (generated) · src/design/motion.ts (generated) · src/mock-data.ts
│   ├── react-seeded-app/
│   │   ├── README.md                          the planted problems, by kind
│   │   ├── seeded-issues.json                 every planted problem: id, kind, categories, location, summary
│   │   └── overlay/…                          files that replace or add to a copy of the contract app
│   └── briefs/ stride.md · ledgerly.md · bloom.md
cli/test/
└── fixtures-contract.test.ts · fixtures-seeded.test.ts · fixtures-briefs.test.ts
.gitignore                                     MODIFY: .next/, tests/evals/results/
```

---
### Task 1: Larder — the project, its design guide and its theme

**Files:**
- Create (scaffolded, then edited): `tests/fixtures/react-contract-app/` — `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `.gitignore`, `next-env.d.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/favicon.ico`
- Create: `tests/fixtures/react-contract-app/DESIGN.md`, `design/tokens.json`, `design/.gitignore`, `src/app/providers.tsx`; generated by `motif tokens`: `design/motif.json`, `src/styles/motif.css`, `src/styles/motif.tailwind.css`, `src/design/motion.ts`
- Create: `cli/test/fixtures-contract.test.ts`
- Modify: `.gitignore` (root)

**Interfaces:**
- Consumes: `runValidate(cwd, opts?)`, `runCheck(cwd, ctx)` (1A–1D-2); the Warm starting style (`skill/presets/warm/tokens.json`).
- Produces: a Next.js app at `tests/fixtures/react-contract-app/` whose design guide validates cleanly and whose code `motif check` finds clean; Tasks 2 and 3 add its components and screens; Task 4's overlay applies on top of it; 1E-2 copies it for test B.

- [ ] **Step 1: Write the failing test**

`cli/test/fixtures-contract.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runValidate } from "../src/commands/validate";

const APP = join(import.meta.dir, "../../tests/fixtures/react-contract-app");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8").replace(/\r\n/g, "\n");

describe("the contract app (Larder)", () => {
  test("its design guide is valid, without a single warning", async () => {
    const r = await runValidate(APP);
    expect(r.exitCode).toBe(0);
    expect(r.data.summary).toMatchObject({ errors: 0, warnings: 0 });
  });

  test("its code follows the design guide: no violations, exceptions or warnings", async () => {
    const r = await runCheck(APP, { positionals: [] });
    expect(r.data.summary).toMatchObject({ violations: 0, exceptions: 0, warnings: 0 });
    expect(r.exitCode).toBe(0);
  });

  test("it's wired the way the React web guide says", () => {
    expect(read("src/app/globals.css").trim()).toBe('@import "tailwindcss";\n@import "../styles/motif.tailwind.css";');
    const layout = read("src/app/layout.tsx");
    for (const s of ['import "@fontsource/dm-sans/400.css";', 'import "@fontsource/dm-sans/500.css";', 'import "@fontsource/fraunces/600.css";', 'import "@fontsource/fraunces/700.css";', "<Providers>", '<html lang="en">']) {
      expect(layout).toContain(s);
    }
    expect(layout).not.toContain("next/font");
    expect(read("src/app/providers.tsx")).toContain('<MotionConfig reducedMotion="user">');
  });

  test("the design guide was made from the Warm style and keeps its history", () => {
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(tokens.primitive.font.display.$value[0]).toBe("Fraunces");
    const guide = read("DESIGN.md");
    expect(guide).toContain("name: Larder");
    expect(guide).toMatch(/^## 10\. Change log\n\n- \d{4}-\d{2}-\d{2} — .+ — .+ — approved by .+$/m);
  });

  test("dependencies, build output and drafts stay out of git", () => {
    const ignore = read(".gitignore");
    for (const s of ["/node_modules", "/.next/"]) expect(ignore).toContain(s);
    expect(read("design/.gitignore")).toContain(".progress.json");
    expect(existsSync(join(APP, "package-lock.json"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/fixtures-contract.test.ts`
Expected: FAIL — the app doesn't exist.

- [ ] **Step 3: Scaffold the app**

From the repository root (one command per line; Windows PowerShell or Git Bash alike):
```bash
mkdir -p tests/fixtures
cd tests/fixtures
npx create-next-app@16.4.0 react-contract-app --ts --tailwind --no-linter --app --src-dir --import-alias "@/*" --use-npm --no-agent-feedback --no-agents-md --disable-git --yes
```
Expected: a `react-contract-app/` folder with `node_modules/` installed and `package-lock.json`. Then, inside it:
- delete `README.md` and everything in `public/` (the starter's images), keeping the empty `public/` folder with a `.gitkeep`;
- make sure `.gitignore` contains `/node_modules` and `/.next/` (the starter's does);
- add to the root `.gitignore` the lines `.next/` and `tests/evals/results/`.

Then install the libraries the React web guide uses (exact versions are recorded in `package-lock.json`):
```bash
npm install motion radix-ui @fontsource/dm-sans @fontsource/fraunces
```

- [ ] **Step 4: The design guide**

Copy `skill/presets/warm/tokens.json` to `tests/fixtures/react-contract-app/design/tokens.json` unchanged.

`tests/fixtures/react-contract-app/design/.gitignore`:
```
.progress.json
directions/
```

`tests/fixtures/react-contract-app/DESIGN.md`:
````markdown
---
motifContract: 1
name: Larder
updated: 2026-10-14
---

# Larder design guide

Larder feels like a good neighbourhood grocer: warm, unhurried and honest about what things cost. Screens are calm, with plenty of room, earthy colours and a serif for headings that gives the app a crafted feel. One accent colour marks the thing you can do next, and nothing else competes with it. Prices and quantities are always easy to read.

## 1. Brief

- **What it is:** a grocery ordering app for a local shop: browse products, reorder your usual basket, track deliveries.
- **Who it is for:** busy households who shop weekly and want it done in a few minutes.
- **Personality:** warm, honest, unhurried, crafted.
- **Voice and tone:** friendly and plain. Short sentences, real numbers, no exclamation marks. "Your basket is on its way" rather than "Woohoo! Order placed!"

## 2. Direction

- **Style:** the Warm starting style: earthy neutrals, a terracotta accent, Fraunces for headings and DM Sans for text.
- **Starting preset:** Warm.
- **References:** none.
- **Approved mockups:** none yet; the screens were built straight from this guide.

## 3. Foundations

- **Colour:** `background` is the page; `surface` holds cards and lists; `surface-raised` lifts sheets, menus and selected rows. `action-primary` (terracotta) marks the one main action on a screen and links; `action-secondary` is for supporting actions. Status colours only for status: `success` for delivered and in stock, `warning` for low stock and delays, `danger` for problems and destructive actions, `info` for neutral notices. Text uses `text-primary`, and `text-secondary` for metadata.
- **Type:** `display` only for the basket total on checkout-style screens; `title` once per screen; `heading` for sections; `body` for content; `label` for controls and prices in lists; `caption` for metadata such as dates and units. Figures in prices are tabular.
- **Spacing:** the 4 px scale. `space.2`–`space.3` inside controls, `space.4` between related items, `space.6`–`space.8` between groups, `space.12` between page sections. Screens have `space.4` side padding on phones and `space.8` on desktops.
- **Corners and elevation:** `radius.sm` for chips and badges, `radius.md` for buttons, fields and cards, `radius.lg` for sheets and dialogs, `radius.full` for avatars and switches. Cards use a `border` and no shadow; `shadow.md` for menus and toasts, `shadow.lg` for dialogs and sheets.
- **Icons:** simple line icons drawn inline at 20 px with the text colour; icon-only buttons have an accessible name.

## 4. Motion

- **Presses and small changes:** `spring.snappy` for presses (scale to 0.97) and toggles; `duration.fast` for colour and opacity changes.
- **Screens and sheets:** sheets and dialogs move with `spring.smooth`; their backdrop fades with `duration.base`. Exits use `duration.fast` and `easing.exit`.
- **Lists and content:** new rows fade in with `duration.base`; skeletons pulse gently while loading and cross-fade to content.
- **Reduced motion:** the whole app sits inside `MotionConfig reducedMotion="user"`, so movement becomes fades for people who ask for less.

## 5. Components

| Component | Purpose | Variants | States |
|---|---|---|---|
| Button | Actions | primary, secondary, ghost | default, hover, pressed, focused, disabled, loading |
| IconButton | Universal actions | ghost | as Button, with an accessible name |
| Input | One line of text | — | label, hint, focused, error, disabled, read-only |
| Textarea | Longer text | — | as Input |
| Select | One choice from a list | — | label, open, selected, focused, error, disabled |
| Checkbox | On/off inside a form | — | checked, unchecked, focused, disabled |
| Switch | A setting that applies at once | — | on, off, focused, disabled |
| Card | A group of related content | plain, link | default, pressed (link) |
| ListItem | A row in a list | plain, link | default, hover, pressed, selected |
| TopBar | Screen title and actions | — | default |
| TabBar | Main navigation on phones | — | current tab |
| Sidebar | Main navigation on desktop | — | current item |
| Sheet | A focused task from the bottom on phones | — | open, closing |
| Dialog | A decision that needs an answer | — | open |
| Toast | A short confirmation | info, success, danger | shown, with an optional action |
| Skeleton | Loading placeholder | line, block, circle | pulsing |
| EmptyState | Nothing here yet | — | with one action |
| ErrorState | Something failed | — | with Retry |
| Avatar | A person | image, initials | — |
| Badge | A status or count | neutral, success, warning, danger, info | — |

- **Do:** reuse these before adding new ones; extend with a variant first.
- **Don't:** style a one-off button or card inline.

## 6. Patterns

- **Navigation:** a bottom tab bar on phones (Home, Products) and a sidebar on desktop; detail screens have a back link.
- **Forms:** labels above fields, errors below them in words, checked when a field loses focus and on submit.
- **Empty, loading and error:** skeletons that match the content while loading; an empty state with one action; errors with Retry.
- **Feedback:** toasts for confirmations ("Added to your basket"), at least 5 s, with Undo where it helps; inline messages for errors.
- **Modal or sheet:** sheets for focused tasks on phones; dialogs only for decisions that need an answer.

## 7. Accessibility

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark.
- Every tap target is at least 24×24 px, and 44×44 px on touch screens.
- Text can be enlarged to 200% without losing content.
- Every interactive element shows a visible focus ring.
- Layouts use start/end (not left/right), so right-to-left languages work.

## 8. Platform notes

None yet.

## 9. Do / Don't

- **Do:** show prices with their unit ("£2.40 / kg"); keep one primary action per screen.
- **Don't:** use colour alone for stock or delivery status; centre long text.

## 10. Change log

- 2026-10-14 — Created the design guide — the Warm style fits a neighbourhood grocer — approved by the Motif team
````

- [ ] **Step 5: Theme code and wiring**

From the repository root:
```bash
cd cli
bun src/main.ts tokens --cwd ../tests/fixtures/react-contract-app
```
Expected: `src/styles/motif.css`, `src/styles/motif.tailwind.css`, `src/design/motion.ts` and `design/motif.json` written, and a "Theme fonts: Fraunces 600 · 700, DM Sans 400 · 500" line.

Then remove the starter's own theme, as the React web guide says, and wire Motif's in:

`src/app/globals.css` (the whole file):
```css
@import "tailwindcss";
@import "../styles/motif.tailwind.css";
```

`src/app/providers.tsx`:
```tsx
"use client";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
```

`src/app/layout.tsx` (the whole file; Task 3 adds the app shell inside `<Providers>`):
```tsx
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Larder",
  description: "Your neighbourhood grocer, delivered.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background font-body text-body text-text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`src/app/page.tsx` (a placeholder until Task 3):
```tsx
export default function Home() {
  return (
    <main className="px-4 py-6">
      <h1 className="font-title text-title">Larder</h1>
    </main>
  );
}
```

- [ ] **Step 6: Run the tests and the build**

Run: `cd cli && bun test test/fixtures-contract.test.ts && bun run typecheck`
Expected: PASS.

Run (in `tests/fixtures/react-contract-app`): `npm run build` then `npx tsc --noEmit`
Expected: both succeed. (If `create-next-app` wrote other starter styles or files that `motif check` reports, remove them; the fixture must be clean.)

- [ ] **Step 7: Commit**

```bash
git add .gitignore tests/fixtures/react-contract-app cli/test/fixtures-contract.test.ts
git commit -m "test(fixtures): Larder, a Next.js app with a design guide from the Warm style"
```
(Check `git status` first: nothing from `node_modules/` or `.next/` may be staged.)

---
### Task 2: Larder — the starter components

**Files:**
- Create: `tests/fixtures/react-contract-app/src/components/` — `icons.tsx` and one file per component: `Button.tsx`, `IconButton.tsx`, `Input.tsx`, `Textarea.tsx`, `Select.tsx`, `Checkbox.tsx`, `Switch.tsx`, `Card.tsx`, `ListItem.tsx`, `TopBar.tsx`, `TabBar.tsx`, `Sidebar.tsx`, `Sheet.tsx`, `Dialog.tsx`, `Toast.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `Avatar.tsx`, `Badge.tsx`
- Test: `cli/test/fixtures-contract.test.ts` (append)

**Interfaces:**
- Consumes: the theme from Task 1 (`@/design/motion`, the Tailwind role utilities); `motion/react`, `radix-ui`, `next/link`, `next/navigation`.
- Produces (props are exact; Task 3's screens and Task 4's overlay use them):
  - `Button({ variant?: "primary" | "secondary" | "ghost"; loading?: boolean } & HTMLMotionProps<"button">)`
  - `IconButton({ label: string; children: ReactNode } & ComponentProps<"button">)`
  - `Input({ label: string; hint?: string; error?: string } & ComponentProps<"input">)` and `Textarea({ label, hint?, error? } & ComponentProps<"textarea">)`
  - `Select({ label: string; options: { value: string; label: string }[]; value?: string; onValueChange?: (v: string) => void; placeholder?: string; error?: string })`
  - `Checkbox({ label: string; checked?: boolean; onCheckedChange?: (c: boolean) => void; disabled?: boolean })` and `Switch({ label: string; description?: string; checked?: boolean; onCheckedChange?: (c: boolean) => void; disabled?: boolean })`
  - `Card({ children: ReactNode; href?: string; className?: string })`
  - `ListItem({ title: string; description?: string; meta?: ReactNode; leading?: ReactNode; trailing?: ReactNode; href?: string })`
  - `TopBar({ title: string; backHref?: string; actions?: ReactNode })`
  - `NAV_ITEMS: { href: string; label: string; icon: ComponentType }[]` (exported from `TabBar.tsx`), `TabBar()`, `Sidebar()`
  - `Sheet({ open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode })` and `Dialog({ open, onOpenChange, title: string; description?: string; children: ReactNode })`
  - `Toast({ message: string; tone?: "info" | "success" | "danger"; actionLabel?: string; onAction?: () => void })`
  - `Skeleton({ shape?: "line" | "block" | "circle"; className?: string })`
  - `EmptyState({ title: string; description: string; action?: ReactNode })` and `ErrorState({ title?: string; description: string; onRetry?: () => void })`
  - `Avatar({ name: string; src?: string })` and `Badge({ tone?: "neutral" | "success" | "warning" | "danger" | "info"; children: ReactNode })`
  - From `icons.tsx`: `HomeIcon`, `BasketIcon`, `BackIcon`, `CloseIcon`, `AlertIcon` (inline SVG, `currentColor`, `size-5`, `aria-hidden`).

How to write them: follow `skill/adapters/react-web/components.md` exactly: real elements, theme utilities only (no hex, no arbitrary values, only spacing steps 0–6, 8, 10, 12, 16), `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus` on everything interactive, touch targets via `min-h-12`/`size-12`, logical properties (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`, `text-start`), `hover:` only as an extra, Motion transitions from `@/design/motion` only. Components that use hooks or Radix start with `"use client";`.

| Component | Built on | Must have |
|---|---|---|
| `Button` | `motion.button` | exactly the guide's example (below) |
| `IconButton` | `button` | `aria-label={label}`, `size-12 rounded-md`, ghost colours, focus ring |
| `Input` | `label` + `input` | the code below |
| `Textarea` | `label` + `textarea` | as Input, with `rows={4}` setting its height (no height class) |
| `Select` | Radix `Select` | a `label` linked to the trigger (`aria-labelledby`), trigger `min-h-12`, content on `surface-raised` with `shadow-md`, items with a check for the selected one, error text like Input |
| `Checkbox` | Radix `Checkbox` | the whole label is the target (`label` wraps it), `size-5` box with a `border`, checked state in `action-primary` |
| `Switch` | Radix `Switch` | label and optional description, track `bg-border` / `data-[state=checked]:bg-action-primary`, thumb `rounded-full`, row `min-h-12` |
| `Card` | `div`, or `next/link` when `href` | `rounded-md border border-border bg-surface p-4`; as a link, a focus ring and `hover:bg-surface-raised` |
| `ListItem` | `li`, with `next/link` when `href` | the code below |
| `TopBar` | `header` | `title` in `font-title text-title`; a back link (`BackIcon`, "Back" as its accessible name, `size-12`) when `backHref`; `actions` at the end |
| `TabBar` | `nav` | the code below; `md:hidden` |
| `Sidebar` | `nav` | the same `NAV_ITEMS`, `hidden md:flex`, current item `aria-current="page"` and `bg-surface-raised` |
| `Sheet` | Radix `Dialog` | overlay fades (`duration.base`), panel rises from the bottom with `spring.smooth` (`motion.div`), `rounded-t-lg`, a title, a close `IconButton` |
| `Dialog` | Radix `Dialog` | centred panel `rounded-lg bg-surface-raised shadow-lg p-6`, title and description, focus moves in and returns (Radix does this) |
| `Toast` | `div` | `role="status" aria-live="polite"`, tone colours (`bg-success text-on-success`…), optional action as a ghost `Button` |
| `Skeleton` | `div` | `animate-pulse bg-surface-raised`, shapes: line `h-4 rounded-sm`, block `rounded-md`, circle `rounded-full`; `aria-hidden` |
| `EmptyState` | `div` | centred short content: an icon, `font-heading text-heading` title, one `text-text-secondary` line, the action |
| `ErrorState` | `div` | `AlertIcon` in `text-danger`, the description, a `Button` "Try again" calling `onRetry` |
| `Avatar` | `img` or `span` | `size-10 rounded-full`; without `src`, the initials (first letters of the first two words) on `bg-surface-raised text-text-secondary` |
| `Badge` | `span` | `rounded-sm px-2 font-caption text-caption`, tone colours (`bg-success text-on-success`…; neutral `bg-surface-raised text-text-secondary`) |

- [ ] **Step 1: Write the failing test**

Append to `cli/test/fixtures-contract.test.ts`:
```ts
const STARTER_SET = [
  "Button", "IconButton", "Input", "Textarea", "Select", "Checkbox", "Switch", "Card", "ListItem", "TopBar",
  "TabBar", "Sidebar", "Sheet", "Dialog", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge",
];

describe("the contract app's components", () => {
  test("it has the React web guide's starter set, one file each", () => {
    for (const name of STARTER_SET) expect(read(`src/components/${name}.tsx`)).toMatch(new RegExp(`export function ${name}\\b`));
  });

  test("everything interactive shows focus, and states are announced", () => {
    for (const name of ["Button", "IconButton", "Input", "Textarea", "Select", "Checkbox", "Switch", "Card", "ListItem", "TopBar", "TabBar", "Sidebar"]) {
      expect(read(`src/components/${name}.tsx`)).toContain("focus-visible:outline-focus");
    }
    expect(read("src/components/Button.tsx")).toContain("aria-busy");
    expect(read("src/components/Input.tsx")).toContain("aria-invalid");
    expect(read("src/components/IconButton.tsx")).toContain("aria-label={label}");
    expect(read("src/components/Toast.tsx")).toContain('aria-live="polite"');
    expect(read("src/components/TabBar.tsx")).toContain('aria-current={');
  });

  test("motion comes from the design guide's roles", () => {
    expect(read("src/components/Button.tsx")).toContain("spring.snappy");
    expect(read("src/components/Sheet.tsx")).toContain("spring.smooth");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/fixtures-contract.test.ts`
Expected: FAIL — the components don't exist.

- [ ] **Step 3: Write the components**

Four of them exactly as follows; the rest from the table.

`src/components/Button.tsx` — the React web guide's example, unchanged:
```tsx
"use client";
import { motion, type HTMLMotionProps } from "motion/react";
import { spring } from "@/design/motion";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-action-primary text-on-action-primary",
  secondary: "bg-action-secondary text-on-action-secondary",
  ghost: "bg-transparent text-text-primary hover:bg-surface-raised",
};

export function Button({ variant = "primary", loading = false, disabled, className = "", children, ...props }: HTMLMotionProps<"button"> & { variant?: Variant; loading?: boolean }) {
  const inactive = disabled || loading;
  return (
    <motion.button
      whileTap={inactive ? undefined : { scale: 0.97 }}
      transition={spring.snappy}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-4 font-label text-label ${VARIANTS[variant]} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
```

`src/components/Input.tsx`:
```tsx
import { useId, type ComponentProps } from "react";

export function Input({ label, hint, error, id, className = "", ...props }: { label: string; hint?: string; error?: string } & ComponentProps<"input">) {
  const fallback = useId();
  const inputId = id ?? fallback;
  const noteId = `${inputId}-note`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="font-label text-label">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? noteId : undefined}
        className={`min-h-12 rounded-md border bg-surface px-3 font-body text-body text-text-primary ${error ? "border-danger" : "border-border"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 read-only:bg-surface-raised ${className}`}
        {...props}
      />
      {(error || hint) && (
        <p id={noteId} className={`font-caption text-caption ${error ? "text-danger" : "text-text-secondary"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
```

`src/components/ListItem.tsx`:
```tsx
import Link from "next/link";
import type { ReactNode } from "react";

export function ListItem({ title, description, meta, leading, trailing, href }: { title: string; description?: string; meta?: ReactNode; leading?: ReactNode; trailing?: ReactNode; href?: string }) {
  const body = (
    <>
      {leading}
      <span className="flex min-w-0 grow flex-col">
        <span className="truncate font-body text-body text-text-primary">{title}</span>
        {description && <span className="line-clamp-2 font-caption text-caption text-text-secondary">{description}</span>}
      </span>
      {meta && <span className="shrink-0 font-label text-label tabular-nums">{meta}</span>}
      {trailing}
    </>
  );
  const row = "flex min-h-12 items-center gap-3 px-4 py-3";
  return (
    <li className="border-b border-border last:border-b-0">
      {href ? (
        <Link href={href} className={`${row} hover:bg-surface-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`}>
          {body}
        </Link>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
}
```

`src/components/TabBar.tsx`:
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { BasketIcon, HomeIcon } from "./icons";

export const NAV_ITEMS: { href: string; label: string; icon: ComponentType }[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/products", label: "Products", icon: BasketIcon },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const current = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-12 grow flex-col items-center justify-center gap-1 py-2 font-caption text-caption ${current ? "text-action-primary" : "text-text-secondary"} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```
If `motif check` reports the safe-area padding as an arbitrary value, add `{/* motif-ok: safe area inset, not a design value */}` on the line above it — the one exception the fixture allows — and change the contract test's expected `exceptions` from 0 to 1 with a comment saying why.

`src/components/icons.tsx`:
```tsx
import type { SVGProps } from "react";

const svg = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", "aria-hidden": true } as const;

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg} className="size-5" {...p}>
    <path d="M3 11l9-8 9 8M5 10v10h14V10" />
  </svg>
);
export const BasketIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg} className="size-5" {...p}>
    <path d="M4 9h16l-2 11H6zM9 9l3-5 3 5" />
  </svg>
);
export const BackIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg} className="size-5 rtl:-scale-x-100" {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg} className="size-5" {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const AlertIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg} className="size-5" {...p}>
    <path d="M12 8v5M12 16h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
  </svg>
);
```

- [ ] **Step 4: Run the tests and the build**

Run: `cd cli && bun test test/fixtures-contract.test.ts && bun run typecheck`
Expected: PASS (including "no violations, exceptions or warnings" from Task 1, now over the components).

Run (in `tests/fixtures/react-contract-app`): `npx tsc --noEmit` then `npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/react-contract-app/src/components cli/test/fixtures-contract.test.ts
git commit -m "test(fixtures): Larder's starter components, built the React web guide's way"
```

---
### Task 3: Larder — the app shell and its three screens

**Files:**
- Create: `tests/fixtures/react-contract-app/src/mock-data.ts`, `src/app/products/page.tsx`, `src/app/products/loading.tsx`, `src/app/products/[id]/page.tsx`, `src/app/products/[id]/not-found.tsx`
- Modify: `src/app/layout.tsx` (the shell), `src/app/page.tsx` (Home)
- Test: `cli/test/fixtures-contract.test.ts` (append)

**Interfaces:**
- Consumes: the components and `NAV_ITEMS` (Task 2).
- Produces: three routes — `/` (Home), `/products` (a list), `/products/[id]` (a detail, statically generated for each product) — plus `products`, `orders`, `user`, `formatPrice(pence: number): string` from `src/mock-data.ts`. Task 4's overlay replaces Home and both product screens; 1E-2's feature tasks add screens beside them.

Screen content (Motif's own wording; every value from the theme):
- **Shell** (`layout.tsx` inside `<Providers>`): a row on desktop with `<Sidebar />` and the page; `<TabBar />` on phones; the page area `min-h-dvh pb-16 md:pb-0`, so the tab bar never covers content.
- **Home** (`/`, follows the home-dashboard pattern): `TopBar` "Home"; a greeting line in `text-text-secondary` ("Good evening, Sam"); a `Card` summarising the next delivery ("Thursday 16 October, 6–8 pm", a `Badge tone="success"` "Confirmed", the basket total via `formatPrice`); one primary `Button` "Reorder last basket"; a `heading` "Recent orders" and a list of the 3 orders as `ListItem`s (date as title, item count as description, total as `meta`).
- **Products** (`/products`, follows lists-feeds): `TopBar` "Products"; a `ul` of `ListItem`s linking to each product (name, unit as description, price as `meta`, a `Badge tone="warning"` "Low stock" or `tone="danger"` "Out of stock" as `trailing` when it applies); when `products` is empty, an `EmptyState` ("No products yet", "The shop's shelves are being stocked. Check back soon."). `loading.tsx`: six `Skeleton` rows in the same layout.
- **Product** (`/products/[id]`, follows detail-pages): `generateStaticParams` over `products`; `notFound()` when the id is unknown; `TopBar` with the product's name and `backHref="/products"`; an image placeholder (`aspect-square rounded-lg bg-surface-raised` holding a large `BasketIcon` in `text-text-secondary`); price with unit (`formatPrice` and "/ kg"); stock `Badge`; the description; one primary `Button` "Add to basket" (disabled with "Out of stock" when out). `not-found.tsx`: an `EmptyState` ("We couldn't find that product", "It may have sold out or been removed.", a link back to Products).

- [ ] **Step 1: Write the failing test**

Append to `cli/test/fixtures-contract.test.ts`:
```ts
describe("the contract app's screens", () => {
  test("Home, Products and a product, with their loading, empty and not-found states", () => {
    for (const file of ["src/app/page.tsx", "src/app/products/page.tsx", "src/app/products/loading.tsx", "src/app/products/[id]/page.tsx", "src/app/products/[id]/not-found.tsx"]) {
      expect(existsSync(join(APP, file))).toBe(true);
    }
    expect(read("src/app/products/page.tsx")).toContain("<EmptyState");
    expect(read("src/app/products/loading.tsx")).toContain("<Skeleton");
    expect(read("src/app/products/[id]/page.tsx")).toContain("notFound()");
    expect(read("src/app/products/[id]/page.tsx")).toContain('backHref="/products"');
  });

  test("one primary action per screen", () => {
    for (const file of ["src/app/page.tsx", "src/app/products/[id]/page.tsx"]) {
      const buttons = read(file).match(/<Button(?![^>]*variant=)/g) ?? [];
      expect(buttons).toHaveLength(1);
    }
  });

  test("all mock data comes from one file", () => {
    const data = read("src/mock-data.ts");
    for (const s of ["export const products", "export const orders", "export const user", "export function formatPrice"]) expect(data).toContain(s);
  });

  test("the shell has the tab bar on phones and the sidebar on desktop", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("<TabBar />");
    expect(layout).toContain("<Sidebar />");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/fixtures-contract.test.ts`
Expected: FAIL — the screens don't exist yet.

- [ ] **Step 3: Mock data**

`src/mock-data.ts`:
```ts
// Mock data for the Larder fixture. Everything here is made up.

export type Stock = "in" | "low" | "out";

export interface Product {
  id: string;
  name: string;
  unit: string;
  pricePence: number;
  stock: Stock;
  description: string;
}

export const products: Product[] = [
  { id: "oats", name: "Rolled oats", unit: "1 kg", pricePence: 240, stock: "in", description: "Jumbo rolled oats from a mill two valleys over. Good for porridge and flapjacks." },
  { id: "eggs", name: "Free-range eggs", unit: "6", pricePence: 285, stock: "low", description: "Large eggs from hens that spend their days outdoors." },
  { id: "sourdough", name: "Sourdough loaf", unit: "800 g", pricePence: 420, stock: "in", description: "Baked this morning with a three-day starter." },
  { id: "leeks", name: "Leeks", unit: "500 g", pricePence: 135, stock: "in", description: "Sweet, mild leeks, washed and trimmed." },
  { id: "cheddar", name: "Mature cheddar", unit: "250 g", pricePence: 375, stock: "in", description: "Aged for fourteen months; crumbly and sharp." },
  { id: "apples", name: "Cox apples", unit: "1 kg", pricePence: 260, stock: "out", description: "Crisp and aromatic. Back next week." },
  { id: "milk", name: "Whole milk", unit: "2 l", pricePence: 165, stock: "in", description: "From a dairy twelve miles away." },
  { id: "coffee", name: "House coffee beans", unit: "250 g", pricePence: 650, stock: "in", description: "A chocolatey medium roast, roasted on Mondays." },
];

export const orders = [
  { id: "o-1042", date: "Thursday 9 October", items: 14, totalPence: 4630 },
  { id: "o-1031", date: "Thursday 2 October", items: 11, totalPence: 3875 },
  { id: "o-1019", date: "Friday 26 September", items: 16, totalPence: 5210 },
];

export const user = { name: "Sam Okafor", email: "sam@example.com", nextDelivery: "Thursday 16 October, 6–8 pm" };

export function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
```

- [ ] **Step 4: The shell and the screens**

Write `layout.tsx`, `page.tsx`, `products/page.tsx`, `products/loading.tsx`, `products/[id]/page.tsx` and `products/[id]/not-found.tsx` from the screen content above. Route params are a promise in Next.js 16: `export default async function ProductPage({ params }: { params: Promise<{ id: string }> })` then `const { id } = await params;`.

- [ ] **Step 5: Run the tests, the build and a screenshot audit**

Run: `cd cli && bun test test/fixtures-contract.test.ts && bun run typecheck`
Expected: PASS.

Run (in `tests/fixtures/react-contract-app`): `npx tsc --noEmit` then `npm run build`
Expected: both succeed; the build lists `/`, `/products` and the 8 product pages.

Run (from `cli`): `bun src/main.ts shot --audit --routes /,/products,/products/oats --cwd ../tests/fixtures/react-contract-app --json`
Expected: 12 screenshots and no findings with severity `critical` or `major`. Fix anything it reports (a contrast or target problem here is a fixture bug), then run it again.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/react-contract-app/src cli/test/fixtures-contract.test.ts
git commit -m "test(fixtures): Larder's shell, Home, Products and product screens"
```

---
### Task 4: The seeded app: Larder with 23 planted problems

**Files:**
- Create: `tests/fixtures/assemble.ts`, `tests/fixtures/react-seeded-app/seeded-issues.json`, `tests/fixtures/react-seeded-app/README.md`, and the overlay in `tests/fixtures/react-seeded-app/overlay/`: `src/app/providers.tsx`, `src/app/page.tsx`, `src/app/promo.css`, `src/app/products/page.tsx`, `src/app/products/[id]/page.tsx`, `src/components/PromoBanner.tsx`, `src/components/PriceTag.tsx`, `src/components/RecipeCard.tsx`, `design/tokens.json` (made in Step 5), `src/styles/motif.css` (made in Step 5)
- Create: `cli/test/fixtures-seeded.test.ts`

**Interfaces:**
- Consumes: the contract app (Tasks 1–3) and its components' props; `runCheck`, `runValidate`; `tempDir`, `cleanupTempDirs`.
- Produces:
  - From `tests/fixtures/assemble.ts`: `type FixtureName = "react-contract-app" | "react-seeded-app"`; `assemble(fixture: FixtureName, dest: string): void` — copies the contract app without `node_modules/` and `.next/`, then (for the seeded app) the overlay, then deletes the paths in `seeded-issues.json`'s `remove`; refuses a destination that exists and isn't empty. Also runnable: `bun tests/fixtures/assemble.ts <fixture> <dest>`.
  - `seeded-issues.json` (format below), which 1E-2's test C grader reads.

`seeded-issues.json` format: `{ "motifSeeded": 1, "remove": string[], "issues": SeededIssue[] }`, where a `SeededIssue` is `{ id: "S-01"…, kind: "exact" | "judgement", detectedBy: "check" | "validate" | "shot" | "review", rule?: string (the motif check rule or validate code), categories: string[] (review categories that count as finding it, the first being the expected one), severity: "critical" | "major" | "minor", location: { file?: string; line?: number; screen?: string; app?: true }, summary: string }`. A location with `file` and `line` must be matched there; `file` alone matches anywhere in that file; `screen` matches that route; `app: true` matches by category alone.

- [ ] **Step 1: Write the failing test**

`cli/test/fixtures-seeded.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runValidate } from "../src/commands/validate";
import { assemble } from "../../tests/fixtures/assemble";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const SEEDED = join(import.meta.dir, "../../tests/fixtures/react-seeded-app");
const list = JSON.parse(readFileSync(join(SEEDED, "seeded-issues.json"), "utf8"));
const CATEGORIES = [
  "raw-value", "contrast", "target-size", "reduced-motion", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
];
type Issue = { id: string; kind: string; detectedBy: string; rule?: string; categories: string[]; severity: string; location: { file?: string; line?: number; screen?: string; app?: boolean }; summary: string };
const issues: Issue[] = list.issues;
const byDetector = (d: string) => issues.filter((i) => i.detectedBy === d);

describe("the seeded app's list of planted problems", () => {
  test("has at least 20 problems: at least 12 the tool can detect and 8 that need judgement", () => {
    expect(issues.length).toBeGreaterThanOrEqual(20);
    expect(issues.filter((i) => i.kind === "exact").length).toBeGreaterThanOrEqual(12);
    expect(issues.filter((i) => i.kind === "judgement").length).toBeGreaterThanOrEqual(8);
  });

  test("every entry is well formed", () => {
    expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length);
    for (const i of issues) {
      expect(i.categories.length).toBeGreaterThan(0);
      for (const c of i.categories) expect(CATEGORIES).toContain(c);
      expect(["critical", "major", "minor"]).toContain(i.severity);
      expect(Boolean(i.location.file || i.location.screen || i.location.app)).toBe(true);
      expect(i.summary.length).toBeGreaterThan(10);
    }
  });
});

describe("assemble", () => {
  test("never writes into a folder that already holds something", () => {
    const dest = tempDir("motif-seeded-");
    writeFileSync(join(dest, "keep.txt"), "mine");
    expect(() => assemble("react-seeded-app", dest)).toThrow("isn't empty");
    expect(readFileSync(join(dest, "keep.txt"), "utf8")).toBe("mine");
  });
});

describe("the assembled seeded app", () => {
  const dest = join(tempDir("motif-seeded-"), "app");
  assemble("react-seeded-app", dest);

  test("motif check reports every planted problem at its place, and nothing else", async () => {
    const r = await runCheck(dest, { positionals: [] });
    const found = [...(r.data.violations as { rule: string; file: string; line: number }[]), ...(r.data.warnings as { rule: string; file: string; line: number }[])];
    for (const issue of byDetector("check")) {
      const hit = found.find((h) => h.rule === issue.rule && (issue.location.app || (h.file === issue.location.file && h.line === issue.location.line)));
      expect(hit ? issue.id : `${issue.id} not reported`).toBe(issue.id);
    }
    for (const h of found) {
      const planted = byDetector("check").some((i) => i.rule === h.rule && (i.location.app || (i.location.file === h.file && i.location.line === h.line)));
      expect(planted ? "planted" : `unplanned ${h.rule} at ${h.file}:${h.line}`).toBe("planted");
    }
    expect(r.data.exceptions).toEqual([]);
  });

  test("motif validate reports the planted readability problem in the theme values", async () => {
    const r = await runValidate(dest);
    const findings = r.data.findings as { code: string; file: string }[];
    for (const issue of byDetector("validate")) {
      expect(findings.some((f) => f.code === issue.rule && f.file === issue.location.file)).toBe(true);
    }
    expect(findings.filter((f) => !byDetector("validate").some((i) => i.rule === f.code))).toEqual([]);
  });

  test("the files the list says to remove are gone", () => {
    for (const path of list.remove as string[]) expect(() => readFileSync(join(dest, path))).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/fixtures-seeded.test.ts`
Expected: FAIL — `tests/fixtures/assemble.ts` and the seeded app don't exist.

- [ ] **Step 3: The assembler**

`tests/fixtures/assemble.ts`:
```ts
// Builds a working copy of an eval fixture: the contract app, plus the seeded overlay for the seeded app.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export type FixtureName = "react-contract-app" | "react-seeded-app";

const FIXTURES = import.meta.dir;
const SKIP = new Set(["node_modules", ".next"]);

export function assemble(fixture: FixtureName, dest: string): void {
  if (existsSync(dest) && readdirSync(dest).length > 0) throw new Error(`${dest} isn't empty; a fixture is only assembled into an empty folder.`);
  mkdirSync(dest, { recursive: true });
  const copy = (from: string) => cpSync(from, dest, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
  copy(join(FIXTURES, "react-contract-app"));
  if (fixture === "react-seeded-app") {
    copy(join(FIXTURES, "react-seeded-app", "overlay"));
    const list = JSON.parse(readFileSync(join(FIXTURES, "react-seeded-app", "seeded-issues.json"), "utf8"));
    for (const path of list.remove as string[]) rmSync(join(dest, path), { force: true });
  }
}

if (import.meta.main) {
  const [fixture, dest] = process.argv.slice(2);
  if ((fixture !== "react-contract-app" && fixture !== "react-seeded-app") || !dest) {
    console.error("Usage: bun tests/fixtures/assemble.ts <react-contract-app|react-seeded-app> <empty folder>");
    process.exit(2);
  }
  assemble(fixture, resolve(dest));
  console.log(`Assembled ${fixture} in ${resolve(dest)}`);
}
```

- [ ] **Step 4: The overlay's code**

Each file exactly as written; the line numbers in `seeded-issues.json` depend on it.

`overlay/src/app/providers.tsx` (the `MotionConfig` is gone):
```tsx
"use client";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

`overlay/src/components/PromoBanner.tsx`:
```tsx
"use client";
import { motion } from "motion/react";

export function PromoBanner({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <section className="relative rounded-lg bg-[#F5E6D3] px-6 py-8 text-center">
      <motion.p animate={{ y: [0, -6, 0] }} transition={{ duration: 0.6, repeat: Infinity }} className="font-label text-label">
        🔥 Hot deals this week
      </motion.p>
      <h2 className="mt-2 bg-linear-to-r from-action-primary to-warning bg-clip-text font-display text-display text-transparent">
        Fresh flavours, delivered
      </h2>
      <p className="mt-2 font-caption text-caption text-text-secondary opacity-60">Offers end Sunday. Terms apply.</p>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="absolute end-2 top-2 size-5 p-0 text-text-secondary">
        ×
      </button>
    </section>
  );
}
```

`overlay/src/components/PriceTag.tsx`:
```tsx
export function PriceTag({ pence, unit }: { pence: number; unit: string }) {
  return (
    <span className="font-label text-label tabular-nums" style={{ color: "#2F7D4F" }}>
      £{(pence / 100).toFixed(2)} <span className="font-caption text-caption">/ {unit}</span>
    </span>
  );
}
```

`overlay/src/components/RecipeCard.tsx`:
```tsx
import { Card } from "./Card";

export function RecipeCard({ title, minutes }: { title: string; minutes: number }) {
  return (
    <Card>
      <h3 className="font-heading text-heading" style={{ fontFamily: "Georgia, serif" }}>
        {title}
      </h3>
      <p className="font-caption text-caption text-text-secondary">{minutes} min</p>
    </Card>
  );
}
```

`overlay/src/app/promo.css`:
```css
.promo-strip {
  background: rgb(250 240 230);
  color: var(--motif-primitive-color-dark-text-primary);
  border-radius: var(--motif-radius-md);
}
```

`overlay/src/app/page.tsx`:
```tsx
import "./promo.css";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PriceTag } from "@/components/PriceTag";
import { PromoBanner } from "@/components/PromoBanner";
import { RecipeCard } from "@/components/RecipeCard";
import { products } from "@/mock-data";

const FEATURES = [
  { icon: "🥕", title: "Fresh produce", text: "Picked this morning." },
  { icon: "🥖", title: "Daily bread", text: "Baked before dawn." },
  { icon: "🧀", title: "Local cheese", text: "From nearby farms." },
  { icon: "🚚", title: "Free delivery", text: "On orders over £40." },
  { icon: "♻️", title: "Less packaging", text: "Bring your bags back." },
  { icon: "⭐", title: "Loyalty points", text: "On every order." },
];

export default function Home() {
  const deal = products[0]!;
  return (
    <main className="px-4 py-6 text-center">
      <h1 className="font-display text-display">Welcome to Larder</h1>
      <p className="mt-2 font-caption text-caption text-text-secondary">Everything you need, delivered to your door, every day of the week, from the shop around the corner.</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button>Reorder last basket</Button>
        <Button>Shop this week's deals</Button>
        <Button>Invite a friend</Button>
      </div>
      <div className="mt-8">
        <PromoBanner />
      </div>
      <div className="promo-strip mt-8 px-4 py-3">
        Today only: {deal.name} <PriceTag pence={deal.pricePence} unit={deal.unit} />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <div className="text-title">{f.icon}</div>
            <h3 className="mt-2 font-heading text-heading">{f.title}</h3>
            <p className="font-caption text-caption text-text-secondary">{f.text}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <RecipeCard title="Leek and potato soup" minutes={35} />
        <RecipeCard title="Lemon roast chicken" minutes={80} />
      </div>
    </main>
  );
}
```

`overlay/src/app/products/page.tsx`:
```tsx
import Link from "next/link";
import { Button } from "@/components/Button";
import { PriceTag } from "@/components/PriceTag";
import { TopBar } from "@/components/TopBar";
import { products } from "@/mock-data";

export default function ProductsPage() {
  return (
    <main>
      <TopBar title="Products" />
      <ul className="p-7">
        {products.map((p) => (
          <li key={p.id} className="group flex items-center justify-between gap-3 border-b border-border py-3">
            <Link href={`/products/${p.id}`} className="inline-flex min-h-12 items-center font-body text-body">
              {p.name}
            </Link>
            <span className="text-gray-500">{p.unit}</span>
            <PriceTag pence={p.pricePence} unit={p.unit} />
            <Button variant="secondary" className="opacity-0 group-hover:opacity-100">
              Add
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

`overlay/src/app/products/[id]/page.tsx`:
```tsx
import { Button } from "@/components/Button";
import { PriceTag } from "@/components/PriceTag";
import { TopBar } from "@/components/TopBar";
import { products } from "@/mock-data";

export function generateStaticParams() {
  return products.map((p) => ({ id: p.id }));
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = products.find((p) => p.id === id)!;
  return (
    <main>
      <TopBar title={product.name} />
      <div className="px-4 py-6">
        <PriceTag pence={product.pricePence} unit={product.unit} />
        <p className="mt-4">{product.description}</p>
        <div className="mt-6 flex gap-3">
          <Button>Submit</Button>
          <Button variant="ghost">Click here</Button>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: The overlay's theme values and their (hand-edited) generated CSS**

From the repository root, make the planted readability problem and the hand-edited generated file:
```bash
bun tests/fixtures/assemble.ts react-seeded-app ../motif-seed-work
```
In `../motif-seed-work/design/tokens.json`, change `primitive.color["light-text-secondary"]` to `{ "colorSpace": "srgb", "components": [0.7059, 0.6471, 0.5843], "hex": "#B4A595" }` (too faint on the light surfaces). Then:
```bash
cd cli
bun src/main.ts tokens --cwd ../../motif-seed-work
```
Copy `../motif-seed-work/design/tokens.json` to `tests/fixtures/react-seeded-app/overlay/design/tokens.json`, and `../motif-seed-work/src/styles/motif.css` to `tests/fixtures/react-seeded-app/overlay/src/styles/motif.css`. In the overlay's `motif.css`, change the value of `--motif-radius-md` (12px in Warm) to `14px` by hand, leaving its "Generated by Motif" first line. Delete `../motif-seed-work`.

- [ ] **Step 6: The list**

`tests/fixtures/react-seeded-app/seeded-issues.json`:
```json
{
  "motifSeeded": 1,
  "remove": ["src/app/products/loading.tsx", "src/app/products/[id]/not-found.tsx"],
  "issues": [
    { "id": "S-01", "kind": "exact", "detectedBy": "check", "rule": "raw-color", "categories": ["raw-value"], "severity": "major", "location": { "file": "src/components/PriceTag.tsx", "line": 3 }, "summary": "Prices use a typed hex colour, so they ignore the theme and dark mode." },
    { "id": "S-02", "kind": "exact", "detectedBy": "check", "rule": "tailwind-arbitrary", "categories": ["raw-value"], "severity": "major", "location": { "file": "src/components/PromoBanner.tsx", "line": 6 }, "summary": "The promo banner's background is an arbitrary hex value instead of a surface role." },
    { "id": "S-03", "kind": "exact", "detectedBy": "check", "rule": "tailwind-palette", "categories": ["raw-value"], "severity": "major", "location": { "file": "src/app/products/page.tsx", "line": 17 }, "summary": "Product units use Tailwind's gray palette, which the theme removes, instead of text-secondary." },
    { "id": "S-04", "kind": "exact", "detectedBy": "check", "rule": "off-scale", "categories": ["spacing"], "severity": "minor", "location": { "file": "src/app/products/page.tsx", "line": 11 }, "summary": "The product list's padding (p-7) isn't on the spacing scale." },
    { "id": "S-05", "kind": "exact", "detectedBy": "check", "rule": "raw-font", "categories": ["typography"], "severity": "major", "location": { "file": "src/components/RecipeCard.tsx", "line": 6 }, "summary": "Recipe titles hard-code Georgia instead of the heading font role." },
    { "id": "S-06", "kind": "exact", "detectedBy": "check", "rule": "raw-motion", "categories": ["motion", "raw-value"], "severity": "minor", "location": { "file": "src/components/PromoBanner.tsx", "line": 7 }, "summary": "The promo's bobbing animation has a typed 0.6 s duration instead of a motion role." },
    { "id": "S-07", "kind": "exact", "detectedBy": "check", "rule": "primitive-use", "categories": ["raw-value", "consistency"], "severity": "major", "location": { "file": "src/app/promo.css", "line": 3 }, "summary": "The promo strip uses a primitive colour variable instead of a role." },
    { "id": "S-08", "kind": "exact", "detectedBy": "check", "rule": "raw-color", "categories": ["raw-value"], "severity": "major", "location": { "file": "src/app/promo.css", "line": 2 }, "summary": "The promo strip's background is a typed rgb() colour." },
    { "id": "S-09", "kind": "exact", "detectedBy": "check", "rule": "reduced-motion", "categories": ["reduced-motion"], "severity": "major", "location": { "app": true }, "summary": "MotionConfig reducedMotion=\"user\" is gone, so Motion animations (the bobbing promo) keep moving for people who ask for less motion." },
    { "id": "S-10", "kind": "exact", "detectedBy": "check", "rule": "generated-edited", "categories": ["consistency"], "severity": "minor", "location": { "file": "src/styles/motif.css", "line": 1 }, "summary": "The generated theme CSS was edited by hand (radius.md changed), so it no longer matches the design guide." },
    { "id": "S-11", "kind": "exact", "detectedBy": "validate", "rule": "low-contrast", "categories": ["contrast"], "severity": "critical", "location": { "file": "design/tokens.json" }, "summary": "The light text-secondary colour is too faint on the light surfaces (about 2.3:1; it needs 4.5:1)." },
    { "id": "S-12", "kind": "exact", "detectedBy": "shot", "categories": ["contrast"], "severity": "critical", "location": { "screen": "/" }, "summary": "The promo's small print is faded with opacity, so it's unreadable on the banner." },
    { "id": "S-13", "kind": "exact", "detectedBy": "shot", "categories": ["target-size"], "severity": "critical", "location": { "screen": "/" }, "summary": "The promo's dismiss button is 20×20 px, below the 24 px minimum (and 44 px on phones)." },
    { "id": "S-14", "kind": "judgement", "detectedBy": "review", "categories": ["hierarchy"], "severity": "major", "location": { "file": "src/app/page.tsx", "screen": "/" }, "summary": "Home has three primary buttons side by side, so nothing says what to do first." },
    { "id": "S-15", "kind": "judgement", "detectedBy": "review", "categories": ["anti-pattern", "hierarchy"], "severity": "minor", "location": { "file": "src/app/page.tsx", "screen": "/" }, "summary": "A grid of six identical feature cards with emoji says nothing a customer needs." },
    { "id": "S-16", "kind": "judgement", "detectedBy": "review", "categories": ["anti-pattern", "copy"], "severity": "minor", "location": { "file": "src/components/PromoBanner.tsx", "line": 8 }, "summary": "Emoji used as UI (the fire on the promo, emoji as feature icons) instead of the app's icons." },
    { "id": "S-17", "kind": "judgement", "detectedBy": "review", "categories": ["anti-pattern"], "severity": "minor", "location": { "file": "src/components/PromoBanner.tsx", "line": 10 }, "summary": "Gradient text on the promo headline, a tell of generated UI that the design guide doesn't call for." },
    { "id": "S-18", "kind": "judgement", "detectedBy": "review", "categories": ["copy"], "severity": "major", "location": { "file": "src/app/products/[id]/page.tsx", "screen": "/products/oats" }, "summary": "The product page's buttons say \"Submit\" and \"Click here\" instead of what they do." },
    { "id": "S-19", "kind": "judgement", "detectedBy": "review", "categories": ["missing-state"], "severity": "major", "location": { "file": "src/app/products/page.tsx", "screen": "/products" }, "summary": "The product list has no loading state and no empty state." },
    { "id": "S-20", "kind": "judgement", "detectedBy": "review", "categories": ["missing-state"], "severity": "major", "location": { "file": "src/app/products/[id]/page.tsx" }, "summary": "An unknown product id crashes the page: there's no not-found state." },
    { "id": "S-21", "kind": "judgement", "detectedBy": "review", "categories": ["navigation"], "severity": "major", "location": { "file": "src/app/products/[id]/page.tsx", "screen": "/products/oats" }, "summary": "The product page has no way back to the list." },
    { "id": "S-22", "kind": "judgement", "detectedBy": "review", "categories": ["anti-pattern", "platform-convention"], "severity": "major", "location": { "file": "src/app/products/page.tsx", "line": 19 }, "summary": "The Add buttons appear only on hover, so touch and keyboard users can't find them." },
    { "id": "S-23", "kind": "judgement", "detectedBy": "review", "categories": ["typography", "hierarchy"], "severity": "minor", "location": { "file": "src/app/page.tsx", "screen": "/" }, "summary": "Home centres everything and jumps from a giant headline to tiny caption text for its main paragraph." }
  ]
}
```

- [ ] **Step 7: The README**

`tests/fixtures/react-seeded-app/README.md`: a short page saying what this fixture is (Larder with 23 planted problems, for test C), how it's built (`assemble.ts`: the contract app, then `overlay/`, then the `remove` list), the table of problems from `seeded-issues.json` (id, kind, what, where), and the rule for changing it: change the overlay and the list together; `cli/test/fixtures-seeded.test.ts` checks that every problem the tool can see is still exactly where the list says, and that nothing unplanned appears.

- [ ] **Step 8: Run the tests**

Run: `cd cli && bun test test/fixtures-seeded.test.ts test/fixtures-contract.test.ts && bun run typecheck`
Expected: PASS. If `motif check` reports a planted problem on a different line, or something unplanned, correct the overlay file (not the test) so the file matches the listing above; if the code above can't produce a listed line, update that line number in `seeded-issues.json` and record why.

- [ ] **Step 9: Check the problems only a browser can see**

```bash
bun tests/fixtures/assemble.ts react-seeded-app ../motif-seed-check
cd ../motif-seed-check
npm install
npm run build
cd ../motif/cli
bun src/main.ts shot --audit --routes /,/products,/products/oats --cwd ../../motif-seed-check --json
```
Expected: the build succeeds (the planted problems are design problems, not build errors), and the audit reports a `contrast` and a `target-size` finding on `/` (S-12, S-13) and a `reduced-motion` finding (S-09). Write the date and result of this check in the fixture README, then delete `../motif-seed-check`.

- [ ] **Step 10: Commit**

```bash
git add tests/fixtures/assemble.ts tests/fixtures/react-seeded-app cli/test/fixtures-seeded.test.ts
git commit -m "test(fixtures): the seeded app, with 23 planted problems and where each one is"
```

---
### Task 5: Three new-app briefs, and the `tests/` README

**Files:**
- Create: `tests/fixtures/briefs/stride.md`, `tests/fixtures/briefs/ledgerly.md`, `tests/fixtures/briefs/bloom.md`, `tests/README.md`, `cli/test/fixtures-briefs.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: three briefs, each answering the questions `init` step 1 asks (what, who, platform, brand, feel, likes) and naming the first screens; 1E-2's test D runs `init` once per brief with gates off and checks the result.

- [ ] **Step 1: Write the failing test**

`cli/test/fixtures-briefs.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BRIEFS = join(import.meta.dir, "../../tests/fixtures/briefs");

describe("the new-app briefs", () => {
  test("there are three", () => {
    expect(readdirSync(BRIEFS).sort()).toEqual(["bloom.md", "ledgerly.md", "stride.md"]);
  });

  test("each answers what init asks in its first step, for a web app", () => {
    for (const file of readdirSync(BRIEFS)) {
      const text = readFileSync(join(BRIEFS, file), "utf8").replace(/\r\n/g, "\n");
      for (const heading of ["## What it is", "## Who it's for", "## Platform", "## Brand", "## Feel", "## Apps they like", "## First screens"]) {
        expect(text).toContain(heading);
      }
      expect(text).toContain("React web app");
    }
  });

  test("the tests README explains the fixtures and how to build them", () => {
    const readme = readFileSync(join(import.meta.dir, "../../tests/README.md"), "utf8");
    for (const s of ["react-contract-app", "react-seeded-app", "briefs", "assemble.ts", "seeded-issues.json"]) expect(readme).toContain(s);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/fixtures-briefs.test.ts`
Expected: FAIL — the folder doesn't exist.

- [ ] **Step 3: The briefs**

`tests/fixtures/briefs/stride.md`:
```markdown
# Stride

## What it is
A web app for a local running club: see this week's group runs, sign up for one, and see who else is going.

## Who it's for
Club members aged 20 to 60, from beginners to marathon runners, mostly checking on their phones on the way out of the door.

## Platform
A React web app (phone first, also used on laptops).

## Brand
The club's colour is a bright orange; no logo yet. No required fonts.

## Feel
Energetic, friendly, encouraging, clear.

## Apps they like
Strava's activity feed, and how simple Meetup's event pages are.

## First screens
A welcome page that says what the club is and how to join, sign-in, and a home screen listing this week's runs.
```

`tests/fixtures/briefs/ledgerly.md`:
```markdown
# Ledgerly

## What it is
Invoicing for freelancers: create an invoice, send it, and see at a glance who has paid and who is late.

## Who it's for
Freelance designers, writers and developers who invoice a handful of clients a month and dislike bookkeeping.

## Platform
A React web app, used mostly on laptops.

## Brand
No colours or fonts decided; the name is Ledgerly.

## Feel
Calm, trustworthy, precise, quietly premium.

## Apps they like
Linear's density and calm, and how readable Stripe's dashboards are.

## First screens
A landing page explaining the product, sign-in, and a home dashboard showing money owed, overdue invoices and recent activity.
```

`tests/fixtures/briefs/bloom.md`:
```markdown
# Bloom

## What it is
Plant care reminders: add your houseplants, and Bloom tells you when each needs water, food or a new pot.

## Who it's for
People who own a few houseplants and keep forgetting to water them; many are new to plants.

## Platform
A React web app, phone first.

## Brand
Greens are welcome but not required. No logo or fonts yet.

## Feel
Playful, fresh, gentle, reassuring.

## Apps they like
Duolingo's encouraging tone, and Headspace's soft calm.

## First screens
A welcome page, sign-in, and a home screen with today's plant tasks.
```

- [ ] **Step 4: The README**

`tests/README.md`: what `tests/` holds and how it's used:
- `fixtures/react-contract-app/` — Larder: a Next.js 16 + Tailwind v4 app with a design guide from the Warm style, the 20 starter components and three screens. Clean by construction: CI checks it with `motif validate` and `motif check`; the build and `motif shot --audit` were checked when it was made. Test B adds features to copies of it.
- `fixtures/react-seeded-app/` — the same app with 23 planted problems: `overlay/`, the files that differ, and `seeded-issues.json`, the exact list. Test C reviews a copy and is graded against the list.
- `fixtures/briefs/` — three briefs for test D's new apps.
- `fixtures/assemble.ts` — `bun tests/fixtures/assemble.ts <react-contract-app|react-seeded-app> <empty folder>` builds a working copy (then `npm install` in it to run it).
- `evals/` — the runner for tests B, C and D (Plan 1E-2). It runs through the developer's signed-in Claude Code, never an API key.
- Nothing here ships to users: skill installs copy only `skill/`. `node_modules/`, `.next/` and eval results are never committed.

- [ ] **Step 5: Run the tests**

Run: `cd cli && bun test test/fixtures-briefs.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Run everything**

Run: `cd cli && bun test --timeout 120000 && bun run typecheck`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/briefs tests/README.md cli/test/fixtures-briefs.test.ts
git commit -m "test(fixtures): three new-app briefs and the tests README"
```

---

## After this plan

- **1E-2 The eval runner** (next plan): `tests/evals/` — runs tests B (five features on copies of Larder), C (a review of the seeded app, report only) and D (`init` from each brief) through the developer's signed-in Claude Code with `claude -p`, isolated from their own plugins, settings and MCP servers (`--plugin-dir dist/claude-code --setting-sources project,local --strict-mcp-config`), one case at a time with turn and budget caps, resumable after a usage limit; grades B and D with the motif tool, the build and the type check; grades C against `seeded-issues.json`, with a model judge (also through Claude Code) only for the judgement problems and for whether unmatched critical and major findings are real; writes a results report. Refuses to run on an API key.
- Then the end-of-plans checks the developer asked for: `motif browser install`, and `motif connect 21st` with hidden key input in a real terminal; and the developer's own hands-on test of the Claude Code plugin.
