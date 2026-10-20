# Design variants

A variant is a named alternative look of the same app for an audience or context its idea calls for: a women's and a men's experience, a brand per customer in a white-label app, a kids' mode. [The format](../contract/spec.md#variants) says how a variant is written down. This guide says when to use one and how to do it well.

## When a variant is worth it

Offer a variant only when the app's idea calls for it: different people use the same app and the look itself is part of why it works for them, or one product ships under several brands. A good reason survives the question "what would we lose with one look?"

Not variants:

- Light and dark. Every variant already has both.
- A colour the user picks for themselves. That is the user's data, not a look.
- A seasonal or promotional skin. Change the theme values instead and log it.
- A preference for "something different". Each variant costs a full round of design, checking and screenshots, for the life of the app.

Two or three variants is a lot. Start with the default and add one.

## What to vary

Mainly colour roles: the action and accent colours, and the surfaces behind them. That is cheap to build and easy to check, and it carries most of the feeling.

Vary more only when the research shows it should, and say why in the Variants section of the design guide:

- Fonts, corner radius or motion, when the audiences really read or feel differently (a kids' mode with rounder shapes and larger type).
- Icon set, imagery and illustration style.
- The tone of copy.

Roles a variant doesn't mention keep the default's value, so leave out everything that stays the same.

On Flutter, a variant changes colours only: the theme code gives each variant its own colours and keeps the default's fonts, corners and motion. The app switches with `MotifTheme.light(variant: MotifVariant.women)` and the same for `dark`, from its own state ([how](../adapters/flutter/tokens.md#switching-variants)). Jetpack Compose is the same: the app passes `MotifTheme(variant = MotifVariant.Women)` from its state (`rememberSaveable`, or a ViewModel's `StateFlow`) ([how](../adapters/compose/tokens.md#switching-variants)).

## What never varies

The app must still read as one brand, and every variant must be as usable as the others:

- Layout, navigation and the flow through each task.
- The components and their states.
- Readability: every variant passes the same contrast pairs, in light and dark.
- Spacing and type scale, unless the research says otherwise.
- Accessibility, motion rules and the way errors are shown.
- The product's name, voice and promises.

If two variants need different layouts, they are two apps, not two variants.

## Audience variants without stereotypes

When a variant is for a group of people (by gender, age or culture), take care that it doesn't turn into a stereotype or a hierarchy.

- Don't reach for pink and blue. Pick colours from the brand and the research, and let each variant be a real palette, not a cliché.
- Keep both equally good. Same quality, same polish, the same range of content and features. Neither is the "real" app with the other as a version of it.
- Don't change what people can do, only how the app looks and sounds. Never hide features, simplify, or change prices by audience through the variant.
- Let people choose. Offer the variant as a choice, or say what decides it, and make it easy to switch. Don't guess from a name or a photo.
- Make the choice neutral to read: "Women" and "Men" next to each other, in the same style, with the same weight.
- Ask the audience, not the team. Real users, or an existing study, beat the team's assumptions.

## Checking every variant

- `motif validate` checks every readability pair in every variant, in light and dark. Fix those first.
- `motif preview --variant all` shows a mockup in each variant; `motif shot --variant all` does the same for the running app. Look at all of them, light and dark, not only the default.
- `motif shot --audit` covers every variant by default, since contrast belongs to the variant, not the app. A finding names its variant.
- `motif check` reads a colour typed inside a variant's block as that variant's colour, and suggests the role that fits it.
- Compare the variants side by side for what must stay the same: layout, spacing, hierarchy. If one variant looks like it belongs to a different product, bring it back.
- Test the switch itself: reload on each variant, and make sure no one sees the default flash before their own variant appears.
