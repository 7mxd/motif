# Components

How to build Angular components that follow the design guide, and the starter set every new app gets.

## Where they live

Standalone components in `src/app/`, one folder per component, named in kebab-case: `src/app/button/` holds `button.ts`, `button.html` and `button.css` (`button.component.ts` and so on in an app that uses the 2016 file names; follow the app). The class is the name in PascalCase (`Button`, `TopBar`) and the selector has the app's prefix (`app-top-bar`). Shared components can sit together in `src/app/ui/`; a feature's own components go in its folder (`src/app/orders/order-row/`). `ng generate component ui/button` makes the three files and the folder.

A small component may keep its template and styles inline, in `template:` and `styles:`; Motif reads those as it reads the files. Move them to files once the template grows past a few lines.

To list what exists (the first step of adding a feature), read the folders under `src/app/`, then each component's inputs for its variants and states.

## How to build one

- **Standalone.** Every component lists what its template uses in `imports` (on Angular 19 and later standalone is the default; before that, `standalone: true`). No NgModules for new code.
- **Signals.** Inputs with `input()` (or `input.required()`), events with `output()`, two-way values with `model()`, local state with `signal()` and derived values with `computed()`. Angular 15 to 17.0 use `@Input()` and `@Output()` instead.
- **Built-in control flow.** `@if`, `@for (item of items; track item.id)` and `@switch` in templates (Angular 17 and later), not `*ngIf` and `*ngFor`.
- **Content projection.** The label or body goes in `<ng-content />`; a named slot is `<ng-content select="[icon]" />`.
- **The right element.** `<button>` for actions; `<a routerLink>` for navigation; a `<label>` for every input. A component that is a button is best an attribute selector on the real element (`button[appButton]`), so every attribute and event of `<button>` passes through.
- **Variants as an input.** A `variant` input that selects a class. Styles in the component's `.css` (or `styles:`), which Angular scopes to the component, with `var(--motif-…)`: no colours, sizes or fonts of your own.
- **Hover** (`:hover`) is an extra; never hide an action behind it.
- **Focus.** Every interactive element shows a focus ring from the `focus` role with `:focus-visible`.
- **Disabled.** The `disabled` attribute (or `aria-disabled="true"` when the element must stay focusable), with a visible change.
- **Pressed.** `:active`, plus `aria-pressed` for a toggle.
- **Loading.** `aria-busy="true"`, the same width as before, and a spinner or skeleton inside.
- **Errors.** `aria-invalid="true"` on the field, and `aria-describedby` pointing at the error text, in the `danger` colour.
- **Names.** An icon-only control gets an `aria-label` (`[attr.aria-label]` when it is bound); every input a `<label>`.
- **Touch targets.** At least 44 px: `min-block-size: var(--motif-space-12)`.

## Example: Button

`src/app/button/button.ts`:

```ts
import { Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

@Component({
  selector: 'button[appButton]',
  templateUrl: './button.html',
  styleUrl: './button.css',
  host: {
    class: 'button',
    '[class.button-primary]': "variant() === 'primary'",
    '[class.button-secondary]': "variant() === 'secondary'",
    '[class.button-ghost]': "variant() === 'ghost'",
    '[disabled]': 'disabled() || loading()',
    '[attr.aria-busy]': 'loading() || null',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly loading = input(false);
  readonly disabled = input(false);
}
```

`button.html`:

```html
@if (loading()) {
  <span class="spinner" aria-hidden="true"></span>
}
<ng-content />
```

`button.css`:

```css
:host {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--motif-space-2);
  min-block-size: var(--motif-space-12);
  padding-inline: var(--motif-space-4);
  border: 0;
  border-radius: var(--motif-radius-md);
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
  cursor: pointer;
  transition: transform var(--motif-duration-fast) var(--motif-easing-standard);
}
:host(.button-primary) {
  background: var(--motif-color-action-primary);
  color: var(--motif-color-on-action-primary);
}
:host(.button-secondary) {
  background: var(--motif-color-action-secondary);
  color: var(--motif-color-on-action-secondary);
}
:host(.button-ghost) {
  background: transparent;
  color: var(--motif-color-text-primary);
}
:host(:hover) {
  filter: brightness(0.96);
}
:host(:active) {
  transform: scale(0.97);
}
:host(:focus-visible) {
  outline: 2px solid var(--motif-color-focus);
  outline-offset: 2px;
}
:host(:disabled) {
  cursor: not-allowed;
  opacity: 0.5;
}
.spinner {
  inline-size: var(--motif-space-4);
  block-size: var(--motif-space-4);
  border: 2px solid currentColor;
  border-inline-end-color: transparent;
  border-radius: 50%;
  animation: motif-spin calc(var(--motif-duration-slow) * 2) linear infinite;
}
@keyframes motif-spin {
  to { transform: rotate(1turn); }
}
```

Use it on a real button, which keeps every attribute and event of its own: `<button appButton variant="secondary" (click)="save()">Save</button>`, with `Button` in the page's `imports`. Everything here comes from the theme: the colours, the spacing, the corner radius, the label type role and the press timing. Its states are the element's own: `:hover`, `:focus-visible`, `:disabled`, pressed with `:active`, and loading with `aria-busy` and a spinner. For a press spring, use Motion ([motion](motion.md)).

## Example: IconButton

An icon-only control has no text, so it needs a name. `label` is required, and becomes the `aria-label`; `pressed` is the event:

```ts
import { Component, input, output } from '@angular/core';
import { Button } from '../button/button';

@Component({
  selector: 'app-icon-button',
  imports: [Button],
  template: `
    <button appButton variant="ghost" [attr.aria-label]="label()" (click)="pressed.emit()">
      <ng-content />
    </button>
  `,
})
export class IconButton {
  readonly label = input.required<string>();
  readonly pressed = output<void>();
}
```

## Example: TabBar

A list from data, with `@for` and the current tab marked:

```ts
import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface Tab {
  path: string;
  label: string;
}

@Component({
  selector: 'app-tab-bar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="tabs" aria-label="Main">
      @for (tab of tabs(); track tab.path) {
        <a class="tab" [routerLink]="tab.path" routerLinkActive="current" ariaCurrentWhenActive="page">{{ tab.label }}</a>
      }
    </nav>
  `,
  styles: `
    .tabs {
      display: flex;
      justify-content: space-around;
      border-block-start: 1px solid var(--motif-color-border);
      background: var(--motif-color-surface);
    }
    .tab {
      min-block-size: var(--motif-space-12);
      padding-inline: var(--motif-space-4);
      color: var(--motif-color-text-secondary);
    }
    .current {
      color: var(--motif-color-action-primary);
    }
  `,
})
export class TabBar {
  readonly tabs = input.required<Tab[]>();
}
```

## The starter set

Every new app gets these, each with all the states it needs. The names are roles; the files are in kebab-case, one folder each (`button/button.ts`, `empty-state/empty-state.ts`), and the classes in PascalCase.

| Component | For | Built on | Must show |
|---|---|---|---|
| `Button` | Actions | `<button>` (selector `button[appButton]`) | default, hover, pressed, focused, disabled, loading |
| `IconButton` | Universal actions (close, back, menu) | `Button` | as Button, plus an `aria-label` |
| `Input` | One line of text | `<input>` | label, hint, focused, error, disabled, read-only |
| `Textarea` | Longer text | `<textarea>` | as Input |
| `Select` | One choice from a list | native `<select>`, or the CDK's listbox for a custom one | label, open, selected, focused, error, disabled |
| `Checkbox` | On or off, part of a form | `<input type="checkbox">` | checked, unchecked, focused, disabled; the label is part of the target |
| `Switch` | A setting that applies at once | `<input type="checkbox" role="switch">` | on, off, focused, disabled; the label is part of the target |
| `Card` | A group of related content | `<div>` or `<article>` | default; pressed when the whole card is a link |
| `ListItem` | A row in a list | `<li>` with a link or button inside | default, hover, pressed, selected; the whole row is the target |
| `TopBar` | The screen title and its actions | `<header>` | default; scrolled (raised) |
| `TabBar` | Main navigation on phones | `<nav>` | the current tab marked with `aria-current` |
| `Sidebar` | Main navigation on desktop layouts | `<nav>` | the current item marked; collapsed |
| `Sheet` | A focused task that slides up on phones | `<dialog>`, or the CDK's `Dialog` | open, closing; focus moves in and back |
| `Dialog` | A decision that needs an answer | `<dialog>` with `showModal()`, or the CDK's `Dialog` | open; Escape closes; focus moves in and back |
| `Toast` | A short confirmation | `<div>` with a polite live region (the CDK's `LiveAnnouncer`) | shown for at least 5 s; an action when there is one |
| `Skeleton` | Content that's loading | `<div>` | the layout of the content it stands in for |
| `EmptyState` | Nothing here yet | `<div>` | a title, one line, one action |
| `ErrorState` | Something failed | `<div>` | what happened, Retry, a way out |
| `Avatar` | A person | `<img>` | the photo, or initials when there's none |
| `Badge` | A status or count | `<span>` | a word or icon beside the colour |

The [accessibility guide](../../knowledge/accessibility.md) covers names, focus and announcements in detail, and the [empty, loading and error guide](../../knowledge/ux-patterns/empty-loading-error.md) covers those three components. A project that already uses a component library (Angular Material, PrimeNG, Spartan) keeps it: restyle its components to the theme's roles ([Angular Material](tokens.md#angular-material)) rather than adding a second set beside them.

## Each component in the design guide

When you add a shared component or change one, list it in `DESIGN.md` section 5: what it's for, its variants and its states.
