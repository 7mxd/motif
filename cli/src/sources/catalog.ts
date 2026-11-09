/**
 * Optional design sources, as verified on 2026-10-13 (docs/decisions/0002-design-sources.md). Since 2.0 only Motion is
 * left: the others are retired (docs/decisions/0015-built-in-instead-of-sources.md).
 */
export type SourceId = "motion";

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
    /** The name used instead when an agent already has another server called name (usemotion.com's "motion"). */
    fallback: string;
    url: string;
    /** Open: nothing to sign in to, no key. */
    auth: "none";
  };
  docs: string;
}

export const SOURCES: SourceInfo[] = [
  {
    id: "motion",
    label: "Motion",
    gives: "search of Motion's animation docs and examples",
    cost: "Free, no account",
    // Motion's own server, whatever it's named (its installer, npx motion-ai, writes "motion" and "motion-plus" at
    // mcp.motion.dev and mcp.motion.dev/plus); another product's server named "motion" (usemotion.com) isn't this source.
    configPattern: /mcp\.motion\.dev/i,
    tools: ["search-motion-docs"],
    note: "Motion+ subscribers can also add Motion's source and transition tools with npx motion-ai.",
    connect: { name: "motion", fallback: "motion-dev", url: "https://mcp.motion.dev", auth: "none" },
    docs: "https://motion.dev/docs/ai-kit",
  },
];

export function sourceById(id: string): SourceInfo | undefined {
  return SOURCES.find((s) => s.id === id);
}

/** The sources retired in 2.0, kept so Motif can recognise what they left in agents' settings. */
export type RetiredId = "refero" | "21st" | "60fps";

export interface RetiredSource {
  id: RetiredId;
  label: string;
  /** Matched against "<server name>\n<server settings JSON>", as for SourceInfo. */
  configPattern: RegExp;
  /** What Motif has built in instead, in a few words. */
  builtIn: string;
}

export const RETIRED: RetiredSource[] = [
  { id: "refero", label: "Refero", configPattern: /refero/i, builtIn: "reference notes in the UX pattern guides" },
  { id: "21st", label: "21st.dev", configPattern: /21st\.dev\/api\/mcp/i, builtIn: "a library of pieces for every stack" },
  { id: "60fps", label: "60fps.design", configPattern: /60fps/i, builtIn: "motion recipes for every stack, SwiftUI included" },
];

export function retiredById(id: string): RetiredSource | undefined {
  return RETIRED.find((r) => r.id === id);
}
