import { readFileSync } from "node:fs";
import { join } from "node:path";
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
