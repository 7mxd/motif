# Components

How to build components for a plain web site with HTML and CSS, so they follow the design guide, and the starter set.

## Where they live

Shared components live in `components.css` in the site folder. Each one starts with a comment line naming it, so people and agents can list them:

```css
/* Component: Button — actions: primary (default), secondary, ghost */
```

To list what exists (the first step of adding a feature), read the `Component:` lines in `components.css`, then each one's classes for its variants and states. A page's own layout goes in `styles.css`, never a one-off button or field.

A component is an HTML pattern with classes: a base class named after the component (`.button`), a class per variant (`.button-secondary`), and classes for its parts (`.field-label`, `.field-hint`). States come from the element and its attributes, not from extra classes.

## How to build one

- **The right element.** `button` for actions, `a` for navigation, a `label` for every field, `dialog` for dialogs and sheets, `details` for disclosure.
- **Variants as classes.** One class per variant, theme values only. No `style=""` attributes.
- **Hover.** Inside `@media (hover: hover)`, as an extra: never hide an action behind it.
- **Focus.** Every interactive element shows a focus ring from the `focus` role: `outline: 2px solid var(--motif-color-focus); outline-offset: 2px;` under `:focus-visible`.
- **Disabled.** The `disabled` attribute (or `aria-disabled="true"` when the element must stay focusable), styled with `:disabled` and `[aria-disabled="true"]`.
- **Loading.** `aria-busy="true"` on the element, styled with `[aria-busy="true"]`; keep its width.
- **Errors.** `aria-invalid="true"` on the field and `aria-describedby` pointing at the error text, styled with `[aria-invalid="true"]` and shown in `danger`. Keep the error element empty until there's an error, rather than `hidden`: a field's description includes hidden text, so screen readers would read the error before there is one.
- **Touch targets.** At least 44 px: `min-height: 3rem` on buttons and fields, `3rem` square icon buttons.

## Example: Button

```html
<button class="button" type="button">Save</button>
<button class="button button-secondary" type="button">Cancel</button>
<button class="button" type="submit" aria-busy="true">Saving…</button>
```

```css
/* Component: Button — actions: primary (default), secondary */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--motif-space-2);
  min-height: 3rem;
  padding-inline: var(--motif-space-5);
  border: 0;
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-action-primary);
  color: var(--motif-color-on-action-primary);
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
  font-weight: var(--motif-font-label-weight);
  line-height: var(--motif-font-label-line-height);
  cursor: pointer;
  transition: transform var(--motif-duration-fast) var(--motif-easing-standard);
}
@media (hover: hover) {
  .button:hover:not(:disabled) { filter: brightness(0.94); }
}
.button:active:not(:disabled) { transform: scale(0.97); }
.button:focus-visible { outline: 2px solid var(--motif-color-focus); outline-offset: 2px; }
.button:disabled { cursor: not-allowed; opacity: 0.5; }
.button[aria-busy="true"] { cursor: progress; }
.button-secondary { background: var(--motif-color-action-secondary); color: var(--motif-color-on-action-secondary); }
```

## Example: Field

```html
<div class="field">
  <label class="field-label" for="email">Email</label>
  <input class="field-input" id="email" name="email" type="email" autocomplete="email" aria-describedby="email-error">
  <p class="field-error" id="email-error"></p>
</div>
```

```css
/* Component: Field — a labelled input, textarea or select, with a hint and an error */
.field { display: grid; gap: var(--motif-space-2); }
.field-label { color: var(--motif-color-text-primary); font-family: var(--motif-font-label-family); font-size: var(--motif-font-label-size); font-weight: var(--motif-font-label-weight); }
.field-input {
  min-height: 3rem;
  padding: var(--motif-space-3) var(--motif-space-4);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-surface);
  color: var(--motif-color-text-primary);
  font-family: var(--motif-font-body-family);
  font-size: var(--motif-font-body-size);
}
.field-input:focus-visible { outline: 2px solid var(--motif-color-focus); outline-offset: 2px; }
.field-input[aria-invalid="true"] { border-color: var(--motif-color-danger); }
.field-error { margin: 0; color: var(--motif-color-danger); font-family: var(--motif-font-caption-family); font-size: var(--motif-font-caption-size); }
.field-error:empty { display: none; }
```

Show the error with a few lines of script: when the field is left empty and when the form is sent, set `aria-invalid="true"` on the field and put the message in its error (`error.textContent = "Enter an email address like name@example.com."`); empty it again once the field is fixed.

## The starter set

A new site gets the components its pages use, each with every state it needs, from this set:

| Component | For | Built on | Must show |
|---|---|---|---|
| `Button` | Actions | `button` | default, hover, pressed, focused, disabled, loading |
| `IconButton` | Universal actions (close, back, menu) | `button` with an `aria-label` | as Button |
| `Field` | Text, longer text or a choice from a list | `label` with `input`, `textarea` or `select` | label, hint, focused, error, disabled, read-only |
| `Checkbox` | On or off, part of a form | `input type="checkbox"` inside its `label` | checked, unchecked, focused, disabled |
| `Choice` | One option of a few, shown as a chip | `input type="radio"` inside its `label` | chosen, focused, disabled |
| `Switch` | A setting that applies at once | `input type="checkbox" role="switch"` | on, off, focused, disabled |
| `Card` | A group of related content | `article` or `div` | default; pressed when the whole card is a link |
| `ListItem` | A row in a list | `li`, with a link or button inside when it does something | default, hover, pressed |
| `TopBar` | The page title and its actions | `header` | default |
| `TabBar` | Main navigation on phones | `nav` with links | the current page marked with `aria-current="page"` |
| `Sidebar` | Main navigation on wide screens | `nav` with links | the current page marked |
| `Dialog` | A decision that needs an answer | `dialog`, opened with `showModal()` | open; Escape closes; focus returns |
| `Sheet` | A focused task that slides up on phones | `dialog` at the bottom of the screen | open, closing |
| `Toast` | A short confirmation | `div role="status"` | shown for at least 5 s; an action when there is one |
| `Skeleton` | Content that's loading | `div` | the layout of the content it stands in for |
| `EmptyState` | Nothing here yet | `div` | a title, one line, one action |
| `ErrorState` | Something failed | `div` | what happened, Retry, a way out |
| `Avatar` | A person | `img` | the photo, or initials when there's none |
| `Badge` | A status or count | `span` | a word beside the colour |

The [accessibility guide](../../knowledge/accessibility.md) covers names, focus and announcements in detail, and the [empty, loading and error guide](../../knowledge/ux-patterns/empty-loading-error.md) covers those three components.

## Each component in the design guide

When you add a shared component or change one, give it its `Component:` line in `components.css` and list it in `DESIGN.md` section 5: what it's for, its variants and its states.
