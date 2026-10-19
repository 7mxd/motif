import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./tmp";
import { loadTokenDocument } from "../src/contract/load";
import type { TokenDocument } from "../src/contract/types";

export const FIXTURES = join(import.meta.dir, "fixtures");

/** A fresh, mutable copy of the valid fixture tokens.json. */
export function validTokens(): any {
  return JSON.parse(readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8"));
}

export function validDesignMd(): string {
  return readFileSync(join(FIXTURES, "contract/DESIGN.md"), "utf8");
}

/** Load a tokens object through the real loader; throws if the loader reports findings. */
export function docFrom(obj: unknown): TokenDocument {
  const { doc, findings } = loadTokenDocument("design/tokens.json", JSON.stringify(obj, null, 2));
  if (!doc || findings.length > 0) throw new Error(`fixture failed to load: ${JSON.stringify(findings)}`);
  return doc;
}

/** Copy the valid fixture project into a fresh temp folder. The name has a space on purpose. */
export function copyFixture(): string {
  const dir = tempDir("motif test ");
  cpSync(join(FIXTURES, "contract"), dir, { recursive: true });
  return dir;
}

/**
 * The fixture tokens with two variants (women default, men). In men: surface changes light and dark, border changes
 * light only (its dark value stays the base dark), and radius.md changes.
 */
export function twoVariantTokens(): any {
  const t = validTokens();
  t.$extensions = { ...(t.$extensions ?? {}), "dev.motif": { ...(t.$extensions?.["dev.motif"] ?? {}), variants: [{ id: "women", label: "Women", default: true }, { id: "men", label: "Men" }] } };
  const add = (role: any, variants: unknown) => {
    role.$extensions = { "dev.motif": { ...(role.$extensions?.["dev.motif"] ?? {}), variants } };
  };
  add(t.color.surface, { men: { value: hexColor("#123456"), dark: hexColor("#654321") } });
  add(t.color.border, { men: { value: hexColor("#ABCDEF"), dark: "{primitive.color.gray.700}" } });
  add(t.radius.md, { men: { value: { value: 12, unit: "px" } } });
  return t;
}

/** A DTCG colour value from a #RRGGBB string. */
export function hexColor(hex: string) {
  const n = (i: number) => Number((parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4));
  return { colorSpace: "srgb", components: [n(1), n(3), n(5)], hex };
}
