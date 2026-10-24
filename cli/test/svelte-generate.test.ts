import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { springPhysics } from "../src/contract/spring";
import { CSS_HEADER, TS_HEADER } from "../src/generate/header";
import { buildThemeSet } from "../src/generate/theme";
import { PRESETS } from "../src/presets/spec";
import { motifCss, tailwindCss } from "../src/stacks/react-web/generate";
import { generateSvelte, svelteSpring, svelteWiring } from "../src/stacks/svelte/generate";
import type { AppInfo } from "../src/detect/stacks";
import { docFrom, partnerTokens, validTokens, withCompanion } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const pkg = (dev: Record<string, string>) => JSON.stringify({ name: "app", devDependencies: dev });
const KIT = { "@sveltejs/kit": "^2.70.0", "@sveltejs/vite-plugin-svelte": "^7.0.0", svelte: "^5.57.0", vite: "^8.0.0", "@tailwindcss/vite": "^4.1.0", tailwindcss: "^4.1.0" };
const VITE = { svelte: "^5.57.0", vite: "^8.0.0", "@sveltejs/vite-plugin-svelte": "^7.0.0" };
const gen = (root: string, over: Partial<AppInfo> = {}, tailwind: "v4" | "v3" | "none" = "v4", tokens: any = partnerTokens()) => {
  const app: AppInfo = { path: ".", stack: "svelte", source: "detected", ...over };
  return generateSvelte(buildThemeSet(docFrom(tokens)), { root, app, srcDir: app.srcDir ?? "src", tailwind });
};
const paths = (r: { files: { path: string }[] }) => r.files.map((f) => f.path);

/** The generated motion.ts, loaded as a module. */
async function loadMotion(content: string): Promise<any> {
  const dir = tempDir("motif-svelte-motion-");
  writeFileSync(join(dir, "motion.ts"), content);
  return import(join(dir, "motion.ts"));
}

describe("generateSvelte", () => {
  test("a SvelteKit app gets React web's CSS and its own motion.ts, under src/lib", () => {
    const root = makeProject({ "package.json": pkg(KIT) });
    const tokens = withCompanion(partnerTokens());
    const set = buildThemeSet(docFrom(tokens));
    const r = gen(root, {}, "v4", tokens);
    expect(paths(r)).toEqual(["src/lib/styles/motif.css", "src/lib/styles/motif.tailwind.css", "src/lib/design/motion.ts"]);
    expect(r.files[0]!.content).toBe(motifCss(set.base, set.variants));
    expect(r.files[0]!.content).toContain("partner");
    expect(r.files[0]!.content.startsWith(CSS_HEADER)).toBe(true);
    expect(r.files[1]!.content).toBe(tailwindCss(set.base));
    expect(r.files[2]!.content.startsWith(TS_HEADER)).toBe(true);
    expect(r.notes).toEqual([]);
  });

  test("a Vite app (npm create vite's Svelte template) uses the same folders", () => {
    const root = makeProject({ "package.json": pkg(VITE), "src/main.ts": "", "src/App.svelte": "" });
    expect(paths(gen(root, {}, "none"))).toEqual(["src/lib/styles/motif.css", "src/lib/design/motion.ts"]);
  });

  test("Tailwind 3 gets React web's note and no Tailwind file", () => {
    const root = makeProject({ "package.json": pkg({ ...VITE, tailwindcss: "^3.4.0" }) });
    const r = gen(root, {}, "v3");
    expect(paths(r)).toEqual(["src/lib/styles/motif.css", "src/lib/design/motion.ts"]);
    expect(r.notes).toEqual(["Your app: Tailwind v3 found, so Motif wrote CSS variables only. Use them as bg-[var(--motif-color-action-primary)], or upgrade to Tailwind v4 for Motif's Tailwind theme."]);
  });

  test("themeDir wins for every file, and an app in a folder prefixes every path", () => {
    const root = makeProject({ "package.json": pkg(KIT), "web/package.json": pkg(KIT) });
    expect(paths(gen(root, { themeDir: "src/theme" }))).toEqual(["src/theme/motif.css", "src/theme/motif.tailwind.css", "src/theme/motion.ts"]);
    expect(paths(gen(root, { path: "web" }))).toEqual(["web/src/lib/styles/motif.css", "web/src/lib/styles/motif.tailwind.css", "web/src/lib/design/motion.ts"]);
  });

  test("Svelte 4 or SvelteKit 1 gets the CSS files only, and the reason", () => {
    const note = "motion.ts uses Svelte 5's Spring and Tween, so Motif didn't write it. Animate with the CSS variables in motif.css (--motif-duration-*, --motif-easing-*).";
    const svelte4 = makeProject({ "package.json": pkg({ svelte: "^4.2.0", vite: "^5.0.0", "@tailwindcss/vite": "^4.1.0" }) });
    const r = gen(svelte4);
    expect(paths(r)).toEqual(["src/lib/styles/motif.css", "src/lib/styles/motif.tailwind.css"]);
    expect(r.notes).toEqual([note]);
    const kit1 = makeProject({ "package.json": pkg({ "@sveltejs/kit": "^1.30.0", svelte: "^4.2.0" }) });
    expect(gen(kit1, {}, "none").notes).toEqual([note]);
  });

  test("an app whose Svelte version can't be read gets motion.ts", () => {
    const root = makeProject({ "package.json": pkg({ svelte: "latest" }) });
    expect(paths(gen(root, {}, "none"))).toContain("src/lib/design/motion.ts");
  });
});

describe("motion.ts in Svelte's terms", () => {
  const motionOf = (tokens: any = validTokens()) => gen(makeProject({ "package.json": pkg(KIT) }), {}, "none", tokens).files.find((f) => f.path.endsWith("motion.ts"))!.content;

  test("durations in milliseconds, and Motion's springs for animate() in React web's shape", async () => {
    const text = motionOf();
    expect(text).toContain("export const duration = {\n  instant: 0,\n  fast: 120,\n  base: 200,\n  slow: 320,\n} satisfies Record<string, number>;");
    expect(text).toContain(
      'export const motionSpring = {\n  snappy: { type: "spring", visualDuration: 0.25, bounce: 0 },\n  smooth: { type: "spring", visualDuration: 0.4, bounce: 0.1 },\n  bouncy: { type: "spring", visualDuration: 0.5, bounce: 0.3 },\n} satisfies Record<string, MotionSpring>;',
    );
    const m = await loadMotion(text);
    expect(m.duration).toEqual({ instant: 0, fast: 120, base: 200, slow: 320 });
    expect(m.motionSpring.snappy).toEqual({ type: "spring", visualDuration: 0.25, bounce: 0 });
    expect(m.spring.snappy).toEqual(svelteSpring({ duration: 0.25, bounce: 0 }));
    expect(Object.keys(m.spring)).toEqual(["snappy", "smooth", "bouncy"]);
    expect(text).not.toMatch(/^import /m);
  });

  /** The curve's y at time x, by bisection on the curve's parameter (60 halvings): a reference independent of the generated solver. */
  function bezierAt([x1, y1, x2, y2]: number[], x: number): number {
    const at = (p1: number, p2: number, s: number) => 3 * (1 - s) ** 2 * s * p1 + 3 * (1 - s) * s ** 2 * p2 + s ** 3;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1!, x2!, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1!, y2!, (lo + hi) / 2);
  }

  test("each easing function follows its cubic-bezier curve at 11 points, overshooting curves included", async () => {
    const tokens = validTokens();
    tokens.easing.ease = { $value: [0.25, 0.1, 0.25, 1] };
    tokens.easing.overshoot = { $value: [0.34, 1.2, 0.64, 1] };
    tokens.easing.linear = { $value: [0, 0, 1, 1] };
    const m = await loadMotion(motionOf(tokens));
    const curves: Record<string, number[]> = { standard: [0.2, 0, 0, 1], enter: [0, 0, 0, 1], exit: [0.3, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], overshoot: [0.34, 1.2, 0.64, 1], linear: [0, 0, 1, 1] };
    expect(Object.keys(m.easing)).toEqual(Object.keys(curves));
    for (const [name, points] of Object.entries(curves)) {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        expect([name, t, Math.abs(m.easing[name](t) - bezierAt(points, t)) < 1e-6]).toEqual([name, t, true]);
      }
      expect([name, m.easing[name](0), m.easing[name](1)]).toEqual([name, 0, 1]);
    }
    // Known values: CSS's ease at its midpoint, and a curve that goes past 1.
    expect(m.easing.ease(0.5)).toBeCloseTo(0.8024033877, 8);
    expect(m.easing.linear(0.37)).toBeCloseTo(0.37, 9);
    expect(Math.max(...Array.from({ length: 99 }, (_, i) => m.easing.overshoot((i + 1) / 100)))).toBeGreaterThan(1);
  });

  /**
   * svelte/motion's Spring as Svelte 5.57 steps it (src/motion/spring.js, tick_spring and Spring's loop), on a screen
   * that draws 60 frames a second: from 0 to 100 with Svelte's default precision, 0.01. The values at each frame.
   */
  function svelteFrames({ stiffness, damping }: { stiffness: number; damping: number }): { t: number; x: number }[] {
    const frameMs = 1000 / 60;
    const target = 100;
    let current = 0;
    let last = 0;
    const out = [{ t: 0, x: 0 }];
    for (let i = 1; i < 5000; i++) {
      const dt = (Math.min(frameMs, 1000 / 30) * 60) / 1000;
      const delta = target - current;
      const velocity = (current - last) / (dt || 1 / 60);
      const acceleration = stiffness * delta - damping * velocity;
      const d = (velocity + acceleration) * dt;
      const settled = Math.abs(d) < 0.01 && Math.abs(delta) < 0.01;
      last = current;
      current = settled ? target : current + d;
      out.push({ t: (i * frameMs) / 1000, x: current / target });
      if (settled) break;
    }
    return out;
  }

  /** The role's spring (Motif's: SwiftUI's model, as springPhysics gives it), from 0 to 1 at rest, at time t in seconds. */
  function roleCurve(role: { duration: number; bounce: number }): (t: number) => number {
    const p = springPhysics(role);
    const w = Math.sqrt(p.stiffness);
    const z = p.dampingRatio;
    if (Math.abs(z - 1) < 1e-9) return (t) => 1 - Math.exp(-w * t) * (1 + w * t);
    if (z < 1) {
      const wd = w * Math.sqrt(1 - z * z);
      return (t) => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
    }
    const q = Math.sqrt(z * z - 1);
    const s1 = -w * (z - q);
    const s2 = -w * (z + q);
    return (t) => 1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1);
  }

  /** The 2% settling time: the first moment after which the value stays within 2% of the distance. */
  const BAND = 0.02;
  function settles(points: { t: number; x: number }[]): number {
    let last = 0;
    for (let i = 0; i < points.length; i++) if (Math.abs(points[i]!.x - 1) > BAND) last = points[i + 1]?.t ?? points[i]!.t;
    return last;
  }
  const overshoot = (points: { x: number }[]) => Math.max(0, ...points.map((p) => p.x - 1));

  // Every spring the presets give, the fixture's, and the ends of the range a guide may use (decision 0011 measures them).
  const ROLES = [
    ...PRESETS.flatMap((p) => Object.entries(p.springs).map(([name, [duration, bounce]]) => ({ name: `${p.id}.${name}`, duration, bounce }))),
    { name: "slow", duration: 2, bounce: 0 },
    { name: "long and bouncy", duration: 1, bounce: 0.2 },
    { name: "very bouncy", duration: 0.4, bounce: 0.7 },
    { name: "overdamped", duration: 0.4, bounce: -0.3 },
  ];

  test("the Spring options settle when the role's spring does, within 20% of its duration, and overshoot as much (within 2%)", () => {
    for (const role of ROLES) {
      const svelte = svelteFrames(svelteSpring(role));
      const curve = roleCurve(role);
      const reference = Array.from({ length: Math.ceil(role.duration * 10 * 1000) + 1000 }, (_, i) => ({ t: i / 1000, x: curve(i / 1000) }));
      const off = Math.abs(settles(svelte) - settles(reference)) / role.duration;
      expect([role.name, "settles", off <= 0.2]).toEqual([role.name, "settles", true]);
      expect([role.name, "overshoot", Math.abs(overshoot(svelte) - overshoot(reference)) <= BAND]).toEqual([role.name, "overshoot", true]);
      // And the whole curve: the role's spring started less than a frame early, never more than 2% of the distance away.
      const lead = Array.from({ length: 101 }, (_, i) => (i / 100) * (1 / 60));
      const apart = Math.min(...lead.map((tau) => Math.max(...svelte.map((p) => Math.abs(p.x - curve(p.t + tau))))));
      expect([role.name, "curve", apart <= BAND]).toEqual([role.name, "curve", true]);
    }
  });

  test("the options are within Svelte's range (0 to 1) and have four significant digits", () => {
    expect(svelteSpring({ duration: 0.25, bounce: 0 })).toEqual({ stiffness: 0.1171, damping: 0.5673 });
    expect(svelteSpring({ duration: 2, bounce: 0 })).toEqual({ stiffness: 0.002602, damping: 0.09942 });
    // Shorter than five frames and bouncy: Svelte's stiffness tops out at 1.
    expect(svelteSpring({ duration: 0.05, bounce: 0.5 }).stiffness).toBe(1);
  });
});

describe("the one-step wiring note", () => {
  const wire = (root: string, files: string[], app: Partial<AppInfo> = {}) =>
    svelteWiring(root, { path: ".", stack: "svelte", source: "detected", ...app }, files.map((path) => ({ path, content: "" })), () => "src");
  const kit = (extra: Record<string, string> = {}) =>
    makeProject({ "package.json": pkg(KIT), "svelte.config.js": "export default {}\n", "src/routes/+layout.svelte": "<script>let { children } = $props();</script>\n{@render children()}\n", ...extra });

  test("SvelteKit: import it in the root layout, through $lib", () => {
    expect(wire(kit(), ["src/lib/styles/motif.css", "src/lib/design/motion.ts"])).toBe("Next: import '$lib/styles/motif.css' once in src/routes/+layout.svelte (in its <script>).");
  });

  test("SvelteKit with a themeDir outside src/lib, a custom routes folder, or in a subfolder", () => {
    expect(wire(kit(), ["src/theme/motif.css"], { themeDir: "src/theme" })).toBe("Next: import '../theme/motif.css' once in src/routes/+layout.svelte (in its <script>).");
    const custom = kit({ "svelte.config.js": "export default { kit: { files: { routes: 'app/pages' } } };\n" });
    expect(wire(custom, ["src/lib/styles/motif.css"])).toBe("Next: import '$lib/styles/motif.css' once in app/pages/+layout.svelte (in its <script>).");
    const mono = makeProject({ "web/package.json": pkg(KIT), "web/src/routes/+page.svelte": "" });
    expect(wire(mono, ["web/src/lib/styles/motif.css"], { path: "web" })).toBe("Next: import '$lib/styles/motif.css' once in web/src/routes/+layout.svelte (in its <script>).");
    expect(wire(mono, ["shared/theme/motif.css"], { path: "web", themeDir: "shared/theme" })).toBe(
      "Next: import '../../../shared/theme/motif.css' once in web/src/routes/+layout.svelte (in its <script>).",
    );
  });

  test("Vite: import it in main.ts", () => {
    const root = makeProject({ "package.json": pkg(VITE), "src/main.ts": "import './app.css'\n", "src/App.svelte": "<main />" });
    expect(wire(root, ["src/lib/styles/motif.css"])).toBe("Next: import './lib/styles/motif.css' once in src/main.ts (or main.js).");
  });

  test("Tailwind 4: the Tailwind import, for either", () => {
    expect(wire(kit(), ["src/lib/styles/motif.css", "src/lib/styles/motif.tailwind.css"])).toBe(
      'Next: in your main CSS file, add an @import for src/lib/styles/motif.tailwind.css right after @import "tailwindcss" (write the path relative to that CSS file). Importing it before Tailwind undoes the theme.',
    );
  });

  test("no note once the app's code imports it: a layout, a CSS file, main.ts", () => {
    expect(wire(kit({ "src/routes/+layout.svelte": "<script>\n  import '$lib/styles/motif.css';\n</script>\n" }), ["src/lib/styles/motif.css"])).toBeNull();
    expect(wire(kit({ "src/app.css": '@import "tailwindcss";\n@import "./lib/styles/motif.tailwind.css";\n' }), ["src/lib/styles/motif.css", "src/lib/styles/motif.tailwind.css"])).toBeNull();
    const vite = makeProject({ "package.json": pkg(VITE), "src/main.ts": "import './lib/styles/motif.css'\n" });
    expect(wire(vite, ["src/lib/styles/motif.css"])).toBeNull();
    const custom = kit({ "svelte.config.js": "export default { kit: { files: { routes: 'pages' } } };\n", "pages/+layout.svelte": "<script>import '$lib/styles/motif.css';</script>" });
    expect(wire(custom, ["src/lib/styles/motif.css"])).toBeNull();
  });

  test("an import of an earlier Motif's design/generated/motif.css doesn't count", () => {
    const root = kit({ "src/routes/+layout.svelte": "<script>import '../../design/generated/motif.css';</script>\n" });
    expect(wire(root, ["src/lib/styles/motif.css"])).toBe("Next: import '$lib/styles/motif.css' once in src/routes/+layout.svelte (in its <script>).");
  });
});
