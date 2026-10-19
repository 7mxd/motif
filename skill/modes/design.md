# Design: where to start

Use this when the developer types /design, or asks for help with their app's design without saying what they want. Your only job here is to find out what they want and hand over to the right mode.

## 1. Check for unfinished work

If `design/.progress.json` exists, say in one line what was done and what comes next, and offer to continue it first.

## 2. Understand the request

If the request already says what they want ("start a recipe app", "add a settings screen", "my app looks dated"), skip the question and go to that mode.

Otherwise ask one question, putting first the option that fits this folder (from `motif doctor --json`):

- **Start a new app**: first when `apps` is empty.
- **Add a feature**: first when there's an app with a valid design guide.
- **Improve my app's look**: first when there's an app without a design guide.
- Or tell me in your own words.

## 3. Say what will happen

In one or two sentences, tell the developer what the mode does and where it will stop for them. For example: "I'll ask a few quick questions, show you two or three looks side by side, and build once you've picked one. Say 'skip previews' any time if you'd rather I just build."

## 4. A variant

If they ask for a variant (a look for another audience or context, or a brand per customer), don't write it straight away. Do a short research step first: how comparable apps handle it, what the connected design sources show, and the pitfalls. Then say in plain words what would differ and what stays the same, and ⏸ wait for approval before changing `design/tokens.json` or `DESIGN.md`. Read [variants](../knowledge/variants.md) for when a variant is worth it, what to vary and how to avoid stereotypes. In an existing app that is a design guide change, handled in [feature](feature.md) step 5, with a new `## Variants` section if there is none.

## 5. Mention anything missing, once

If `motif doctor --json` reported something `needed` that the mode uses, say it now in one sentence with its fix, then carry on:

- No browser: "Mockups and screenshots need a browser. When we get there, I can download a private one (about 120 MB, about 300 MB on disk) if you'd like."
- No Node.js for a React app: "Your app needs Node.js to run; install it from nodejs.org and I'll take it from there."
- A design guide with problems: "Your design guide has a few problems; I'll fix them first."

## 6. Continue

- Start a new app: [init](init.md)
- Add a feature: [feature](feature.md)
- Improve my app's look: [review](review.md)
