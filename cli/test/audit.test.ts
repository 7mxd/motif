import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findBrowser } from "../src/detect/browser";
import { reviewJson, toFindings, type AuditIssue } from "../src/shot/audit";
import { AXE_SOURCE } from "../src/shot/axe";
import { captureScreens } from "../src/shot/capture";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

test("axe-core is embedded unmodified, with its licence", () => {
  const vendor = join(import.meta.dir, "../vendor/axe-core");
  expect(AXE_SOURCE.replace(/\r\n/g, "\n")).toBe(readFileSync(join(vendor, "axe.min.js"), "utf8").replace(/\r\n/g, "\n"));
  expect(AXE_SOURCE).toContain("4.14.0");
  expect(readFileSync(join(vendor, "LICENSE"), "utf8")).toContain("Mozilla Public License");
});

const issue = (over: Partial<AuditIssue>): AuditIssue => ({
  rule: "color-contrast", selector: "#a", label: "Hi", kind: "element", ratio: 3.5, expected: 4.5,
  route: "/", viewport: "mobile", scheme: "light", shot: "design/shots/index.mobile.png", ...over,
});

describe("toFindings", () => {
  test("merges repeats, keeps each scheme's contrast, and puts the worst first", () => {
    const findings = toFindings([
      issue({ rule: "target-mobile", selector: "#small", kind: "button", label: "Go", width: 32, height: 32 }),
      issue({}),
      issue({ viewport: "desktop" }),
      issue({ scheme: "dark", ratio: 2.1, shot: "design/shots/index.mobile.dark.png" }),
      issue({ rule: "target-size", selector: "#x", kind: "button", label: "", width: 16, height: 16 }),
      issue({ rule: "target-mobile", selector: "#x", kind: "button", label: "", width: 16, height: 16 }),
      issue({ rule: "motion", selector: "#spin", label: "", viewport: "desktop" }),
    ]);
    expect(findings.map((f) => `${f.id} ${f.severity} ${f.category} ${f.location.selector}`)).toEqual([
      "F-001 critical contrast #a",
      "F-002 critical target-size #x",
      "F-003 major contrast #a",
      "F-004 major reduced-motion #spin",
      "F-005 minor target-size #small",
    ]);
    expect(findings[0]).toEqual({
      id: "F-001",
      severity: "critical",
      category: "contrast",
      source: "exact",
      location: { screen: "/", selector: "#a", viewport: "mobile", scheme: "dark" },
      summary: 'Text "Hi" is hard to read in dark mode (2.1:1, needs 4.5:1).',
      fix: expect.any(String),
      shot: "design/shots/index.mobile.dark.png",
      status: "open",
    });
    expect(findings[1]!.summary).toBe("A button is 16×16 px with too little space around it; taps need at least 24×24 px (WCAG 2.2 AA).");
    expect(findings[3]!.summary).toBe("An element keeps moving when the viewer asks for reduced motion.");
    expect(findings[4]!.summary).toBe('The "Go" button is 32×32 px on a phone; 44×44 px is easier to tap.');
  });

  test("reviewJson follows the review format", () => {
    expect(reviewJson([], ["/", "/settings"], "2026-10-13")).toEqual({ motifReview: 1, scope: "screens: /, /settings", date: "2026-10-13", findings: [] });
  });
});

const BAD = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body { margin: 0; padding: 24px; font: 16px/1.5 sans-serif; background: #ffffff; color: #111111; }
.faint { color: #999999; }
@media (prefers-color-scheme: dark) { body { background: #222222; color: #eeeeee; } .faint { color: #bbbbbb; } }
.pair button { width: 16px; height: 16px; padding: 0; border: 0; margin: 0; }
#go { width: 32px; height: 32px; padding: 0; }
.box { width: 20px; height: 20px; background: #333333; margin: 8px; }
#spinner { animation: spin 1s linear infinite; }
@media (prefers-reduced-motion: no-preference) { #guarded { animation: spin 1s linear infinite; } }
#hello { animation: fade 100ms ease-out both; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fade { from { opacity: 0; } }
</style></head><body>
<p class="faint" id="faint">Faint note</p>
<p>Read the <a id="terms" href="#terms">terms</a> first.</p>
<div class="pair"><button id="zoom-in" aria-label="Zoom in"></button><button id="zoom-out" aria-label="Zoom out"></button></div>
<p><button id="go">Go</button></p>
<button id="off" disabled style="width: 16px; height: 16px; padding: 0" aria-label="Off"></button>
<button id="hidden" style="display: none" aria-label="Hidden"></button>
<div class="box" id="spinner"></div>
<div class="box" id="guarded"></div>
<div class="box" id="mover"></div>
<p id="hello">Hello</p>
<script>let x = 0; (function f() { x = (x + 1) % 100; document.getElementById("mover").style.transform = "translateX(" + x + "px)"; requestAnimationFrame(f); })();</script>
</body></html>`;
const CLEAN = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin: 0; padding: 24px; font: 16px sans-serif; background: #ffffff; color: #111111"><h1>Clean</h1><button style="width: 48px; height: 48px">OK</button><p>All good.</p></body></html>`;

const browser = findBrowser();
let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (req) => new Response(new URL(req.url).pathname === "/clean" ? CLEAN : BAD, { headers: { "content-type": "text/html" } }),
  });
});
afterAll(() => server?.stop(true));

describe.skipIf(!browser)("auditing real pages (needs Chrome, Edge or Chromium)", () => {
  test("finds what people would trip over, and nothing else", async () => {
    const { routes, issues } = await captureScreens({
      browserPath: browser!.path,
      baseUrl: `http://127.0.0.1:${server.port}`,
      routes: ["/", "/clean"],
      outDir: tempDir("motif-audit-"),
      audit: true,
      settleMs: 300,
    });
    expect(routes.map((r) => r.auditError)).toEqual([undefined, undefined]);
    const findings = toFindings(issues);
    expect(findings.map((f) => `${f.severity} ${f.category} ${f.location.screen} ${f.location.selector}${f.location.scheme ? ` ${f.location.scheme}` : ""}`)).toEqual([
      "critical contrast / #faint light",
      "critical target-size / #zoom-in",
      "critical target-size / #zoom-out",
      "critical contrast / #terms dark",
      "major reduced-motion / #spinner",
      "major reduced-motion / #mover",
      "minor target-size / #go",
    ]);
    expect(findings[0]!.summary).toContain("Faint note");
    expect(findings[0]!.shot).toEndWith("index.mobile.png");
  }, 120_000);
});
