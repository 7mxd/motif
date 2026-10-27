# Onboarding

The first minutes of an app, from opening it to the first thing that's actually useful.

## Goal

- Get people to the first moment of real value as fast as possible: the first note saved, the first booking made, the first chart drawn.
- Ask only for what is needed right now; everything else can wait until it matters.
- Explain the value of the app, not its interface. People learn buttons by using them.

## Anatomy

- **Welcome:** the app's name or mark, its brand moment (an illustration or a `brand` band, as loud as the brief asks: see [character](../character.md)), one line saying what it does for them, a primary "Get started" (`action-primary`) and a quiet secondary "I already have an account".
- **Benefit steps (optional, at most three):** one idea per step, a short `title` and one line of `body`, progress dots, and Skip on every step.
- **Permission primer:** shown just before any system permission prompt (notifications, location, camera). It says why the app needs it and what people get, with "Allow" and "Not now". The system prompt appears only after "Allow".
- **Personalisation (optional):** a few choices as chips or cards (interests, goals, experience level), several selectable at once, with Skip and a clear Continue.
- **First-run screen:** the real product, with one guided first action ("Create your first project") instead of an empty dashboard.

## Required states

- **First launch:** the full flow, from the welcome.
- **Returning but unfinished:** resume at the step where they left off, with what they already chose still selected.
- **Permission granted:** continue without comment.
- **Permission denied:** carry on without it; explain in one line where to turn it on later, and never ask again on the next screen.
- **Offline:** let them read the welcome; if a step needs the network, say so and keep their choices.
- **Loading after personalisation:** a short progress state that says what is being prepared ("Setting up your feed"), not a bare spinner.
- **Account creation failed:** say what went wrong and keep everything they entered.

## Common mistakes

- A five-screen carousel before anything happens → one welcome, then straight to the product.
- Every permission prompt on first launch → ask at the moment the feature needs it, after a primer.
- Sign-up before any value → let people look around first wherever the product allows it.
- No way to skip → every optional step has Skip, and skipping never punishes.
- A tooltip tour pointing at every button → one contextual tip, shown when the feature is first useful.
- Pre-ticked marketing consent → unticked, in plain words, separate from the terms.
- Asking for details the app won't use for weeks → ask when they are first needed.
- Progress dots that lie (the flow has more steps than dots) → show the real number of steps.

## Mobile and web

- **Mobile:** full-screen steps; the primary action at the bottom within thumb reach; swipe between benefit steps as well as buttons; the permission primer right before the system prompt; resume after the app is closed mid-flow.
- **Web:** usually no carousel at all: a landing page explains the value, sign-up is one short form, and the app opens on the first project. Use an in-app checklist ("3 of 5 done") on the home screen for setup tasks instead of blocking steps.
- **Both:** the welcome and first-run screen follow the design guide like any other screen; onboarding is not the place for a different style, but it is where the guide's brand roles are loudest.
