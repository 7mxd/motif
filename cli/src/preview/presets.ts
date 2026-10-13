import { loadTokenDocument } from "../contract/load";
import { buildTheme, type Theme } from "../generate/theme";
import boldAbout from "../../../skill/presets/bold/about.md" with { type: "text" };
import boldTokens from "../../../skill/presets/bold/tokens.json" with { type: "text" };
import darkTechAbout from "../../../skill/presets/dark-tech/about.md" with { type: "text" };
import darkTechTokens from "../../../skill/presets/dark-tech/tokens.json" with { type: "text" };
import editorialAbout from "../../../skill/presets/editorial/about.md" with { type: "text" };
import editorialTokens from "../../../skill/presets/editorial/tokens.json" with { type: "text" };
import minimalAbout from "../../../skill/presets/minimal/about.md" with { type: "text" };
import minimalTokens from "../../../skill/presets/minimal/tokens.json" with { type: "text" };
import playfulAbout from "../../../skill/presets/playful/about.md" with { type: "text" };
import playfulTokens from "../../../skill/presets/playful/tokens.json" with { type: "text" };
import softAbout from "../../../skill/presets/soft/about.md" with { type: "text" };
import softTokens from "../../../skill/presets/soft/tokens.json" with { type: "text" };
import trustAbout from "../../../skill/presets/trust/about.md" with { type: "text" };
import trustTokens from "../../../skill/presets/trust/tokens.json" with { type: "text" };
import warmAbout from "../../../skill/presets/warm/about.md" with { type: "text" };
import warmTokens from "../../../skill/presets/warm/tokens.json" with { type: "text" };

// With module "Preserve", TypeScript types .json imports as parsed objects; with { type: "text" } Bun gives the file's text.
const text = (file: unknown) => file as string;

export interface EmbeddedPreset {
  id: string;
  tokens: string;
  about: string;
}

export const EMBEDDED_PRESETS: EmbeddedPreset[] = [
  { id: "minimal", tokens: text(minimalTokens), about: minimalAbout },
  { id: "soft", tokens: text(softTokens), about: softAbout },
  { id: "playful", tokens: text(playfulTokens), about: playfulAbout },
  { id: "editorial", tokens: text(editorialTokens), about: editorialAbout },
  { id: "bold", tokens: text(boldTokens), about: boldAbout },
  { id: "dark-tech", tokens: text(darkTechTokens), about: darkTechAbout },
  { id: "warm", tokens: text(warmTokens), about: warmAbout },
  { id: "trust", tokens: text(trustTokens), about: trustAbout },
];

export function presetTheme(id: string): Theme | null {
  const preset = EMBEDDED_PRESETS.find((p) => p.id === id);
  if (!preset) return null;
  const { doc } = loadTokenDocument(`presets/${id}/tokens.json`, preset.tokens);
  return doc ? buildTheme(doc) : null;
}

export function presetTitle(about: string): string {
  return about.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}
