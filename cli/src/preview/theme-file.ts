import { loadTokenDocument } from "../contract/load";
import { checkRoles } from "../contract/roles";
import { validateTokens } from "../contract/tokens";
import type { Finding } from "../findings";
import { buildThemeSet, type Theme, type ThemeSet } from "../generate/theme";

/** A theme values file as a mockup theme (and its variants): null with its problems when it has any error. */
export function loadThemeFile(label: string, text: string): { theme: Theme | null; themeSet: ThemeSet | null; problems: Finding[] } {
  const { doc, findings } = loadTokenDocument(label, text);
  const problems = doc ? [...findings, ...validateTokens(doc), ...checkRoles(doc)].filter((f) => f.severity === "error") : findings;
  const themeSet = doc && problems.length === 0 ? buildThemeSet(doc) : null;
  return { theme: themeSet?.base ?? null, themeSet, problems };
}
