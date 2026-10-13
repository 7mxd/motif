# Refero

Refero is a library of real product screens, user flows and style guides from shipped apps and websites. Motif uses it to research directions for a new app (`init`) and to see how good products handle a pattern (`feature`); it needs a paid Refero plan.

## Is it connected?

Look in your available tools for names ending with `refero_search_styles`, `refero_get_style`, `refero_search_screens`, `refero_get_screen`, `refero_get_similar_screens`, `refero_get_screen_image`, `refero_search_flows`, `refero_get_flow`, `refero_search_site` or `refero_search_app`. Your agent may show them with a prefix of its own; match the end of the name.

Until the developer signs in, the server may be configured but its tools missing. Treat that as not connected for now, and if the developer already ran `motif connect refero`, ask them to sign in through their agent's MCP sign-in (in Claude Code, `/mcp`) rather than connecting again.

## When it's connected

**Directions (`init`).**

1. Call `refero_search_styles` with the brief's personality words and the app's category ("calm finance app", "playful habit tracker").
2. Call `refero_get_style` for the two or three most promising results. Each returns design guidance: colour and type roles, scales, components, and do/don't rules.
3. Adapt what you learn into Motif's format, in your own words: values become roles in `design/tokens.json`, intent and rules become prose in `DESIGN.md`. Then run `motif validate`.

**Patterns (`feature`).**

1. Call `refero_search_flows` or `refero_search_screens` for the pattern you're building, with the platform (`web` or `ios`).
2. Call `refero_get_flow` for the steps of a promising flow; `refero_get_screen` or `refero_get_similar_screens` for details and alternatives.
3. Use `refero_get_screen_image` only to look; never save the image into the project.
4. Summarise what good products do (the order of steps, the states they cover, the copy they use) in your own words, and build from that summary and the matching UX pattern guide.

**Searching a specific product.** `refero_search_app` and `refero_search_site` find screens from one named app or website when the developer mentions one ("make it feel like that banking app").

**Keep the links.** Add the screens and flows you relied on to the guide's Direction section, as links only.

**Spend calls carefully.** Paid plans allow 8,000 calls a month. Search, then fetch one or two results; never fetch everything a search returns.

## When it isn't

- Start from Motif's built-in styles (`motif preview --gallery`).
- Use [visual craft](../knowledge/visual-craft.md), [anti-patterns](../knowledge/anti-patterns.md) and the UX pattern guides, such as [lists and feeds](../knowledge/ux-patterns/lists-feeds.md) or [sign-in](../knowledge/ux-patterns/sign-in.md).
- Links or screenshots the developer gives you are fine to look at.
- Don't open Refero's pages yourself: its terms forbid scraping, and its site blocks AI crawlers.

## Connecting

`motif connect refero` sets it up for Claude Code (a paid plan is needed: Pro, Team or Lifetime). Then the developer signs in through their agent's MCP sign-in; in Claude Code that is `/mcp`. On a computer without Claude Code it prints the settings to paste into another agent instead; the server address is `https://api.refero.design/mcp`.

## Rules

- Restyle everything into the guide's roles; nothing from Refero lands in code as a raw value.
- Copy nothing: no images into the project, no pasted text, no reproduced layouts. Mockups stay original.
- If a call fails or the monthly limit is reached, switch to the free baseline above and say so once.
