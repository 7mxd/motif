# Sign-in and sign-up

Getting into an account, creating one, and getting back in when something goes wrong.

## Goal

- Get people in with the least effort and the least risk.
- Make recovery easy: a forgotten password or an expired link is a normal path, not an error.
- Never make a returning person feel like a stranger: remember the email they used, offer the method they used last.

## Anatomy

- **Fastest method first:** a passkey or the platform's own sign-in when available, then social options, then email.
- **Email field:** labelled "Email", with the email keyboard and autocomplete hints.
- **Password field:** labelled "Password", with a Show/Hide toggle inside the field.
- **Primary action:** "Sign in" or "Create account" (`action-primary`), full width of the form.
- **"Forgot password?":** a quiet link next to the password field, not hidden at the bottom.
- **Switch link:** "New here? Create an account" / "Already have an account? Sign in".
- **Sign-up extras:** the password rules shown before typing, and the terms in one line of `caption` text with links.
- **Magic link:** "Email me a sign-in link" as an alternative to a password.
- **One-time code field:** accepts paste and the platform's code autofill; the digits can be typed in one go.

## Required states

- **Empty:** the form with focus in the first field.
- **Typing:** no errors while people are still typing.
- **Invalid email:** checked when the field loses focus, with a specific message ("Enter an email like name@example.com").
- **Wrong email or password:** one message that doesn't say which was wrong, and the password field cleared only if the platform requires it.
- **Too many attempts:** say when they can try again, and offer the reset link.
- **Loading:** the button shows progress and can't be pressed twice; the fields stay visible.
- **Success:** go straight to where they were heading, not to a generic home.
- **Offline:** say there's no connection and keep everything typed.
- **"Check your inbox":** the address the email went to, and a Resend button that waits about a minute before it works again.
- **Expired or used link:** say so plainly and offer a new link in one tap.

## Common mistakes

- Placeholders as labels → visible labels above each field.
- Blocking paste in password or code fields → allow paste and password managers.
- Password rules revealed only after a failed attempt → show them before typing.
- Clearing the form after an error → keep what was typed.
- A confirm-password field → a Show/Hide toggle instead.
- A bare "Error" or "Something went wrong" → what happened and what to do next.
- Social buttons louder than the main path → one primary action; the others are secondary.
- A captcha before anyone has done anything suspicious → only after repeated failures.
- Signing people out on every app update → keep them signed in until they choose otherwise.

## Mobile and web

- **Mobile:** the email keyboard for email; autocomplete hints (`username`, `current-password`, `new-password`, `one-time-code`) so the platform offers saved passwords and codes from messages; biometric re-entry for returning people; the primary button stays visible above the keyboard.
- **Web:** a form about 400–480 px wide; on a wide screen, a `brand` panel beside it with a quote, an illustration or a preview of the app (see [character](../character.md)), or for a quiet brief a centred card on a calm background; Enter submits; focus starts in the first field; the browser's password manager works (real form fields with the right autocomplete values).
- **Both:** the same layout and copy for sign-in and sign-up where possible, so switching between them doesn't feel like a new page.
