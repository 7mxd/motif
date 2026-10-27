import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser } from "../src/browser/cdp";
import { exceptionFor } from "../src/check/exceptions";
import type { SourceFile } from "../src/check/files";
import { scanColors } from "../src/check/rules/colors";
import { scanValues } from "../src/check/rules/values";
import { buildScale } from "../src/check/scale";
import { findBrowser } from "../src/detect/browser";
import { buildTheme } from "../src/generate/theme";
import { docFrom, validTokens } from "./helpers";

const KIT = join(import.meta.dir, "../../skill/preview-kit");
const read = (name: string) => readFileSync(join(KIT, name), "utf8");
const scale = buildScale(buildTheme(docFrom(validTokens())), "src");

describe("preview kit", () => {
  test("skeletons stop pulsing under reduced motion, as the README says (backlog)", () => {
    const css = read("kit.css");
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]!).join("\n");
    expect(blocks).toMatch(/\.mk-skeleton[^{]*\{[^}]*animation: none/);
  });

  test("kit.css follows the design guide; only device chrome is exempt, with reasons", () => {
    const text = read("kit.css");
    const file: SourceFile = { path: "kit.css", abs: "", text, lang: "css" };
    const lines = text.split(/\r?\n/);
    const violations = [...scanColors(file), ...scanValues(file, scale)].filter((h) => h.violation);
    const unexplained = violations.filter((h) => !(exceptionFor(lines, h.line) as { reason?: string } | null)?.reason);
    expect(unexplained.map((h) => `${h.line}: ${h.text}`)).toEqual([]);
    expect(violations.length).toBeGreaterThan(0); // the bezel really is exempted, not missed
  });

  test("kit.css defines the frames and components the README promises", () => {
    const css = read("kit.css");
    const readme = read("README.md");
    for (const cls of readme.match(/`\.mk-[a-z-]+`/g)!.map((c) => c.slice(2, -1))) {
      expect(css).toContain(`.${cls}`);
    }
  });

  test("headings use lining figures, so a number in a heading font with old-style figures (Vollkorn) stays even (final review)", () => {
    const css = read("kit.css");
    for (const cls of ["mk-display", "mk-title", "mk-heading"]) {
      const rule = css.slice(css.indexOf(`.${cls} {`));
      expect([cls, rule.slice(0, rule.indexOf("}")).includes("font-variant-numeric: lining-nums;")]).toEqual([cls, true]);
    }
  });

  test("the brand classes fall back to the action colours when a theme has no brand roles (looks comparison)", () => {
    const css = read("kit.css");
    const readme = read("README.md");
    for (const cls of ["mk-brand", "mk-tile", "mk-art", "mk-stat"]) {
      expect(css).toContain(`.${cls} `);
      expect(readme).toContain(`\`.${cls}\``);
    }
    // Every use of a brand role has a fallback.
    expect(css.match(/var\(--motif-color-(?:on-brand|brand-soft|brand)(?![\w-])(?!,)/g)).toBeNull();
    expect(css).toContain("var(--motif-color-brand, var(--motif-color-action-primary))");
    expect(css).toContain("var(--motif-color-on-brand, var(--motif-color-on-action-primary))");
    expect(css).toContain("var(--motif-color-brand-soft, var(--motif-color-action-secondary))");
  });

  test("kit.js is valid JavaScript", () => {
    expect(() => new Bun.Transpiler({ loader: "js" }).transformSync(read("kit.js"))).not.toThrow();
  });

  test("the template uses the kit and no raw colours", () => {
    const html = read("template.html");
    expect(html).toContain('class="mk-frame mk-phone mk-ios"');
    expect(scanColors({ path: "template.html", abs: "", text: html, lang: "markup" })).toEqual([]);
  });

  test("Motion is vendored with its MIT licence", () => {
    expect(read("vendor/motion.js").startsWith("!function(")).toBe(true);
    expect(read("vendor/LICENSE-motion.txt")).toContain("MIT");
  });
});

const browser = findBrowser();

describe.skipIf(!browser)("preview kit layout (needs Chrome, Edge or Chromium)", () => {
  // A badge or button placed straight in a card stretched to the card's width (v0.4.0 hands-on test, Copilot).
  test("a badge or button in a column keeps its own width; a block button fills it; rows still centre", async () => {
    const columns = ["mk-card", "mk-stack", "mk-screen", "mk-sheet", "mk-dialog"];
    const html = `<style>${read("kit.css")} .mk-sheet, .mk-dialog { position: static; }</style>
      ${columns.map((c) => `<div class="${c}" style="width: 400px" data-col="${c}">
        <span class="mk-badge">New</span><button class="mk-btn">Go</button><button class="mk-btn mk-block">Wide</button>
      </div>`).join("")}
      <div class="mk-row-inline" id="row" style="width: 400px"><span class="mk-badge">New</span><button class="mk-btn">Go</button></div>`;
    const b = await launchBrowser(browser!.path);
    try {
      const page = await b.newPage();
      await page.setViewport(600, 1600);
      await page.goto("data:text/html," + encodeURIComponent(html));
      const measured = await page.evaluate<Record<string, { badge: number; btn: number; block: number; inner: number }>>(`(() => {
        const out = {};
        for (const col of document.querySelectorAll("[data-col]")) {
          const s = getComputedStyle(col);
          const w = (el) => Math.round(el.getBoundingClientRect().width);
          out[col.dataset.col] = { badge: w(col.querySelector(".mk-badge")), btn: w(col.querySelector(".mk-btn:not(.mk-block)")),
            block: w(col.querySelector(".mk-block")), inner: Math.round(col.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)) };
        }
        return out;
      })()`);
      for (const c of columns) {
        const m = measured[c]!;
        expect([c, m.badge < m.inner / 2, m.btn < m.inner / 2, m.block]).toEqual([c, true, true, m.inner]);
      }
      const centres = await page.evaluate<number[]>(`[...document.querySelectorAll("#row > *")].map((el) => { const r = el.getBoundingClientRect(); return Math.round(r.top + r.height / 2); })`);
      expect(centres[0]).toBe(centres[1]!);
    } finally {
      await b.close();
    }
  }, 60_000);
});
