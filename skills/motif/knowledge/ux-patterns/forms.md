# Forms and validation

Collecting information from people: anything from a single field to a multi-step application.

## Goal

- Collect accurate information with the least effort.
- No surprises: people know what's needed before they start, and what went wrong if something did.
- Never lose what people typed.

## Anatomy

- **Labels:** above each field, in `label`, always visible.
- **Helper text:** below the label or field in `caption`, for format hints ("We'll only use this for receipts").
- **Required or optional:** mark whichever is the minority. If most fields are required, mark the optional ones "(optional)".
- **Grouped sections:** related fields under a `heading` (Contact, Address, Payment), with `space.6`–`space.8` between groups.
- **One column:** fields stacked, so the eye moves straight down.
- **Inputs that match the data:** radio buttons for up to about seven options, a select or a searchable list beyond that, a real date picker for dates, a toggle for on/off settings that apply at once.
- **Actions:** the primary submit at the end ("Save changes", "Create account"), with Cancel or Back as a secondary action.
- **Multi-step forms:** a progress indicator ("Step 2 of 4"), Back on every step, and a review step before the final submit.

## Required states

- **Default, focused and filled:** each visibly different; the focus ring uses the `focus` role.
- **Invalid:** shown inline next to the field after it loses focus (on blur) or on submit, never on every keystroke.
- **Valid:** only when it helps, such as password strength or a username that's available.
- **Disabled and read-only:** disabled for fields that don't apply yet; read-only for values people can see but not change.
- **Submitting:** the button shows progress and can't be pressed twice.
- **Success:** confirm what happened and where it went ("Saved. Your profile is updated.").
- **Server error:** a message saying what went wrong; everything typed is kept.
- **Unsaved changes:** leaving with unsaved changes asks whether to discard them.

## Common mistakes

- Validating on every keystroke → validate on blur and on submit; clear the error as soon as it's fixed.
- "Invalid input" → say what's wrong and how to fix it ("Use the format DD/MM/YYYY").
- Clearing fields after an error → keep everything.
- Two-column forms → one column (short related pairs like first and last name can share a row).
- Placeholders as labels → visible labels; placeholders only for examples.
- A disabled submit button with no reason → keep it enabled and explain what's missing when pressed.
- Fields nobody needs → remove them; every field costs people time.
- Going back resets the form → keep its state between steps.
- Asking for the same information twice → reuse what they entered ("Same as shipping address").

## Mobile and web

- **Mobile:** the right keyboard for each field (email, phone, number); autofill hints for names, addresses and payment; Next and Done keys that move between fields; the focused field stays above the keyboard; the submit button pinned at the bottom for long forms.
- **Web:** a logical tab order; Enter submits single-field forms (search, sign-in); long forms show an error summary at the top that links to each field, and focus moves there when submitting fails; width capped at about 560 px.
- **Both:** browser and platform autofill work, because fields use their real types and autocomplete values.
