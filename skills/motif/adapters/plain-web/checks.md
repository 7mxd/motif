# Checks and screenshots

What `motif check` and `motif shot --audit` report on a plain web site, how to fix each finding, and how to capture screens that only appear after a form or a click.

`motif check` reads CSS where it is: `.css` files, `<style>` blocks and `style=""` attributes in `.html` pages. Scripts are read as scripts (colours in strings, styles set from code). Every finding names the file, line and column.

A value that truly must stay as it is (a colour the user picked, a partner's brand colour) gets a `motif-ok: <reason>` comment on its line or the line above: `/* motif-ok: … */` in CSS, `<!-- motif-ok: … -->` in HTML, `// motif-ok: …` in scripts. `motif check` lists these exceptions separately instead of as problems. Keep them rare, and always give the reason.

## `raw-color`

A colour typed into CSS, a `style=""` attribute or a script: hex, `rgb()`, `hsl()`, `oklch()` or a named colour. That includes the site's own variables set to a colour.

- Example: `color: #8a8a8a`, `style="background: tomato"`, `--bg: #f2f2f7`, `el.style.color = "#333"`.
- Fix: the colour role it stands for, `var(--motif-color-text-secondary)`, or the site's own variable defined from that role (`--bg: var(--motif-color-background)`; [theme code](tokens.md#the-sites-own-names)).

## `off-scale`

A spacing, corner or text size that isn't on the theme's scales.

- Example: `padding: 13px`, `gap: 18px`, `border-radius: 10px`, `font-size: 15px`.
- Fix: the nearest step, `var(--motif-space-4)`, `var(--motif-radius-md)` or a text role's `var(--motif-font-body-size)`. If the design truly needs a new step, propose a change to the design guide instead.

## `raw-font`

A font family typed into CSS or a script. `@font-face` declarations are fine: they load the theme's fonts.

- Example: `font-family: Georgia, serif`.
- Fix: a font role's family, `var(--motif-font-heading-family)`. For a code font (`monospace`, Fira Code), the optional `font.mono` role's `var(--motif-font-mono-family)`; if the theme has no mono role, propose adding it as a design guide change.

## `raw-motion`

A duration or easing curve typed into a transition, an animation or a script.

- Example: `transition: transform 250ms ease-in-out`, `{ duration: 300 }` in `element.animate()`.
- Fix: `var(--motif-duration-fast)` and `var(--motif-easing-standard)`; in scripts, read them from the page ([motion](motion.md#motion-in-javascript)).

## `primitive-use`

A raw palette value used in the site.

- Example: `var(--motif-primitive-color-violet-600)`.
- Fix: the role that points at it, `var(--motif-color-action-primary)`.

## `reduced-motion`

The site animates, but nothing honours reduced motion. Linking `motif.css` fixes it for CSS animation; it already has the rule.

- Fix: link `motif.css` on every page ([theme code](tokens.md#linking-it-once-per-page)), or add a global `@media (prefers-reduced-motion: reduce)` rule for your own animations.

## `generated-edited`

`motif.css` was edited by hand.

- Fix: move the change into `design/tokens.json` (as a design guide change, if it's new), then run `motif tokens` to write the file again.

## Tailwind's rules

`tailwind-arbitrary` and `tailwind-palette` don't apply to plain web sites: class names are the site's own.

## Contrast

From `motif shot --audit`: text measured on screen below 4.5:1 (3:1 for large text).

- Fix: use the text role the design guide pairs with that surface. Look for text faded with `opacity`, and for colours that don't change in dark mode (a typed colour, or a variable set to one). If a pair itself fails, `motif validate` reports it too, and the role values need changing.

## Target size

From `motif shot --audit`: a control smaller than 24×24 px (critical), or smaller than 44×44 px on touch screens: the phone and tablet sizes (minor).

- Fix: `min-height: 3rem` on buttons and fields, `3rem` square icon buttons, more padding around small links, or more space between neighbouring controls.

## Reduced motion

From `motif shot --audit`: something still moves when reduced motion is on.

- Fix: script-driven motion checks `prefers-reduced-motion` before it starts ([motion](motion.md#reduced-motion)); CSS motion stops with `motif.css` linked.

## Screens behind a form or a click

`motif shot` captures each page as it loads. A screen that only appears after someone fills in a form, opens a panel or sends something needs a **state script**: a few lines of JavaScript that get the page there. Keep one per state in `design/states/`, named after the state (letters, digits and dashes):

```js
// design/states/sent.js: the page after a postcard is sent. Only the main page has the form.
const form = document.getElementById("form");
if (!form) return;
form.elements.to.value = "Amara Okafor";
form.elements.message.value = "Wish you were here.";
form.requestSubmit();
```

Then capture each page in its plain state and in every state, at every size (three phones, a tablet and a desktop), in light and dark. The phones are as tall as a phone browser shows while scrolling (740, 767 and 855 px), not the whole screen:

```bash
motif shot --audit --state design/states/sent.js --state design/states/errors.js
```

- The screenshots are named after the page and the state: `index@sent.mobile.png`, `index@sent.desktop.dark.png`.
- A state script runs in the page, after it loads. It can click (`element.click()`), fill fields, send a form (`form.requestSubmit()`), call the page's own functions, or wait for something (`await new Promise((r) => setTimeout(r, 500))`).
- It runs in every page `motif shot` captures, not only the one it was written for. Start it with a guard that returns on other pages, as above (`if (!form) return;`), or capture only its page with `--routes`.
- Setting a field's `value` doesn't tell the page. When the page reacts to typing (a live preview, a character count), send the event a person's typing would: `field.dispatchEvent(new Event("input", { bubbles: true }))`.
- To check that things people use together fit on one screen (a live preview and its controls), end the script by scrolling them into view: `document.getElementById("preview").scrollIntoView({ behavior: "instant" })` (instant, so a page with smooth scrolling is already there when the screenshot is taken). Each screenshot records what was on screen, and side-by-side images (`--against`) frame it.
- Each screenshot starts as a first visit: what a page or a state script stores (a theme choice, a cookie) doesn't carry over to the next screenshot.
- It's stopped after 15 seconds. A script that fails, or a dialog the page opens, is reported with the state's name, and the other screenshots go on.
- `--save` and `--against` include states, so before-and-after pictures cover them too. Use the same `--state` options for both runs.
- Use mock data in state scripts, never anything real.

## Reading the results

Run both with `--json`. `motif check` lists `violations` (each with its file, line, rule and fix), `exceptions` and `warnings`. `motif shot --audit` writes its findings to `design/shots/audit.json` in the review format, with the screen, the state, the element and a screenshot. Fix what they report, then run them again until both are clean.
