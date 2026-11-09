# 0015 — Built in instead of design sources

- Date: 2026-11-09
- Status: Accepted. Amends decision 0002.
- Context: three of Motif's optional design sources needed setup: 21st.dev (a key and an MCP server), Refero (a paid plan, an MCP server and a sign-in) and 60fps.design (a paid plan, an MCP server and a sign-in). The owner asked for Motif to "look for best pieces suitable for the website, and work with nothing to look up". Motif's eval runs connect no sources (`no-mcp.json` is empty), so built-in content is the only kind Test A measures. Design: `docs/specs/2026-11-08-motif-2.0-character-and-library-design.md`, section 6.4.

## Decisions

1. **21st.dev, Refero and 60fps.design are retired in 2.0.** Each is replaced by something in the skill folder:

   | Retired | Built in instead |
   |---|---|
   | 21st.dev | a library of pieces for every stack (`skill/library/`) |
   | Refero | reference notes in the UX pattern guides (what strong apps put on welcome, home, list and detail screens) |
   | 60fps.design | motion recipes for every stack, SwiftUI included |

2. **Motion (motion.dev) stays an optional source** (free, no account). Motif works fully without it. Supahero stays too: it is a public gallery with nothing to connect.
3. **A retired source is recognised, never an error, and never edited.** `motif connect refero|21st|60fps` says the source is built in now, exits 0 and changes nothing. `motif doctor` lists a retired server still in an agent's settings under "Retired sources" as one the developer can remove.
4. **The key-entry and sign-in paths are removed.** Only 21st.dev needed a key and only Refero and 60fps.design needed a sign-in; Motion needs neither. Their code, their tests and agents.md's sign-in table went with them.

## Why

- Nothing to set up means every developer, and every eval run, gets the same Motif.
- Recognising old settings keeps an upgrade from 1.x quiet: nothing breaks, and the developer is told what they can tidy.

## Consequences

- `cli/src/sources/catalog.ts` holds `SOURCES` (Motion) and `RETIRED`; `cli/src/detect/sources.ts` adds `retiredIn`. Tests: `catalog`, `connect`, `sources`, `doctor`, `skill-modes`.
