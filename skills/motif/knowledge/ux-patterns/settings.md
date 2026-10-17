# Settings

Where people change how the app behaves for them, manage their account, and find help.

## Goal

- Let people find a setting quickly and change it with confidence.
- Make the effect of each setting clear before and after the change.
- Keep dangerous actions hard to trigger by accident and easy to understand.

## Anatomy

- **Grouped rows:** settings sorted into a few groups with headings, in a predictable order: Account, Notifications, Appearance, Privacy and security, Help, About.
- **Row:** a label, an optional one-line description in `text-secondary`, the current value, and a control.
- **Controls by behaviour:** a switch for on/off settings that apply at once; a chevron for a sub-page with more choices; a value and chevron for single choices ("Language: English").
- **Appearance:** light, dark or follow the system, shown as three choices.
- **Destructive actions:** Sign out and Delete account at the end, in their own group, with Delete in `danger`.
- **Search:** a search field at the top when there are more than about twenty settings.
- **About:** version, terms, privacy policy, licences.

## Required states

- **Loading:** skeleton rows in the final grouping.
- **Switch changed:** updates optimistically (at once), saves in the background, and reverts with a short message if saving fails.
- **Saved:** a quiet confirmation for changes that aren't visible at once ("Saved").
- **Error:** what failed, the previous value restored, and Retry.
- **Disabled:** shown with the reason ("Managed by your organisation", "Turn on notifications first").
- **Confirming a dangerous action:** a dialog that names the consequence; for anything irreversible, ask people to type the name to confirm.
- **Needs a restart or sign-in again:** said before the change, not after.

## Common mistakes

- A Save button for switches → apply switches immediately.
- Jargon labels ("Enable sync heuristics") → plain words with a one-line description.
- Deep nesting (settings inside settings inside settings) → at most two levels.
- Destructive actions beside everyday ones → a separate group at the end.
- No confirmation or undo for something irreversible → confirm, naming exactly what will be lost.
- A change that needs a restart without saying so → say so beside the setting.
- Settings that duplicate each other in two places → one home for each setting.
- A settings screen that is a single unsorted list → group and order it.

## Mobile and web

- **Mobile:** follow the platform's grouped-list style: full-width rows, native switches, sub-screens pushed from the right (from the left in right-to-left languages); the system appearance and language settings are respected by default.
- **Web:** a sidebar listing the sections and a content panel; switches save automatically, while text fields (name, email) save explicitly with a Save button and a clear saved state; the section is in the URL so people can link to it.
- **Both:** the account group shows who is signed in, so people know which account they are changing.
