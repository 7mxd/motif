# Visual craft

A screen looks intentional when every choice on it comes from the design guide and every choice serves one order of attention. This file is about making those choices well: what to make loud, what to keep quiet, and how to space, colour and align things so the screen reads at a glance. All values here are roles from `design/tokens.json`; the numbers are starting points, not new values.

## Hierarchy

Decide the order of attention before you lay anything out. Each screen has one primary thing (the task, the number, the next step), two or three secondary things, and everything else stays quiet. If you can't name the primary thing, the screen isn't ready to build.

The levers, from strongest to weakest:

| Lever | Loud | Quiet |
|---|---|---|
| Size | `title`, `heading` | `caption` |
| Weight | 600–700 | 400 |
| Contrast | `text-primary` | `text-secondary` |
| Position | top, start edge, first in a list | bottom, end edge, inside a menu |
| Space | room around it | packed with its neighbours |

Use one or two levers per level, not all five. A heading that is bigger, bolder, coloured, boxed and spaced out is shouting; bigger and bolder is enough.

**One primary action per view.** Only one button per view uses `action-primary`. Every other action uses `action-secondary` or a quiet text button. When two things both look primary, the person has to stop and compare them, which is the opposite of what a primary action is for.

**Type roles by job:**

- `display`: hero numbers (a balance, a score) and landing-page headlines only.
- `title`: the screen's title, once per screen.
- `heading`: section headings inside the screen.
- `body`: content people read.
- `label`: controls, buttons, tabs, form labels.
- `caption`: metadata such as timestamps, counts and helper text.

**The squint test.** Blur your eyes, or blur the screenshot. The most important thing should still stand out, and the screen should break into a few clear groups. If it turns into an even grey texture, the hierarchy is flat; if three things fight for attention, it is crowded.

## Spacing rhythm

Use only the space scale. Every gap on the screen is a `space.*` role, so screens built months apart share the same rhythm.

**Proximity carries meaning.** Things that belong together sit closer than things that don't. A label sits closer to its field than to the field above it; a card's title sits closer to its own text than to the next card. Inner spacing is smaller than outer spacing, always.

A starting rhythm on the 4 px scale:

| Between | Roles |
|---|---|
| Parts inside a control (icon and label, padding) | `space.2`–`space.3` |
| Related items (fields in a group, lines in a list row) | `space.4` |
| Groups (form sections, cards) | `space.6`–`space.8` |
| Page sections | `space.12`–`space.16` |

**Same container, same padding.** If cards use `space.4` padding on one screen, they use it everywhere. Align edges to a shared line: the start of the title, the start of the list and the start of the button should line up unless there's a reason they don't.

**Density follows the job.** Lists, tables and tools that people use all day can be denser (smaller steps of the scale, `body` and `label` sizes). Onboarding, empty states and marketing pages breathe (larger steps). Pick one density per screen and keep it.

## Type

**One family is enough; two at most.** A display family for headlines and a text family for everything else is the most a product needs. Contrast between levels comes from size and weight, not from more families.

**Line length.** Reading text is comfortable at 45–75 characters per line. On wide screens, cap the width of reading columns instead of letting paragraphs run edge to edge. Use the line height that comes with each type role; don't tighten body text to fit more in.

**Case and figures.**

- Sentence case for titles, buttons and labels ("Save changes", not "Save Changes").
- Capitals only for short labels, and only if the guide says so.
- Tabular (fixed-width) figures for prices, times, tables and anything that updates in place, so numbers don't jiggle.

**Truncation.** Decide it per element, not by accident:

- Names in lists: one line with an ellipsis, full text available on the detail screen.
- Previews (messages, descriptions): two lines.
- Never truncate prices, totals, dates or error messages.
- Never go below `caption` to make text fit. Rewrite it or give it room.

## Colour

**Roughly 60/30/10.** Background and surfaces cover most of the screen. Text and borders carry the structure. The accent stays rare, around a tenth, so that when it appears it means something.

**`action-primary` means "you can act here".** Use it for the primary button, links and selected states. Never use it for decoration, illustration fills, section headings or large backgrounds: each of those teaches people to ignore the colour that is supposed to guide them.

**Status colours are for status only.** `success`, `warning`, `danger` and `info` mark outcomes and states. Always pair them with an icon or words, never colour alone: about one in twelve men can't tell red from green. Text on a status fill uses its `on-*` role (`on-danger` on `danger`).

**Dark mode is designed, not inverted.**

- Surfaces get lighter as they rise: `surface-raised` sits above `surface`, which sits above `background`. Shadows barely show in the dark, so lightness carries the depth.
- Large saturated areas shrink; the accent appears in smaller doses.
- Text is softened slightly rather than pure white on pure black.
- Check both modes, every time. `motif validate` checks the readability pairs in each.

## Depth and corners

**Elevation tells what floats.**

| Role | For |
|---|---|
| `shadow.sm` | Raised controls, a dragged item |
| `shadow.md` | Menus, popovers, tooltips |
| `shadow.lg` | Dialogs and sheets |

Cards sitting on a surface often look better with a `border` and no shadow at all. A shadow says "this is above the page"; most cards aren't.

**Radius by size.** Small things get small corners, big things bigger ones:

- Buttons, inputs, chips: `radius.sm`–`radius.md`.
- Cards and panels: `radius.md`–`radius.lg`.
- Bottom sheets: `radius.lg` on the top corners only.
- Pills, avatars, toggles: `radius.full`.

**Nested corners stay parallel.** When a rounded element sits inside another, the inner radius is the outer radius minus the padding between them. For example, a card with 16 px corners and 8 px of padding holds an image with 8 px corners. Equal radii inside each other look pinched.

## Alignment and layout

**Start-align reading content.** Text, lists and forms align to the start edge: left in English, right in Arabic or Hebrew. Write "start" and "end" in code so right-to-left languages flip for free. Centre only short, standalone content: an empty state, a single call to action, a hero headline. Centred paragraphs are hard to read because each line starts somewhere new.

**Readable widths.**

- Forms: about 480–560 px wide, even on a large screen.
- Reading columns: about 680 px.
- Dashboards and tables: fluid, with a sensible maximum so a 2560 px monitor doesn't stretch a row across the room.

**Phone and desktop are different layouts, not one layout resized.**

- Phone: one column, stacked; the primary action within thumb reach (bottom of the screen or end of the content); navigation in a tab bar or a back button.
- Desktop: navigation beside the content; forms keep their readable width; secondary panels can sit beside the main one instead of below it.

## Imagery and icons

**One icon set, one stroke weight.** Size icons with the text they sit beside: 16 px with `caption` and small labels, 20 px with `body` and `label`, 24 px for standalone controls. Mixing sets or weights is one of the fastest ways to make a screen look assembled rather than designed.

**Icons support labels.** An icon next to a word speeds up scanning. An icon on its own is only for universal actions (close, back, search, menu, share), and even then it has an accessible name for screen readers.

**Images.**

- Keep aspect ratios consistent within a list or grid (all 1:1, or all 16:9).
- Use real-looking content in mockups, never grey boxes labelled "image".
- While loading, show a skeleton with the same aspect ratio, so nothing jumps when the image arrives.

**Avatars** fall back to the person's initials on `surface-raised` with `text-secondary`, never a broken image or a generic silhouette.

## Polishing checklist

Run this before you show a screen to the developer:

1. There is exactly one primary action, and it uses `action-primary`.
2. The squint test passes: the primary thing stands out and the screen breaks into a few groups.
3. Every gap is a `space.*` role; related things sit closer than unrelated things.
4. Every piece of text uses a type role, and reading text stays within 45–75 characters per line.
5. No raw colours, sizes or timings anywhere (`motif check` finds them).
6. Light and dark mode were both looked at, not just one.
7. Every state is present: loading, empty, error, disabled and focus.
8. Tap targets are big enough (44×44 px on touch screens; see [accessibility](accessibility.md)).
9. Long text was tried: a long name, a long title, a large number, a translated label.
10. Nothing is centred that should be start-aligned.
11. Icons come from one set, at one weight, sized with their text.
12. Any motion uses the motion roles and respects reduced motion (see [motion](motion.md)).

Before you finish, also read [anti-patterns](anti-patterns.md): the checklist above says what good looks like, and that file names the most common ways screens go wrong.
