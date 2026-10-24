# Motion

How to animate a plain web site with CSS, and a little JavaScript, using the design guide's motion roles. The [motion guide](../../knowledge/motion.md) says what to animate and when; this file says how.

## The roles in CSS

Every transition and animation takes its duration and easing from the roles:

```css
.panel {
  transition: opacity var(--motif-duration-base) var(--motif-easing-standard), transform var(--motif-duration-base) var(--motif-easing-standard);
}
.toast { animation: toast-in var(--motif-duration-base) var(--motif-easing-enter); }
.toast.is-leaving { animation: toast-out var(--motif-duration-fast) var(--motif-easing-exit) forwards; }

@keyframes toast-in {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: none; }
}
@keyframes toast-out {
  to { opacity: 0; }
}
```

Never type a number of milliseconds or a Bézier curve: `motif check` reports them. A delay between staggered items is choreography, not a theme value: compute it from a role, `calc(var(--motif-duration-fast) / 4 * var(--i))`.

CSS has no springs. Where the design guide asks for a spring, use the nearest duration and `easing.standard` in CSS.

## Patterns

**Press feedback.** Interactive elements scale down slightly while pressed:

```css
.button { transition: transform var(--motif-duration-fast) var(--motif-easing-standard); }
.button:active:not(:disabled) { transform: scale(0.97); }
```

**Enter and exit.** Content that appears fades and rises in with `easing.enter`; exits are shorter, with `duration.fast` and `easing.exit`. Remove an element only after its exit ends (`animationend`).

**Dialogs and sheets.** Animate `dialog[open]` with a keyframe on open. The backdrop fades with `duration.base`:

```css
dialog[open] { animation: toast-in var(--motif-duration-base) var(--motif-easing-enter); }
dialog::backdrop { background: var(--motif-color-text-primary); opacity: 0.4; }
dialog[open]::backdrop { animation: backdrop-in var(--motif-duration-base) var(--motif-easing-enter); }
@keyframes backdrop-in { from { opacity: 0; } to { opacity: 0.4; } }
```

**Changing a page's content.** The View Transitions API cross-fades a change where the browser supports it; elsewhere the change simply happens:

```js
function show(update) {
  if (document.startViewTransition) document.startViewTransition(update);
  else update();
}
```

Keep page changes short: fade the content area only, never the navigation.

## Motion in JavaScript

When a script animates (`element.animate()`, a loop with `requestAnimationFrame`), read the roles from the page and check reduced motion first:

```js
const css = getComputedStyle(document.documentElement);
const base = Number.parseFloat(css.getPropertyValue("--motif-duration-base"));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduce) panel.animate([{ transform: "translateY(0.5rem)" }, { transform: "none" }], { duration: base, easing: css.getPropertyValue("--motif-easing-enter") });
```

## Skeletons and spinners

A pulsing skeleton or a turning spinner loops, so it has no duration of its own to type: time it from the roles, and `motif check` has nothing to report.

```css
.skeleton {
  animation: motif-pulse var(--motif-duration-slow) var(--motif-easing-standard) infinite alternate;
}
@keyframes motif-pulse {
  to { opacity: 0.5; }
}

.spinner {
  animation: motif-spin calc(var(--motif-duration-slow) * 2) linear infinite;
}
@keyframes motif-spin {
  to { transform: rotate(1turn); }
}
```

`motif.css` stops both when reduced motion is on: the skeleton shows its still frame. A stopped spinner reads as stuck, so for content prefer a skeleton, and keep a spinner to a small control, such as a button that's saving, whose label still says what's happening.

## Reduced motion

`motif.css` stops CSS animations and transitions for people who ask their system for less motion, so CSS motion needs nothing more. Script-driven motion doesn't stop on its own: check `prefers-reduced-motion` as above and skip it, or swap movement for a fade. `motif shot --audit` reports anything that still moves when reduced motion is on.
