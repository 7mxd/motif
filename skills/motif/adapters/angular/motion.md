# Motion

How to animate an Angular app with `animate.enter`, `animate.leave`, CSS and Motion, with the design guide's motion roles. The [motion guide](../../knowledge/motion.md) says what to animate and when; this file says how.

Angular has two ways to animate. Use the new one: `animate.enter` and `animate.leave` in templates (Angular 20.2 and later), with CSS classes timed by Motif's variables. `@angular/animations` (`trigger()`, `state()`, `transition()`, `provideAnimations()`) is deprecated, and Motif writes nothing for it; don't use it in new code, and don't mix it with `animate.enter` in one component.

## Enter and leave

`animate.enter="<classes>"` adds the classes to an element as it enters the page (an `@if` turning true, a new `@for` item); `animate.leave="<classes>"` adds them as it leaves, and Angular removes the element once their animation or transition has run. Angular reads the time from the CSS, so time the classes with the variables in `motif.css`, and the guide's durations decide when the element goes. Exits are shorter than entrances:

```ts
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-saved-note',
  template: `
    @if (open()) {
      <p class="note" animate.enter="fade-in" animate.leave="fade-out">Saved</p>
    }
  `,
  styles: `
    .fade-in {
      animation: fade var(--motif-duration-base) var(--motif-easing-enter);
    }
    .fade-out {
      animation: fade var(--motif-duration-fast) var(--motif-easing-exit) reverse;
    }
    @keyframes fade {
      from { opacity: 0; transform: translateY(var(--motif-space-2)); }
    }
  `,
})
export class SavedNote {
  readonly open = input(false);
}
```

`[animate.enter]="expr"` binds the classes from an expression. On Angular 15 to 20.1, which have no `animate.enter`, toggle a class with `[class.open]` and give it a CSS transition timed by the same variables. Page changes (the router's `withViewTransitions()`): keep them short, fade the content area only, never block input.

## CSS

Hover, press and colour changes belong in CSS, timed by the variables in `motif.css`:

```html
<button class="chip">Filter</button>
```

```css
.chip {
  transition: background-color var(--motif-duration-fast) var(--motif-easing-standard);
}
.chip:hover {
  background-color: var(--motif-color-surface-raised);
}
```

Tailwind: `transition` (the base duration and standard easing), `ease-enter`, `ease-exit`, and `duration-(--motif-duration-fast)` for another duration. These work as `animate.enter` classes too.

## Motion

For springs, sequences and anything driven from code, install Motion (`npm install motion`) and take the roles from the generated `motion.ts`:

```ts
import { duration, easing, spring } from '../design/motion';
```

`duration` is in seconds (the unit Motion takes), `easing` holds cubic Bézier arrays, and `spring.smooth`, `spring.snappy` and `spring.bouncy` are Motion's springs. Pass them to `animate(element, keyframes, options)`: `spring.snappy` for a spring, `{ duration: duration.base, ease: easing.standard }` for a timed change. Never type a number of seconds, a curve or a spring: `motif check` reports them.

**A leave with a spring.** `(animate.leave)="leave($event)"` hands the leave to code: run Motion's animation on `$event.target`, and call `$event.animationComplete()` when it ends, so Angular removes the element then (without the call, Angular removes it after 4 seconds). Don't use `animate.leave` and `(animate.leave)` on the same element:

```ts
import { Component, input, type AnimationCallbackEvent } from '@angular/core';
import { animate } from 'motion';
import { spring } from '../design/motion';

@Component({
  selector: 'app-toast',
  template: `
    @if (shown()) {
      <div class="toast" role="status" (animate.leave)="leave($event)">
        <ng-content />
      </div>
    }
  `,
})
export class Toast {
  readonly shown = input(false);

  leave(event: AnimationCallbackEvent): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      event.animationComplete();
      return;
    }
    animate(event.target, { opacity: 0 }, spring.snappy).then(() => event.animationComplete());
  }
}
```

**Press feedback.** Interactive elements scale down slightly while pressed. In CSS, `:active { transform: scale(0.97) }` with a transition timed by `var(--motif-duration-fast)` ([components](components.md#example-button)). For a spring, a directive animates from the pointer events:

```ts
import { Directive, ElementRef, inject } from '@angular/core';
import { animate } from 'motion';
import { spring } from '../design/motion';

@Directive({
  selector: '[appPress]',
  host: {
    '(pointerdown)': 'press(0.97)',
    '(pointerup)': 'press(1)',
    '(pointerleave)': 'press(1)',
  },
})
export class Press {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  press(scale: number): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    animate(this.element.nativeElement, { scale }, spring.snappy);
  }
}
```

Use it in place of the CSS press, on an element whose styles don't also scale it on `:active` (both would set its transform): `<button class="chip" appPress>Filter</button>`.

**Sheets and dialogs.** The panel moves with `spring.smooth`; the backdrop fades with `duration.base`. **Lists.** `animate.enter` and `animate.leave` on the `@for` items, with the same classes. Motion runs only in the browser: start animations from events, from `(animate.leave)`, or in `afterNextRender`, never in a constructor ([platform](platform.md#server-rendering)).

Motion's springs take about 1.2 times as long to settle as the guide's model for the same role: that is the same on React web and Vue, and it is expected.

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

People who ask their system for less movement need it honoured, and `motif check`'s `reduced-motion` rule looks for it.

- **`animate.enter`, `animate.leave` and CSS animations and transitions:** need a `@media (prefers-reduced-motion: reduce)` query. `motif.css` has one, which stops CSS animations and transitions, so once the theme is imported in `src/styles.css` these stop by themselves, loops included. Add a query only for an app that doesn't import the theme.
- **Motion and other motion from code:** the theme can't stop it. Check `matchMedia('(prefers-reduced-motion: reduce)').matches` before animating, and skip the animation or end it at once, as the examples above do. `motif check` reports Motion in an app that never checks, and `motif shot --audit` reports a Motion loop that still runs.

`motif shot --audit` reports anything that still moves when reduced motion is on.
