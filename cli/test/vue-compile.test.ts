import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { FIXTURES, validTokens } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

// Removing an installed node_modules takes longer than a hook's default 5 s on Windows.
afterAll(cleanupTempDirs, 120_000);

const node = Bun.which("node");
const npm = Bun.which("npm");
// Needs Node and npm (and the network the first time, for npm ci); without them the test skips.
const toolchain = Boolean(node && npm);
if (!toolchain) console.log("[vue-compile] skipped: Node or npm isn't installed");

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

/** A component that uses the generated motion the way an app does. */
const SPRING_VUE = `<script setup lang="ts">
import { motion } from "motion-v";
import { duration, easing, spring } from "../design/motion";
</script>

<template>
  <motion.div :transition="spring.snappy" :animate="{ opacity: 1 }" :style="{ transitionDuration: duration.base + 's' }" :data-easing="easing.standard.join(',')">
    Hello
  </motion.div>
</template>
`;

describe("the generated Vue theme code", () => {
  test.skipIf(!toolchain)("passes vue-tsc --noEmit with motion-v's <motion.div :transition=\"spring.snappy\">", async () => {
    const dir = tempDir("motif-vue-");
    cpSync(join(FIXTURES, "vue-min"), dir, { recursive: true, filter: (src) => !["node_modules", "dist"].includes(basename(src)) });
    // The packages are fetched once; npm's cache makes later runs offline.
    if (run([npm!, "ci", "--prefer-offline", "--no-audit", "--no-fund"], dir).code !== 0) {
      const again = run([npm!, "ci", "--no-audit", "--no-fund"], dir);
      if (again.code !== 0) console.log(again.out);
      expect(again.code).toBe(0);
    }

    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(join(dir, "design/tokens.json"), JSON.stringify(validTokens()));
    const result = await runTokens(dir, { positionals: [] });
    expect(result.exitCode).toBe(0);
    for (const f of ["src/styles/motif.css", "src/styles/motif.tailwind.css", "src/design/motion.ts"]) expect(existsSync(join(dir, f))).toBe(true);
    expect(readFileSync(join(dir, "src/design/motion.ts"), "utf8")).toContain("export const spring");
    mkdirSync(join(dir, "src/components"), { recursive: true });
    writeFileSync(join(dir, "src/components/Spring.vue"), SPRING_VUE);

    const tsc = run([node!, join(dir, "node_modules/vue-tsc/bin/vue-tsc.js"), "--noEmit"], dir);
    if (tsc.code !== 0) console.log(tsc.out);
    expect(tsc.code).toBe(0);
  }, 900_000);
});
