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
if (!toolchain) console.log("[svelte-compile] skipped: Node or npm isn't installed");

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

/** A component that uses the generated motion the way an app does: a transition, a Spring, a Tween and Motion's animate(). */
const MOTION_SVELTE = `<script lang="ts">
	import { animate } from 'motion';
	import { Spring, Tween } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import { duration, easing, motionSpring, spring } from '$lib/design/motion';

	let shown = $state(true);
	let box: HTMLElement | undefined = $state();
	const scale = new Spring(0, spring.snappy);
	const fade = new Tween(0, { duration: duration.base, easing: easing.standard });

	$effect(() => {
		scale.target = 1;
		fade.target = 1;
		if (box) animate(box, { opacity: 1 }, motionSpring.snappy);
	});
</script>

{#if shown}
	<div bind:this={box} transition:fly={{ y: 8, duration: duration.base, easing: easing.standard }} style:scale={scale.current} style:opacity={fade.current}>
		Hello
	</div>
{/if}
<button onclick={() => (shown = !shown)}>Toggle</button>
`;

describe("the generated Svelte theme code", () => {
  test.skipIf(!toolchain)("passes svelte-check --fail-on-warnings with a transition, a Spring, a Tween and Motion's animate()", async () => {
    const dir = tempDir("motif-svelte-");
    cpSync(join(FIXTURES, "svelte-min"), dir, { recursive: true, filter: (src) => !["node_modules", ".svelte-kit", "build"].includes(basename(src)) });
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
    for (const f of ["src/lib/styles/motif.css", "src/lib/styles/motif.tailwind.css", "src/lib/design/motion.ts"]) expect(existsSync(join(dir, f))).toBe(true);
    expect(readFileSync(join(dir, "src/lib/design/motion.ts"), "utf8")).toContain("export const spring");
    writeFileSync(join(dir, "src/lib/Motion.svelte"), MOTION_SVELTE);

    const sync = run([node!, join(dir, "node_modules/@sveltejs/kit/svelte-kit.js"), "sync"], dir);
    if (sync.code !== 0) console.log(sync.out);
    expect(sync.code).toBe(0);
    const check = run([node!, join(dir, "node_modules/svelte-check/bin/svelte-check"), "--fail-on-warnings"], dir);
    if (check.code !== 0) console.log(check.out);
    expect(check.code).toBe(0);
  }, 900_000);
});
