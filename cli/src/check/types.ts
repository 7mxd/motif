import type { SourceFile } from "./files";

export const RULE_IDS = [
  "raw-color", "tailwind-arbitrary", "tailwind-palette", "off-scale", "raw-font",
  "raw-motion", "primitive-use", "reduced-motion", "generated-edited",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export type ValueKind = "color" | "space" | "radius" | "font-size" | "font-family" | "duration" | "easing" | "shadow" | "spring";

export interface Hit {
  rule: RuleId;
  file: string;
  line: number;
  column: number;
  /** The matched source text. */
  text: string;
  message: string;
  fix: string;
  /** false = seen but allowed (on the scale); extract still counts it. */
  violation: boolean;
  kind?: ValueKind;
  /** Normalised value: a colour literal, "16px", "200ms", a Tailwind key such as "blue-500", … */
  value?: string;
  /** For colours: "text" | "background" | "border" | "other". */
  context?: string;
  /** For colours set on a CSS custom property: its name (--bg). */
  prop?: string;
  /** "dark" for colours set inside a dark-mode block. */
  scheme?: "dark";
  /** The design variant whose block sets this colour ([data-variant="men"] { --accent: … }). */
  variant?: string;
  /** For backgrounds: set on the page itself (html, body, :root), not on a card or a button. */
  page?: true;
  /** For grouped output: the closest role to use instead (motif check). */
  suggestion?: string;
}

export interface Scale {
  spacePx: Set<number>;
  spaceKeys: Set<string>;
  radiusPx: Set<number>;
  radiusKeys: Set<string>;
  fontSizePx: Set<number>;
  textKeys: Set<string>;
  shadowKeys: Set<string>;
  easeKeys: Set<string>;
  /** Where the generated Motion module lives, for fix suggestions, e.g. "src/design/motion". */
  motionImport: string;
}

export function makeHit(
  file: SourceFile,
  at: (i: number) => { line: number; column: number },
  index: number,
  fields: Omit<Hit, "file" | "line" | "column">,
): Hit {
  return { file: file.path, ...at(index), ...fields };
}
