# Checks and screenshots

What `motif check` and `motif shot --audit` report in an Angular app, and how to fix each finding.

`motif check` reads a component's template, in its own `.html` file (the one `templateUrl` names) or inline in `template:`, and its styles, in their own `.css` or `.scss` file or inline in `styles:`. In a template it reads `style="…"`, `[style.color]="'…'"` (a literal value is read as CSS), `[style.padding.px]="13"` (the number is a length in the binding's unit), `[ngStyle]` and `[style]` objects, the class names of `class="…"`, `[class.name]`, `[class]` and `[ngClass]`, and the classes of `animate.enter` and `animate.leave`. In code it reads Motion's `animate()` and the timings of `@angular/animations`. It reports each finding at its line and column, in the `.ts` file for an inline template or styles. Template text, `{{ count > 13 }}`, `@if (count > 13)`, `(click)="go(13)"`, `[width]="300"` and strings in code are not values and are left alone.

A value that truly must stay as it is (a partner's brand colour, say) gets a `motif-ok: <reason>` comment on its line or the line above: `<!-- motif-ok: partner brand -->` in a template (inline ones too), `// motif-ok: …` in code, `/* motif-ok: … */` in styles. `motif check` lists these exceptions separately instead of as problems. Keep them rare, and always give the reason.

On Tailwind 3, Motif writes the CSS variables only, so its role classes (`bg-action-primary`, `text-body`) don't exist there and are reported as `tailwind-palette`. Use the role's variable as an arbitrary value instead: `bg-[var(--motif-color-action-primary)]`. Spacing classes (`p-4`) work on both.

## `raw-color`

A colour typed into a template, a style binding or a component's styles: hex, `rgb()`, `hsl()`, `oklch()` or a named colour.

- Example: `style="color:#333"`, `[style.color]="'#333'"`, `[ngStyle]="{ color: '#333' }"`, `color: #4B5563` in `note.css` or in `styles:`. (The same colour inside a Tailwind class, `text-[#4B5563]`, is reported as `tailwind-arbitrary`.)
- Fix: the colour role it stands for: `var(--motif-color-text-secondary)` in styles or a style binding, `text-text-secondary` as a class.

In a template file:

```html
<p class="note" [style.color]="'var(--motif-color-text-secondary)'">Saved</p>
```

```css
.note {
  border-block-end: 1px solid var(--motif-color-border);
}
```

Inline:

```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-note',
  template: `<p class="note" [style.color]="'var(--motif-color-text-secondary)'">Saved</p>`,
  styles: `
    .note {
      border-block-end: 1px solid var(--motif-color-border);
    }
  `,
})
export class Note {}
```

## `tailwind-arbitrary`

A Tailwind arbitrary value for a colour, spacing, radius, shadow or font size, in `class="…"`, `[class.name]`, `[class]` or `[ngClass]`.

- Example: `class="bg-[#123456] p-[13px] rounded-[10px]"`, `[class.p-[13px]]="on"`, `[ngClass]="{ 'gap-[7px]': on }"`.
- Fix: the matching role utility: `bg-action-primary`, `p-3`, `rounded-md`.

```html
<section class="bg-surface p-4 rounded-md" [class.shadow-md]="raised()">
  <ng-content />
</section>
```

```ts
import { NgClass } from '@angular/common';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-panel',
  imports: [NgClass],
  template: `
    <section class="bg-surface p-4 rounded-md" [ngClass]="{ 'shadow-md': raised() }">
      <ng-content />
    </section>
  `,
})
export class Panel {
  readonly raised = input(false);
}
```

## `tailwind-palette`

Tailwind's own colour palette.

- Example: `bg-blue-500`, `text-gray-600`.
- Fix: a role (`bg-action-primary`, `text-text-secondary`). Motif's theme removes Tailwind's palette, so these colours wouldn't render anyway.

## `off-scale`

A spacing, radius, font size or shadow value that isn't on the theme's scales.

- Example: `style="padding: 13px"`, `[style.padding.px]="13"`, `[style.gap]="'13px'"`, `[ngStyle]="{ 'gap.px': 13 }"`, `.row { gap: 13px }` in styles, or `p-7` when the spacing scale has no step 7. (`<img [width]="300">` is an attribute, not a style, and isn't reported.)
- Fix: the nearest step of the scale, through its variable. If the design truly needs a new step, propose a change to the design guide instead.

```html
<div class="row" [style.padding]="'var(--motif-space-4)'">
  <ng-content />
</div>
```

```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-row',
  template: `
    <div class="row" [style.padding]="'var(--motif-space-4)'">
      <ng-content />
    </div>
  `,
  styles: `
    .row {
      display: flex;
      gap: var(--motif-space-3);
    }
  `,
})
export class Row {}
```

## `raw-font`

A font family typed into a style.

- Example: `font-family: "Inter", sans-serif`, `[style.font-family]="'Georgia'"`.
- Fix: a font role (`font-body`, `font-display`) or `var(--motif-font-body-family)`. For a code font, the optional `font.mono` role (`font-mono`, `var(--motif-font-mono-family)`); if the theme has no mono role, propose adding it as a design guide change.

```html
<h1 class="font-display text-display">Orders</h1>
```

```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-title',
  template: `<h1 class="title">Orders</h1>`,
  styles: `
    .title {
      font-family: var(--motif-font-display-family);
      font-size: var(--motif-font-display-size);
    }
  `,
})
export class Title {}
```

## `raw-motion`

A duration, easing curve or spring typed into CSS, a Tailwind class, Motion's `animate()` or `@angular/animations`.

- Example: `transition: opacity 300ms ease-in`, `duration-300`, `animate.enter="duration-[400ms]"`, `animate(el, { opacity: 1 }, { duration: 0.3 })`, `animate('300ms ease-out', style({ opacity: 1 }))` from `@angular/animations`.
- Fix: `var(--motif-duration-base)` and `var(--motif-easing-standard)` in CSS, `transition` and `ease-standard` in Tailwind, or `duration`, `easing` and `spring` from the generated `motion.ts` in Motion's options ([motion](motion.md)). For `@angular/animations`, which is deprecated: move the animation to `animate.enter` with a class timed by the variables.

```html
@if (open()) {
  <p class="note" animate.enter="fade-in">Saved</p>
}
```

```ts
import { Component, ElementRef, inject, input } from '@angular/core';
import { animate } from 'motion';
import { duration, easing } from '../design/motion';

@Component({
  selector: 'app-saved',
  template: `
    @if (open()) {
      <p class="note" animate.enter="fade-in">Saved</p>
    }
  `,
  styles: `
    .fade-in {
      animation: fade var(--motif-duration-base) var(--motif-easing-standard);
    }
    @keyframes fade {
      from { opacity: 0; }
    }
  `,
})
export class Saved {
  readonly open = input(false);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  flash(): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    animate(this.element.nativeElement, { opacity: [0.6, 1] }, { duration: duration.base, ease: easing.standard });
  }
}
```

## `primitive-use`

A raw palette value (`primitive.*`) used in product code.

- Example: `var(--motif-primitive-color-indigo-700)`.
- Fix: the role that points at it (`var(--motif-color-action-primary)`).

## `reduced-motion`

The app animates, but nothing honours reduced motion. The check is split by what animates:

- **`animate.enter`, `animate.leave` and CSS animations and transitions:** need a `@media (prefers-reduced-motion: reduce)` query. `motif.css` has one, and it counts once it's imported in `src/styles.css` (`motif tokens` says how).
- **Motion and `@angular/animations`:** need a check of `matchMedia('(prefers-reduced-motion: reduce)')` somewhere in the app's code (or, with the deprecated package, `provideAnimationsAsync('noop')`).
- Fix: check the setting and turn the movement off ([motion](motion.md#reduced-motion)).

```html
<div class="toast" role="status" (animate.leave)="leave($event)">
  <ng-content />
</div>
```

```ts
import { Component, type AnimationCallbackEvent } from '@angular/core';
import { animate } from 'motion';
import { spring } from '../design/motion';

@Component({
  selector: 'app-toast',
  template: `
    <div class="toast" role="status" (animate.leave)="leave($event)">
      <ng-content />
    </div>
  `,
})
export class Toast {
  leave(event: AnimationCallbackEvent): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      event.animationComplete();
      return;
    }
    animate(event.target, { opacity: 0 }, spring.snappy).then(() => event.animationComplete());
  }
}
```

## `generated-edited`

A generated theme file was edited by hand.

- Fix: move the change into `design/tokens.json` (as a design guide change, if it's new), then run `motif tokens` to write the file again.

## Contrast

From `motif shot --audit`: text measured on screen below 4.5:1 (3:1 for large text).

- Fix: use the text role the design guide pairs with that surface (`var(--motif-color-text-primary)` on `var(--motif-color-surface-raised)`). If a pair itself fails, `motif validate` reports it too, and the role values need changing.

## Target size

From `motif shot --audit`: a control smaller than 24×24 px (critical), or smaller than 44×44 px on touch screens: the phone and tablet sizes (minor).

- Fix: `min-block-size: var(--motif-space-12)` on buttons, the same for icon buttons' width, more padding around small links, or more space between neighbouring controls.

## Reduced motion

From `motif shot --audit`: something still moves when reduced motion is on.

- Fix: for Motion and other motion from code, check `matchMedia('(prefers-reduced-motion: reduce)').matches` before animating. CSS animations, `animate.enter` included, stop by themselves once `motif.css` is imported; if one still moves, the theme isn't imported, or the animation is outside CSS.

## Screens behind a form or a click

`motif shot` captures each page as it loads. A screen that only appears after someone fills in a form, opens a panel or sends something needs a **state script**: a few lines of JavaScript, run in the page after it loads, that get it there. States are JavaScript whatever the app is written in. Keep one per state in `design/states/`, named after the state (letters, digits and dashes), and add `--state design/states/<state>.js` for each.

Angular's forms (`[(ngModel)]`, reactive forms, and a signal bound with `(input)`) listen to the field's own `input` event, so set the value and send that event:

```js
// design/states/searched.js: the results after a search. Only the search page has the field.
const field = document.querySelector("input[name=q]");
if (!field) return;
field.value = "linen";
field.dispatchEvent(new Event("input", { bubbles: true }));
// Submit the form. A field outside a <form> has none: click the page's own button instead.
field.form?.requestSubmit();
```

- It runs in every page `motif shot` captures: start it with a guard that returns on other pages (`if (!field) return;`), or capture only its page with `--routes`.
- Wait for Angular to draw the page before you look for the field: the script runs after load, and Angular may still be starting (with server rendering, a click before hydration does nothing). Don't wait a fixed time; wait for something only the running app shows. Have the root component set `data-ready` on `<body>` (`afterNextRender(() => { document.body.dataset.ready = 'true'; })` in its constructor, with `afterNextRender` imported from `@angular/core`), and start the script with `for (let i = 0; i < 50 && !document.body.hasAttribute("data-ready"); i++) await new Promise((r) => setTimeout(r, 100));`, which waits for the attribute and gives up after five seconds.
- Screenshots are named after the page and the state (`search@searched.mobile.png`); each starts as a first visit, and a script still running after 15 seconds is stopped and reported.
- Use the same `--state` options for `--save` and `--against`, and mock data only.
- For an app with right-to-left languages (Arabic, Hebrew), add `--rtl` to screenshot every screen right to left too.

## Reading the results

Run both with `--json`. `motif check` lists `violations` (each with its file, line, rule and fix), `exceptions` and `warnings`. `motif shot --audit` writes its findings to `design/shots/audit.json` in the review format, with the screen, the element and a screenshot. Fix what they report, then run them again until both are clean.
