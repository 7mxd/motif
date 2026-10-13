# 0002 — Design sources, as they really are

- Date: 2026-10-13
- Status: Accepted
- Context: spec §8 (sources and the free baseline) and §15 risk 3 (record the sources' real MCP tool names). Verified against official docs, repositories and the live MCP endpoints.

## Verified facts

| Source | MCP server | Sign-in and cost | Tools | Public pages |
|---|---|---|---|---|
| Motion | `https://mcp.motion.dev` (HTTP) | None; free. Motion+ (`https://mcp.motion.dev/plus`) is paid, OAuth | `search-motion-docs`; Motion+: `search-motion-source`, `save-transition`, `open-transition-editor` | All docs as Markdown; library MIT |
| Refero | `https://api.refero.design/mcp` (HTTP) | OAuth or bearer token; paid plans only, 8,000 calls/month | `refero_search_styles`, `refero_get_style`, `refero_search_screens`, `refero_get_screen`, `refero_get_similar_screens`, `refero_get_screen_image`, `refero_search_flows`, `refero_get_flow`, `refero_search_site`, `refero_search_app` | Terms forbid scraping; AI crawlers blocked |
| 21st.dev | `https://21st.dev/api/mcp` (HTTP) | `x-api-key` header (free key) or OAuth; free: unlimited search, 2 code copies a day | `search`, `get_component`, `get_inspiration`, `search_logo` (`generate` with AI plans); `21st_magic_*` names retired | Pages readable for AI input, not training; no bulk collection |
| 60fps.design | `https://mcp.60fps.design/mcp` (HTTP) | OAuth with a licence key; separate paid plan; iOS only, SwiftUI code | `60fps_search_shots`, `60fps_list_filters`, `60fps_get_shot`, `60fps_get_motion_breakdown`, `60fps_get_motion_code`, `60fps_get_related_shots` | Public pages readable; no bulk copying |
| Supahero | None | Free gallery | — | All rights reserved; images and taglines only |

## Decisions

1. **Detection** by tool names (the skill) and by server addresses in agent settings (`motif doctor`), from one catalog: `cli/src/sources/catalog.ts`. Agents show tool names with their own prefixes, so the skill matches the end of the name.
2. **Motion is the recommended first source**: free, no account, and it serves the library the React web adapter uses.
3. **Refero** is used only when connected. Without it, Motif relies on its presets and knowledge files and never reads Refero's pages itself.
4. **21st.dev**: search freely, fetch code only for the component chosen (free keys allow two copies a day), restyle everything.
5. **60fps.design** is for mobile motion ideas; web apps use the motion guide.
6. **Supahero** has nothing to connect; its public pages are read only when building a landing page.
7. **`motif connect`** runs `claude mcp add --transport http --scope user …` (user-level settings, nothing in the project). OAuth sources sign in inside the agent; the 21st.dev key is read with hidden input in the developer's own terminal and refused otherwise.

## Consequences

- Where §8.2 of the spec differs (Refero described as free to use, 60fps not iOS-only, old tool names), this record applies.
- Re-check these facts before each release; they change.
