# The design guide format

Motif keeps each app's design in a design guide that lives in the project: people read `DESIGN.md`, code and tools read `design/tokens.json`. Everything you build reads both, so a screen added next month matches one added today.

When you talk to the developer, say "your design guide" and "theme values". Words like contract, token and role are for this file and for tool output only.

## Files

| File | Holds | In git? |
|---|---|---|
| `DESIGN.md` | The guide in plain words: brief, direction, foundations, motion, components, patterns, accessibility, platform notes, do/don't, change log | Yes |
| `design/tokens.json` | The exact theme values, in the W3C Design Tokens format (2025.10) | Yes |
| `design/motif.json` | The project's apps and their stacks; folders to ignore | Yes |
| `design/previews/` | Approved mockups (HTML and PNG) | Yes |
| `design/reviews/` | Review reports (Markdown and JSON) | Yes |
| `design/shots/` | Screenshots of the running app (Motif keeps it out of git) | No |
| `design/.progress.json` | Where an unfinished new app or feature stopped | No |

Start a new guide from [DESIGN.template.md](DESIGN.template.md) and [tokens.template.json](tokens.template.json). After every change run `motif validate`, then `motif tokens` to regenerate the theme code.

## DESIGN.md

- A header between two `---` lines: `motifContract: 1`, `name:` and `updated:` (YYYY-MM-DD).
- A plain summary of three to five sentences before the first section ("This app feels calm and premium…").
- Ten numbered sections, in this order: 1. Brief · 2. Direction · 3. Foundations · 4. Motion · 5. Components · 6. Patterns · 7. Accessibility · 8. Platform notes · 9. Do / Don't · 10. Change log.
- It states intent and rules. Exact values live only in `tokens.json`: write "the primary action colour", not a hex code.
- Change log lines: `- YYYY-MM-DD — what changed — why — approved by <name>`.

## tokens.json

The file's root carries the format version under Motif's extension: `"$extensions": { "dev.motif": { "motifContract": 1, "pairs": [ … ] } }`. `motif validate` refuses a file without it.

### Two layers

- `primitive.*` holds the raw palette and font families. Product code never uses these.
- Everything else is a role, and each role points at a primitive with an alias such as `"{primitive.color.light-action-primary}"`. Product code uses roles only.

### Colours

Colours use the object form with `colorSpace`, `components` (0–1) and `hex`:

```json
"light-action-primary": { "$value": { "colorSpace": "srgb", "components": [0.0941, 0.0941, 0.1059], "hex": "#18181B" } }
```

A colour role's `$value` is its light value; its dark value sits in `$extensions["dev.motif"].modes.dark`:

```json
"action-primary": {
  "$value": "{primitive.color.light-action-primary}",
  "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.dark-action-primary}" } } }
}
```

Every colour role needs a dark value; `motif validate` reports any role without one.

### Required roles

`motif validate` fails if any of these is missing.

| Group | Roles |
|---|---|
| `color` | `background`, `surface`, `surface-raised`, `border`, `text-primary`, `text-secondary`, `text-inverse`, `action-primary`, `on-action-primary`, `action-secondary`, `on-action-secondary`, `focus`, `success`, `on-success`, `warning`, `on-warning`, `danger`, `on-danger`, `info`, `on-info` |
| `font` | display, title, heading, body, label, caption — typography values with `fontFamily`, `fontSize`, `fontWeight`, `lineHeight` |
| `space` | 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16 — on a 4 px base (`space.4` is 16 px) |
| `radius` | none, sm, md, lg, full |
| `shadow` | sm, md, lg |
| `duration` | instant, fast, base, slow |
| `easing` | standard, enter, exit — cubic Bézier curves |
| `spring` | `snappy`, `smooth`, `bouncy` — each a `duration` (seconds) and a `bounce` (between −1 and 1) |

### Optional roles

A theme may leave these out. One it has must be the type shown. With `font.mono`, the generated theme has the `font-mono` class and `var(--motif-font-mono-family)`, and `motif check` points code fonts to them; without it, check proposes adding the role.

| Group | Roles |
|---|---|
| `font` | mono — code, keyboard keys and other fixed-width text; a typography value like the others. The presets start it from the system's own monospace fonts (`ui-monospace`, then Menlo, Consolas and so on), so nothing is downloaded. |

Value shapes: sizes `{ "value": 16, "unit": "px" }`; durations `{ "value": 200, "unit": "ms" }`; easing `[0.2, 0, 0, 1]`; spring duration `{ "value": 0.4, "unit": "s" }` with bounce `0.1`.

A project may add roles (a `color.chart-1`, say). Describe each new role in DESIGN.md section 3 or 4 and log it in the change log.

### Readability pairs

`$extensions["dev.motif"].pairs` lists which text or on-colour roles sit on which surfaces: `{ "fg": "color.text-secondary", "bg": "color.surface", "kind": "text" }`. `motif validate` checks every pair in light and dark: 4.5:1 for text, 3:1 for large text (`"kind": "large-text"`) and 3:1 for UI parts (`"kind": "ui"`). When you use a text role on a new surface, add the pair.

### Springs

A spring is a perceived duration and a bounce, the way Motion and SwiftUI describe them. Use `snappy` (about 0.25 s, no bounce) for presses, toggles and small changes; `smooth` (about 0.4 s, slight bounce) for screens, sheets and cards; `bouncy` only for rare playful moments such as a completed goal. Generated code turns them into each platform's own spring.

## The four rules

1. **Roles only.** Product code uses role values (through the generated theme code), never raw colours, sizes, fonts or timings, and never primitives. `motif check` finds anything that slips through.
2. **No silent new values.** If a screen truly needs something the guide doesn't have, stop and propose a change in plain words: what changes, from what to what, and why. Wait for approval, then update `tokens.json` and `DESIGN.md`, run `motif validate` and `motif tokens`, and add a change-log line. Show the proposal even when the developer has turned approvals off; in that case continue without waiting.
3. **Exceptions say why.** A deliberate raw value is allowed only with a `motif-ok: <reason>` comment on its line or the comment line above, for example a third-party brand colour that must match exactly. `motif check` lists exceptions separately. Keep them rare.
4. **Generated files are not edited.** Files written by `motif tokens` start with a "generated by Motif" header. Change `tokens.json` and regenerate instead.

## design/motif.json

```json
{ "motifContract": 1, "apps": [{ "path": ".", "stack": "react-web" }], "ignore": ["**/vendor/**"] }
```

`motif tokens` writes it from detection the first time. In a monorepo it lists each app (`apps/web` → `react-web`), all sharing one design guide. `.gitignore` is always respected as well as `ignore`.

## Commands that read the guide

- `motif validate` — checks both files: format, required roles, aliases, every readability pair in light and dark, motion ranges, and DESIGN.md's header and sections.
- `motif tokens` — writes the theme code for each app (React web: CSS variables, a Tailwind v4 theme, Motion timings).
- `motif check` — finds raw values and other drift in the app's code.
- `motif extract` — drafts `design/tokens.draft.json` from an app that has no guide yet.
- `motif preview` and `motif shot` — show mockups and the running app using the guide.
