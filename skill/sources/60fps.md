# 60fps.design

60fps.design is a library of recorded iOS interactions and animations, each with a breakdown of its timing and order. Motif uses it for motion ideas on mobile apps; it needs a separate paid MCP plan and covers iOS only.

## Is it connected?

Look in your available tools for names ending with `60fps_search_shots`, `60fps_list_filters`, `60fps_get_shot`, `60fps_get_motion_breakdown`, `60fps_get_motion_code` or `60fps_get_related_shots`. Your agent may show them with a prefix of its own; match the end of the name.

## When it's connected

1. Call `60fps_list_filters` once to see the gesture, pattern and effect filters it offers.
2. Call `60fps_search_shots` for the interaction you're designing ("pull to refresh", "card expand", "tab switch").
3. Call `60fps_get_shot` for a promising result, and `60fps_get_related_shots` for alternatives.
4. Call `60fps_get_motion_breakdown` for its timing, easing and order of movement.
5. Call `60fps_get_motion_code` only for SwiftUI apps. For other stacks, read the breakdown as a timing reference and write the animation natively.

**Map, don't copy.** Map what you learn onto the guide's motion roles: the nearest duration, easing or spring. Propose a change to the guide only if nothing fits, and wait for approval like any other change.

**Spend calls carefully.** The plan allows 2,000 calls and 250 breakdowns or code snippets a day.

## When it isn't

- Use [motion](../knowledge/motion.md) and its pattern catalogue.
- When the developer links a public 60fps page, you may read it; respect anything marked Pro.
- Never copy the library in bulk.

## Connecting

`motif connect 60fps` sets it up for Claude Code (a paid MCP plan is needed). Then the developer signs in through their agent's MCP sign-in; in Claude Code that is `/mcp`. On a computer without Claude Code it prints the settings to paste into another agent instead; the server address is `https://mcp.60fps.design/mcp`.

## Rules

- Web apps start from the motion guide: 60fps covers iOS only.
- Copy no recordings or code into the project; code you write uses the guide's motion roles.
- If a call fails or the daily limit is reached, use the motion guide and say so once.
