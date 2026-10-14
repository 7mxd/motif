import { loadTokenDocument } from "../contract/load";
import { checkRoles } from "../contract/roles";
import { validateTokens } from "../contract/tokens";
import type { Finding } from "../findings";
import { buildTheme, type Theme } from "../generate/theme";

/** A theme values file as a mockup theme: null with its problems when it has any error. */
export function loadThemeFile(label: string, text: string): { theme: Theme | null; problems: Finding[] } {
  const { doc, findings } = loadTokenDocument(label, text);
  const problems = doc ? [...findings, ...validateTokens(doc), ...checkRoles(doc)].filter((f) => f.severity === "error") : findings;
  return { theme: doc && problems.length === 0 ? buildTheme(doc) : null, problems };
}
