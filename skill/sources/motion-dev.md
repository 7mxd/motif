# Motion

Motion (motion.dev) is the MIT-licensed animation library the React web adapter uses. Its MCP server searches Motion's documentation and examples, for free and without an account, so you write animation code against the current API instead of memory.

## Is it connected?

Look in your available tools for one whose name ends with `search-motion-docs`. Your agent may show it with a prefix of its own; match the end of the name.

Developers with a Motion+ subscription may also have `search-motion-source`, `save-transition` and `open-transition-editor`. Use those only if they are there; never suggest buying Motion+.

## When it's connected

- Before writing animation code, search the docs for the API in question: call `search-motion-docs` with the platform (`react`, `js` or `vue`) and a short search term ("spring transition", "layout animation", "exit animation", "drag gesture", "scroll-linked", "reduced motion").
- Read the answer for the API shape and options, then write the code with the design guide's own motion values. On React web those come from the generated motion values file, never from the numbers in an example.
- When an answer and the guide disagree on a value, the guide wins; when they disagree on an API, the docs win.
- With Motion+ tools, `search-motion-source` can show how Motion implements something, and the transition tools can save or open a transition the developer asks for.

## When it isn't

- Motion's docs are public, and every page has a Markdown version: add `.md` to the page's address. Read only the page you need.
- The library itself is always free to use; nothing about building with Motion depends on the MCP server.
- [Motion](../knowledge/motion.md) covers what to animate, when, and with which roles; that guidance applies either way.

## Connecting

`motif connect motion` sets it up for Claude Code; it's free and needs no account. When you mention optional sources to the developer, suggest this one first. On a computer without Claude Code it prints the settings to paste into another agent instead; the server address is `https://mcp.motion.dev`.

## Rules

- Durations, curves and springs come from the guide's motion roles, never from examples.
- Honour reduced motion in everything you write.
- If a call fails, read the public docs instead and say so once; don't retry in a loop.
