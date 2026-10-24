// The release gate on docs/parity.md (plan 2H's final review): a stack Motif treats as supported (ADAPTERS_AVAILABLE)
// is released only when every area of its parity row is done. release-gate.test.ts runs it when the release workflow
// sets MOTIF_RELEASE=1; ordinary CI, where a row's Evals may still be pending, skips it.
import type { StackId } from "../src/detect/stacks";

/** Each stack's row in docs/parity.md's "Where each stack stands" table. */
export const PARITY_ROWS: Partial<Record<StackId, string>> = {
  "react-web": "React web",
  "plain-web": "Plain web",
  flutter: "Flutter",
  compose: "Jetpack Compose",
  "react-native": "React Native (Expo)",
  swiftui: "SwiftUI",
  vue: "Vue / Nuxt",
};

/**
 * What keeps the stacks from a release: for each one whose row is missing, or has an area that isn't "done", a line
 * naming the stack and those areas. Empty when every stack's row is all done.
 */
export function parityGaps(parity: string, stacks: readonly StackId[]): string[] {
  const rows = parity.replace(/\r\n/g, "\n").split("\n").filter((l) => l.startsWith("| ")).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const header = rows.find((r) => r[0] === "Stack");
  const gaps: string[] = [];
  for (const id of stacks) {
    const label = PARITY_ROWS[id];
    const row = label ? rows.find((r) => r[0] === label) : undefined;
    if (!header || !row) {
      gaps.push(`${label ?? id} has no row in docs/parity.md.`);
      continue;
    }
    const open = header.slice(1).filter((_, i) => row[i + 1] !== "done");
    if (open.length > 0) gaps.push(`${label}: ${open.map((a) => `${a} is ${row[header.indexOf(a)] ?? "missing"}`).join(", ")}.`);
  }
  return gaps;
}
