/** Optional design sources, as verified on 2026-10-13 (docs/decisions/0002-design-sources.md). */
export type SourceId = "refero" | "21st" | "60fps" | "motion";

export interface SourceInfo {
  id: SourceId;
  label: string;
  /** What it adds to Motif, in a few words. */
  gives: string;
  /** Who can use it. */
  cost: string;
  /** Matched against "<server name>\n<server settings JSON>" in an agent's MCP settings. */
  configPattern: RegExp;
  /** Tool names as the server reports them; agents may show them with their own prefix. */
  tools: string[];
  /** One line for the developer about limits or scope. */
  note: string;
  connect: {
    /** The server name to register. */
    name: string;
    url: string;
    /** none: open; oauth: sign in inside the agent; key: a key in a header. */
    auth: "none" | "oauth" | "key";
    keyHeader?: string;
  };
  docs: string;
}

export const SOURCES: SourceInfo[] = [
  {
    id: "motion",
    label: "Motion",
    gives: "search of Motion's animation docs and examples",
    cost: "Free, no account",
    configPattern: /^motion(?:-plus)?$|mcp\.motion\.dev|motion-ai/im,
    tools: ["search-motion-docs"],
    note: "Motion+ subscribers can also add Motion's source and transition tools with npx motion-ai.",
    connect: { name: "motion", url: "https://mcp.motion.dev", auth: "none" },
    docs: "https://motion.dev/docs/ai-kit",
  },
  {
    id: "refero",
    label: "Refero",
    gives: "real app and website screens, flows and style guides to research with",
    cost: "Paid Refero plan (Pro, Team or Lifetime)",
    configPattern: /refero/i,
    tools: [
      "refero_search_styles", "refero_get_style", "refero_search_screens", "refero_get_screen", "refero_get_similar_screens",
      "refero_get_screen_image", "refero_search_flows", "refero_get_flow", "refero_search_site", "refero_search_app",
    ],
    note: "Up to 8,000 tool calls a month on paid plans.",
    connect: { name: "refero", url: "https://api.refero.design/mcp", auth: "oauth" },
    docs: "https://doc.refero.design/mcp/getting-started",
  },
  {
    id: "21st",
    label: "21st.dev",
    gives: "React component ideas and code to adapt",
    cost: "Free key; paid plans for more code copies",
    configPattern: /21st/i,
    tools: ["search", "get_component", "get_inspiration", "search_logo"],
    note: "The free key allows unlimited search and 2 code copies a day.",
    connect: { name: "21st", url: "https://21st.dev/api/mcp", auth: "key", keyHeader: "x-api-key" },
    docs: "https://21st.dev/mcp.md",
  },
  {
    id: "60fps",
    label: "60fps.design",
    gives: "iOS motion and interaction references with SwiftUI breakdowns",
    cost: "Paid 60fps MCP plan",
    configPattern: /60fps/i,
    tools: ["60fps_search_shots", "60fps_list_filters", "60fps_get_shot", "60fps_get_motion_breakdown", "60fps_get_motion_code", "60fps_get_related_shots"],
    note: "iOS shots only; code comes as SwiftUI.",
    connect: { name: "60fps", url: "https://mcp.60fps.design/mcp", auth: "oauth" },
    docs: "https://60fps.design/mcp",
  },
];

export function sourceById(id: string): SourceInfo | undefined {
  return SOURCES.find((s) => s.id === id);
}
