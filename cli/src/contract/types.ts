export const MOTIF_EXT = "dev.motif";

export const KNOWN_TYPES = [
  "color", "dimension", "fontFamily", "fontWeight", "duration", "cubicBezier", "number",
  "strokeStyle", "border", "transition", "shadow", "gradient", "typography",
] as const;

export type TokenType = (typeof KNOWN_TYPES)[number];

export interface FlatToken {
  /** Dot path, e.g. "color.text-primary". */
  path: string;
  /** Own $type, else the nearest group's $type; null if none. May be an unknown name. */
  type: string | null;
  /** Raw $value as written (aliases unresolved). */
  value: unknown;
  extensions: Record<string, unknown> | undefined;
  /** 1-based line of the token's name in the file. */
  line: number;
}

export interface TokenDocument {
  file: string;
  tokens: Map<string, FlatToken>;
  rootExtensions: Record<string, unknown> | undefined;
}
