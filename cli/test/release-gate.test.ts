// The release gate (plan 2H's final review): a release lists a stack as supported only when its parity row is all done.
// The release workflow's test step sets MOTIF_RELEASE=1; elsewhere (ordinary CI, a developer's run) this skips, so a
// branch whose row still has Evals pending passes its own CI.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADAPTERS_AVAILABLE } from "../src/detect/stacks";
import { parityGaps } from "./parity-gate";

const release = process.env.MOTIF_RELEASE === "1";
if (!release) console.log("[release-gate] skipped: only a release (MOTIF_RELEASE=1) checks docs/parity.md's rows");

describe("the release gate", () => {
  test.skipIf(!release)("every supported stack's parity row is done in every area (MOTIF_RELEASE=1 only)", () => {
    const parity = readFileSync(join(import.meta.dir, "../../docs/parity.md"), "utf8");
    expect(parityGaps(parity, ADAPTERS_AVAILABLE)).toEqual([]);
  });
});
