import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { nodeFloor } from "../src/project/node-floor";
import { FIXTURES, validTokens } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

// Removing an installed node_modules takes longer than a hook's default 5 s on Windows.
afterAll(cleanupTempDirs, 120_000);

/** The Node versions Angular 21 runs on (@angular/core 21's engines). */
const ANGULAR_21_NODE = "^20.19.0 || ^22.12.0 || >=24.0.0";

const node = Bun.which("node");
const npm = Bun.which("npm");
const version = node ? Bun.spawnSync([node, "--version"], { stdout: "pipe" }).stdout.toString().trim().replace(/^v/, "") || null : null;
const nodeFits = version !== null && nodeFloor(ANGULAR_21_NODE, version);
// Needs Node (in Angular 21's range) and npm, and the network the first time, for npm ci; without them the test skips.
// CI gets an Angular job for it in Task 12, as Svelte's did.
const toolchain = Boolean(node && npm && nodeFits);
if (!toolchain) {
  const why = !node || !npm ? "Node or npm isn't installed" : `Node ${version ?? "(unknown)"} is outside Angular 21's range (${ANGULAR_21_NODE})`;
  console.log(`[angular-compile] skipped: ${why}`);
}

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, NG_CLI_ANALYTICS: "false" } });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

/**
 * A component that uses the generated theme the way an app does (decision 0012): a CSS class timed by the motion
 * variables for animate.enter, and Motion's animate() with motion.ts's spring (React web's: Motion's own spring options) in an (animate.leave) callback.
 */
const MOTION_TS = `import { Component, signal } from '@angular/core';
import type { AnimationCallbackEvent } from '@angular/core';
import { animate } from 'motion';
import { spring } from '../design/motion';

@Component({
  selector: 'app-toast',
  template: \`
    @if (shown()) {
      <div animate.enter="fade-in" (animate.leave)="leave($event)" class="bg-action-primary text-on-action-primary p-4">Saved</div>
    }
    <button type="button" (click)="shown.set(!shown())">Toggle</button>
  \`,
  styles: \`
    .fade-in { animation: fade var(--motif-duration-base) var(--motif-easing-standard); }
    @keyframes fade { from { opacity: 0; } }
  \`,
})
export class Toast {
  protected readonly shown = signal(true);

  protected leave(event: AnimationCallbackEvent): void {
    animate(event.target, { opacity: 0 }, spring.snappy).then(() => event.animationComplete());
  }
}
`;

describe("the generated Angular theme code", () => {
  test.skipIf(!toolchain)("passes ng build with animate.enter timed by the CSS variables and Motion's animate() in (animate.leave)", async () => {
    const dir = tempDir("motif-angular-");
    cpSync(join(FIXTURES, "angular-min"), dir, { recursive: true, filter: (src) => !["node_modules", ".angular", "dist"].includes(basename(src)) });
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
    for (const f of ["src/styles/motif.css", "src/styles/motif.tailwind.css", "src/app/design/motion.ts"]) expect(existsSync(join(dir, f))).toBe(true);
    // The one step the wiring note asks for, then a component that uses the theme.
    const styles = readFileSync(join(dir, "src/styles.css"), "utf8");
    writeFileSync(join(dir, "src/styles.css"), styles.replace("@import 'tailwindcss';", "@import 'tailwindcss';\n@import './styles/motif.tailwind.css';"));
    mkdirSync(join(dir, "src/app/toast"), { recursive: true });
    writeFileSync(join(dir, "src/app/toast/toast.ts"), MOTION_TS);
    const home = join(dir, "src/app/home/home.ts");
    writeFileSync(
      home,
      readFileSync(home, "utf8")
        .replace("import { Component } from '@angular/core';", "import { Component } from '@angular/core';\nimport { Toast } from '../toast/toast';")
        .replace("selector: 'app-home',", "selector: 'app-home',\n  imports: [Toast],")
        .replace("<p>Welcome back.</p>", "<p>Welcome back.</p>\n      <app-toast />"),
    );

    const build = run([node!, join(dir, "node_modules/@angular/cli/bin/ng.js"), "build"], dir);
    if (build.code !== 0) console.log(build.out);
    expect(build.code).toBe(0);
    // The theme reached the bundle: Tailwind made the utilities from Motif's theme, and the variables are in it.
    const browser = join(dir, "dist/angular-min/browser");
    const css = new Bun.Glob("styles-*.css").scanSync(browser).next().value as string;
    const bundle = readFileSync(join(browser, css), "utf8");
    expect(bundle).toContain("--motif-duration-base");
    expect(bundle).toContain(".bg-action-primary");
  }, 900_000);
});
