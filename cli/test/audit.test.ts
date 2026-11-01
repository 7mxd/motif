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

  test("a kind that starts with a vowel sound takes \"an\" (the final review of plan 2G)", () => {
    const sized = (kind: AuditIssue["kind"], selector: string) => issue({ rule: "target-size", selector, kind, label: "", width: 16, height: 16 });
    const summaries = toFindings([sized("option", "#o"), sized("image", "#i"), sized("menu item", "#m"), sized("switch", "#s")]).map((f) => f.summary.split(" is ")[0]);
    expect(summaries.sort()).toEqual(["A menu item", "A switch", "An image", "An option"]);
  });

  test("texts that fail with the same colours are one finding that lists every place (third eval run)", () => {
    // The third eval run's report copied 53 contrast findings, one per text and state, from a few causes.
    const faint = { fg: "#b2a79f", bg: "#ffffff", ratio: 2.2, expected: 4.5 };
    const findings = toFindings([
      issue({ ...faint, selector: "#date-1", label: "Sent 12 October" }),
      issue({ ...faint, selector: "#date-1", label: "Sent 12 October", state: "sent" }),
      issue({ ...faint, selector: "#to", label: "Amara Okafor", state: "sent", ratio: 2.1 }),
      issue({ ...faint, selector: "#from", label: "Sam", state: "sent", viewport: "desktop" }),
      issue({ fg: "#d9c7b8", bg: "#fff8ec", ratio: 1.4, expected: 3, selector: "#border-label", label: "Border" }),
      issue({ ...faint, selector: "#date-1", label: "Sent 12 October", scheme: "dark", fg: "#5c544f", bg: "#2b2522" }),
    ]);
    expect(findings).toHaveLength(3);
    const group = findings.find((f) => f.summary.startsWith("3 texts"))!;
    expect(group.summary).toBe('3 texts are hard to read in light mode: #b2a79f on #ffffff (2.1:1, needs 4.5:1), such as "Amara Okafor" and "Sent 12 October".');
    // The worst place leads; every other place is listed once (a viewport repeat isn't another place).
    expect(group.location).toEqual({ screen: "/", selector: "#to", viewport: "mobile", scheme: "light", state: "sent" });
    expect(group.locations).toEqual([
      { screen: "/", selector: "#date-1", viewport: "mobile", scheme: "light" },
      { screen: "/", selector: "#date-1", viewport: "mobile", scheme: "light", state: "sent" },
      { screen: "/", selector: "#from", viewport: "desktop", scheme: "light", state: "sent" },
    ]);
    // One text in one place keeps its own wording, and has no list.
    const single = findings.find((f) => f.location.selector === "#border-label")!;
    expect(single.summary).toBe('Text "Border" is hard to read in light mode (1.4:1, needs 3:1).');
    expect(single.locations).toBeUndefined();
  });

  test("one element that's too small in several states is one finding, with each state listed", () => {
    const findings = toFindings([
      issue({ rule: "target-mobile", selector: "#close", kind: "button", label: "Dismiss tip", width: 20, height: 20 }),
      issue({ rule: "target-mobile", selector: "#close", kind: "button", label: "Dismiss tip", width: 20, height: 20, state: "sent" }),
      issue({ rule: "target-mobile", selector: "#close", kind: "button", label: "Dismiss tip", width: 20, height: 20, state: "error" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.summary).toBe('The "Dismiss tip" button is 20×20 px on a phone; 44×44 px is easier to tap.');
    expect(findings[0]!.locations!.map((l) => l.state)).toEqual(["sent", "error"]);
  });

  test("controls a phone finds small for one reason are one finding: same kind, same classes, short by the same pixels (v1.1 field trial)", () => {
    // The trial's review got 98 tap-size findings, one per chip, from a few rules.
    const chip = (label: string, width: number, over: Partial<AuditIssue> = {}) =>
      issue({ rule: "target-mobile", kind: "button", classes: "chip.svelte-1x2y", label, width, height: 42, selector: `#${label.toLowerCase()}`, ...over });
    const findings = toFindings([
      chip("Light", 64),
      chip("Dark", 58),
      chip("System", 80, { route: "/settings" }),
      chip("Light", 64, { size: "mobile-430" }),
      issue({ rule: "target-mobile", kind: "button", classes: "chip.svelte-1x2y", label: "Tiny", width: 30, height: 30, selector: "#tiny" }),
      issue({ rule: "target-mobile", kind: "switch", classes: "toggle", label: "Alerts", width: 40, height: 24, selector: "#a" }),
      issue({ rule: "target-mobile", kind: "switch", classes: "toggle", label: "Sounds", width: 40, height: 24, selector: "#s" }),
      issue({ rule: "target-mobile", kind: "link", label: "Home", width: 30, height: 30, selector: "header a" }),
    ]);
    expect(findings.map((f) => f.summary)).toEqual([
      '3 buttons are 42 px tall on a phone, such as "Light" and "Dark"; 44×44 px is easier to tap.',
      'The "Tiny" button is 30×30 px on a phone; 44×44 px is easier to tap.',
      '2 switches are 40×24 px on a phone, such as "Alerts" and "Sounds"; 44×44 px is easier to tap.',
      'The "Home" link is 30×30 px on a phone; 44×44 px is easier to tap.',
    ]);
    expect(findings[0]!.locations!.map((l) => `${l.screen} ${l.selector}`)).toEqual(["/ #dark", "/settings #system"]);
    // A shared header's control on several pages is still one control.
    const header = (route: string) => issue({ rule: "target-mobile", kind: "link", classes: "logo", label: "Home", width: 30, height: 30, selector: "header a.logo", route });
    expect(toFindings([header("/"), header("/settings")])[0]!.summary).toBe('The "Home" link is 30×30 px on a phone; 44×44 px is easier to tap.');
  });

  test("the same colours failing in light and dark are one finding; one element on several pages is one finding (backlog)", () => {
    const fixed = { fg: "#ffffff", bg: "#f59e0b", ratio: 2.1, expected: 4.5 };
    const both = toFindings([issue({ ...fixed, selector: "#badge", label: "New" }), issue({ ...fixed, selector: "#badge", label: "New", scheme: "dark" })]);
    expect(both).toHaveLength(1);
    expect(both[0]!.summary).toBe('Text "New" is hard to read in light and dark mode (2.1:1, needs 4.5:1).');
    const shared = toFindings([
      issue({ rule: "target-mobile", selector: "header a.logo", kind: "link", label: "Home", width: 30, height: 30 }),
      issue({ rule: "target-mobile", selector: "header a.logo", kind: "link", label: "Home", width: 30, height: 30, route: "/settings" }),
    ]);
    expect(shared).toHaveLength(1);
    expect(shared[0]!.locations!.map((l) => l.screen)).toEqual(["/settings"]);
  });

  test("different elements that share a plain selector stay apart; a badge failing in both schemes lists both (review of batch B)", () => {
    const apart = toFindings([
      issue({ rule: "target-mobile", selector: "button", kind: "button", label: "Sign in", width: 120, height: 36, route: "/login" }),
      issue({ rule: "target-mobile", selector: "button", kind: "button", label: "Save", width: 80, height: 36, route: "/settings" }),
    ]);
    expect(apart.map((f) => f.summary)).toEqual([
      'The "Sign in" button is 120×36 px on a phone; 44×44 px is easier to tap.',
      'The "Save" button is 80×36 px on a phone; 44×44 px is easier to tap.',
    ]);
    const fixed = { fg: "#ffffff", bg: "#f59e0b", ratio: 2.1, expected: 4.5 };
    const [badge] = toFindings([issue({ ...fixed, selector: "#badge", label: "New" }), issue({ ...fixed, selector: "#badge", label: "New", scheme: "dark" })]);
    expect([badge!.location.scheme, badge!.locations?.map((l) => l.scheme)]).toEqual(["light", ["dark"]]);
  });

  test("an icon (Flutter) is a mark: named as an icon, hard to see at its 3:1, and grouped apart from text with the same colours", () => {
    const icon = (over: Partial<AuditIssue>) => issue({ kind: "icon", label: "", ratio: 1.91, expected: 3, fg: "#bbbbbb", bg: "#ffffff", ...over });
    const [one] = toFindings([icon({ selector: "Row > Icon(Icons.star)", icon: "Icons.star" })]);
    expect(one!.summary).toBe("An icon (Icons.star) is hard to see in light mode (1.91:1, needs 3:1).");
    expect(one!.fix).toContain("at least 3:1");
    const [labelled] = toFindings([icon({ selector: 'Row > Icon("Rating")', label: "Rating", icon: "U+F01D4" })]);
    expect(labelled!.summary).toBe('The "Rating" icon (U+F01D4) is hard to see in light mode (1.91:1, needs 3:1).');
    const mixed = toFindings([
      icon({ selector: "Row > Icon(Icons.star)", icon: "Icons.star" }),
      icon({ selector: 'Row > Icon("Home")', label: "Home", icon: "Icons.home" }),
      issue({ selector: "#big", label: "Big", ratio: 1.91, expected: 3, fg: "#bbbbbb", bg: "#ffffff" }),
    ]);
    expect(mixed.map((f) => f.summary)).toEqual([
      '2 icons are hard to see in light mode: #bbbbbb on #ffffff (1.91:1, needs 3:1), such as "Home".',
      'Text "Big" is hard to read in light mode (1.91:1, needs 3:1).',
    ]);
  });

  test("a tablet-only finding says tablet, not phone (backlog)", () => {
    const [f] = toFindings([issue({ rule: "target-mobile", selector: "#go", kind: "button", label: "Go", width: 32, height: 32, size: "tablet" })]);
    expect(f!.summary).toBe('The "Go" button is 32×32 px on a tablet; 44×44 px is easier to tap.');
    expect(f!.location.viewport).toBe("tablet");
  });

  test("an issue that says what to do in its app's own terms (a Flutter app has no aria-label) keeps that fix", () => {
    const [own] = toFindings([issue({ rule: "name", selector: "Scaffold > IconButton", kind: "button", label: "", fix: "Give it a tooltip." })]);
    expect(own!.fix).toBe("Give it a tooltip.");
    const [web] = toFindings([issue({ rule: "name", selector: "#go", kind: "button", label: "" })]);
    expect(web!.fix).toBe("Give it a visible label or an accessible name (aria-label, or alt for an image).");
  });

  test("a control with no name is an accessibility finding, one per element across sizes, schemes, variants and directions", () => {
    const unnamed = (over: Partial<AuditIssue>) =>
      issue({ rule: "name", selector: "#menu", kind: "button", label: "", ratio: undefined, expected: undefined, ...over });
    const findings = toFindings([
      unnamed({}),
      unnamed({ size: "desktop", viewport: "desktop", scheme: "dark" }),
      unnamed({ variant: "men" }),
      unnamed({ rtl: true, shot: "design/shots/index.mobile.rtl.png" }),
      unnamed({ selector: "#logo", kind: "image", rtl: true, shot: "design/shots/index.mobile.rtl.png" }),
    ]);
    expect(findings.map((f) => [f.severity, f.category, f.location.selector, f.summary])).toEqual([
      ["major", "accessibility", "#menu", "The button has no name a screen reader can say."],
      ["major", "accessibility", "#logo", "The image has no name a screen reader can say."],
    ]);
    expect(findings[0]!.fix).toBe("Give it a visible label or an accessible name (aria-label, or alt for an image).");
    expect(findings[0]!.location).toEqual({ screen: "/", selector: "#menu", viewport: "mobile" });
    expect(findings[0]!.locations).toBeUndefined();
    // Seen only right to left: the place says so.
    expect(findings[1]!.location).toEqual({ screen: "/", selector: "#logo", viewport: "mobile", rtl: true });
  });

  test("a contrast problem seen only right to left says so; one seen both ways is one place", () => {
    const both = toFindings([issue({}), issue({ rtl: true })]);
    expect(both[0]!.location).not.toHaveProperty("rtl");
    expect(both[0]!.locations).toBeUndefined();
    const onlyRtl = toFindings([issue({ rtl: true })]);
    expect(onlyRtl[0]!.location).toMatchObject({ rtl: true });
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
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
#agree-label { display: inline-flex; align-items: center; gap: 8px; min-width: 120px; height: 48px; }
#pulse { animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.5; } }
</style></head><body>
<a class="sr-only" id="skip" href="#main">Skip to content</a>
<label id="agree-label"><input class="sr-only" id="agree" type="checkbox">I agree</label>
<div class="box" id="pulse"></div>
<p class="faint" id="faint">Faint note</p>
<p>Read the <a id="terms" href="#terms">terms</a> first.</p>
<div class="pair"><button id="zoom-in" aria-label="Zoom in"></button><button id="zoom-out" aria-label="Zoom out"></button></div>
<p><button id="go">Go</button></p>
<button id="off" disabled style="width: 16px; height: 16px; padding: 0" aria-label="Off"></button>
<button id="hidden" style="display: none" aria-label="Hidden"></button>
<details><summary style="display: flex; align-items: center; min-height: 48px">More options</summary><button id="tucked" style="width: 16px; height: 16px; padding: 0" aria-label="Tucked away"></button></details>
<details open><summary style="display: flex; align-items: center; min-height: 48px">Open options</summary><button id="shown" style="width: 30px; height: 30px; padding: 0" aria-label="Shown"></button></details>
<div class="box" id="spinner"></div>
<div class="box" id="guarded"></div>
<div class="box" id="mover"></div>
<p id="hello">Hello</p>
<script>let x = 0; (function f() { x = (x + 1) % 100; document.getElementById("mover").style.transform = "translateX(" + x + "px)"; requestAnimationFrame(f); })();</script>
</body></html>`;
const CLEAN = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin: 0; padding: 24px; font: 16px sans-serif; background: #ffffff; color: #111111"><h1>Clean</h1><button style="width: 48px; height: 48px">OK</button><p>All good.</p>
<!-- 44 px tall to the eye: padding around a line of text 1.4 times 14 px, as Tailwind draws py-3 text-sm (plan 2K, Task 8). -->
<button style="padding: 12px 16px; border: 0; font-size: 14px; line-height: 1.4">Add item</button></body></html>`;

// A browser from before 2022 has no checkVisibility(): the audit still runs there.
const OLD_BROWSER = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<script>delete Element.prototype.checkVisibility;</script></head>
<body style="margin: 0; padding: 24px; font: 16px sans-serif; background: #ffffff; color: #111111">
<button id="small" style="width: 30px; height: 30px; padding: 0" aria-label="Small"></button></body></html>`;

// What react-native-web draws: a Pressable or Touchable is <div tabindex="0"> with a pointer cursor and no role, and an
// icon font's glyph is a private-use character in a text node (here U+E001, and U+F0001 beyond the first plane).
const RN = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>@keyframes turn { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes sweep { from { transform: translateX(0); } to { transform: translateX(60px); } }
.r-spin { animation-duration: 0.75s; animation-name: turn; animation-timing-function: linear; animation-iteration-count: infinite; }
.r-sweep { animation: sweep 0.8s linear infinite alternate; }</style></head>
<body style="margin: 0; padding: 24px; font: 16px sans-serif; background: #ffffff; color: #111111">
<div id="icon" tabindex="0" style="cursor: pointer; width: 32px; height: 32px; background: #444444"><div dir="auto">&#xE001;</div></div>
<div id="plus" tabindex="0" style="cursor: pointer; width: 32px; height: 32px; background: #444444"><div dir="auto" aria-hidden="true">&#xF0001;</div></div>
<div id="named" tabindex="0" aria-label="Add item" style="cursor: pointer; width: 32px; height: 32px; background: #444444"><div dir="auto">&#xE001;</div></div>
<div id="skip" tabindex="0" style="cursor: pointer; width: 120px; height: 60px; background: #dddddd"><div dir="auto">Skip</div></div>
<div id="outer" tabindex="0" aria-label="Open" style="cursor: pointer; width: 120px; height: 60px; background: #dddddd"><div id="inner" tabindex="0" style="cursor: pointer; width: 20px; height: 20px"></div></div>
<div id="focusable" tabindex="0" style="width: 32px; height: 32px; background: #dddddd"></div>
<button id="glyph" role="button" style="width: 32px; height: 32px; padding: 0">&#xE001;</button>
<button id="back" aria-label="Back" style="width: 60px; height: 60px; padding: 0">&#xE001;</button>
<div role="tablist"><div id="tab" role="tab" tabindex="0" aria-selected="true" style="cursor: pointer; width: 60px; height: 60px; background: #dddddd"><svg width="24" height="24"><circle cx="12" cy="12" r="8"></circle></svg></div>
<div id="search-tab" role="tab" tabindex="0" aria-label="Search" style="cursor: pointer; width: 60px; height: 60px; background: #dddddd"></div></div>
<!-- ActivityIndicator as react-native-web 0.21 draws it (taken from HiSalon's app on Expo's web target). -->
<div role="progressbar" aria-valuemax="1" aria-valuemin="0" class="css-view"><div id="turning" class="css-view r-spin" style="height: 36px; width: 36px"><svg height="100%" viewBox="0 0 32 32" width="100%"><circle cx="16" cy="16" fill="none" r="14" stroke-width="4" style="stroke: #1976d2; opacity: 0.2;"></circle><circle cx="16" cy="16" fill="none" r="14" stroke-width="4" style="stroke: #1976d2; stroke-dasharray: 80; stroke-dashoffset: 60;"></circle></svg></div></div>
<!-- The app's own bars with accessibilityRole="progressbar": an Animated loop (an inline transform, frame by frame) and a CSS sweep. -->
<div role="progressbar" aria-label="Uploading" style="width: 120px; height: 8px"><div id="shimmer" style="width: 40px; height: 8px; background: #0a5"></div></div>
<div role="progressbar" aria-label="Syncing" style="width: 120px; height: 8px"><div id="sweep" class="r-sweep" style="width: 40px; height: 8px; background: #0a5"></div></div>
<script>
const shimmer = document.getElementById("shimmer");
const step = (t) => { shimmer.style.transform = "translateX(" + Math.round((t / 10) % 80) + "px)"; requestAnimationFrame(step); };
requestAnimationFrame(step);
</script></body></html>`;

// What Angular Material draws (plan 2K's hands-on, Material 22): a 40 px button and a 40 px icon button, each with an empty
// span inside, absolutely placed, that makes its hit area 48 px tall; and a slide toggle, a role="switch" button named
// through aria-labelledby, with a 48 px touch target of its own; and RealWorld's logo link, named by its image's alt. A child that takes no taps (pointer-events: none), or one the control clips, is no hit area.
// Nor is a corner badge (it doesn't cover the control's centre), or a centred touch target a wrapper inside the control
// clips. A 43.4 px button is 43 px as reported, and too small. A ::after laid over a small button (inset: -12px, the job
// tracker's close buttons in the v1.0 field trial) is its hit area, unless it takes no taps. So is one a link that isn't
// positioned stretches over the card around it (the v1.1 trial's Stats tiles), but not one that misses the link's centre.
const LIBRARY = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>button { position: relative; padding: 0 12px; border: 0; height: 40px; font: 14px sans-serif; }
.touch { position: absolute; top: 50%; left: 0; right: 0; height: 48px; transform: translateY(-50%); }
.icon .touch { left: 50%; width: 48px; transform: translate(-50%, -50%); }
.switch { width: 52px; height: 32px; padding: 0; }
#inert-touch .touch { pointer-events: none; }
.hit::after { content: ""; position: absolute; inset: -12px; }
#pseudo-inert::after { pointer-events: none; }
.tile { position: relative; width: 160px; height: 80px; }
.tile a { display: inline-block; width: 16px; height: 20px; }
.stretch::after { content: ""; position: absolute; inset: 0; }
.corner { margin-left: 100px; }
.corner::after { content: ""; position: absolute; top: 0; left: 0; right: 150px; bottom: 70px; }</style></head>
<body style="margin: 0; padding: 24px; font: 16px sans-serif; background: #ffffff; color: #111111">
<p><button id="order">Place order<span class="touch"></span></button></p>
<p><button id="settings" class="icon" aria-label="Settings" style="width: 40px; padding: 0"><span class="touch"></span></button></p>
<p><button id="remind" class="switch" role="switch" aria-checked="false" aria-labelledby="remind-label"><div class="touch"></div></button>
<span id="remind-label">Remind me</span></p>
<p><button id="bare" role="switch" aria-checked="false" aria-labelledby="bare-label" class="switch"></button><span id="bare-label">Alerts</span></p>
<p><button id="inert-touch">Later<span class="touch"></span></button></p>
<p><button id="clipped" style="overflow: hidden">Skip<span class="touch"></span></button></p>
<p><a id="brand" href="/" style="display: inline-block"><img alt="Conduit" width="88" height="24" style="display: block" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></a></p>
<p><button id="badge" class="icon" aria-label="Inbox" style="width: 40px; padding: 0"><span style="position: absolute; top: -6px; right: -6px; width: 16px; height: 16px; background: #c00000; color: #ffffff; font-size: 10px">3</span></button></p>
<p><button id="wrapped" class="icon" aria-label="Share" style="width: 40px; padding: 0"><span style="position: relative; display: block; width: 40px; height: 40px; overflow: hidden"><span class="touch"></span></span></button></p>
<p><button id="near" aria-label="Near" style="width: 43.4px; height: 43.4px; padding: 0"></button></p>
<p><button id="pseudo" class="hit" aria-label="Close" style="width: 20px; height: 20px; padding: 0"></button></p>
<p><button id="pseudo-inert" class="hit" aria-label="Pin" style="width: 30px; height: 30px; padding: 0"></button></p>
<div class="tile"><a id="stretched" class="stretch" href="/stats/applied">12</a></div>
<div class="tile"><a id="cornered" class="corner" href="/stats/rejected">7</a></div></body></html>`;

const browser = findBrowser();
let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (req) => {
      const path = new URL(req.url).pathname;
      return new Response(path === "/clean" ? CLEAN : path === "/old" ? OLD_BROWSER : path === "/rn" ? RN : path === "/library" ? LIBRARY : BAD, { headers: { "content-type": "text/html" } });
    },
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
      "minor target-size / #shown",
    ]);
    expect(findings[0]!.summary).toContain("Faint note");
    // Found at every phone size; the finding keeps the first screenshot, the narrowest phone.
    expect(findings[0]!.shot).toEndWith("index.mobile-360.png");
  }, 120_000);

  test("React Native apps: a Pressable with no role is a control, an icon's glyph is no name, and web apps are judged as before (Task 8)", async () => {
    const audit = async (reactNative: boolean) => {
      const { routes, issues } = await captureScreens({
        browserPath: browser!.path,
        baseUrl: `http://127.0.0.1:${server.port}`,
        routes: ["/rn"],
        outDir: tempDir("motif-audit-"),
        audit: true,
        settleMs: 100,
        ...(reactNative ? { reactNative: true } : {}),
      });
      expect(routes[0]!.auditError).toBeUndefined();
      return toFindings(issues).map((f) => `${f.category} ${f.location.selector}: ${f.summary}`);
    };
    // Web: the divs are not controls, the glyph is text to axe, and a spinner that keeps turning is motion (a web page draws
    // its own and can stop it).
    expect(await audit(false)).toEqual([
      "reduced-motion #turning: An element keeps moving when the viewer asks for reduced motion.",
      "reduced-motion #sweep: An element keeps moving when the viewer asks for reduced motion.",
      "reduced-motion #shimmer: An element keeps moving when the viewer asks for reduced motion.",
      "target-size #glyph: The \"\ue001\" button is 32×32 px on a phone; 44×44 px is easier to tap.",
    ]);
    // React Native: the unnamed Pressables are buttons with no name (the glyph and the aria-hidden glyph are not names), and so is the
    // button axe passed for its glyph, and a tab with only an icon (accessibilityRole="tab", as a tab bar has; hands-on); the
    // named, large, nested and non-pointer ones are not reported. ActivityIndicator's spinner is the platform's, which the
    // app can't stop under reduce motion: not a motion finding; the app's own progress bars, which it can stop, still are.
    expect(await audit(true)).toEqual([
      "accessibility #icon: The button has no name a screen reader can say.",
      "accessibility #plus: The button has no name a screen reader can say.",
      "accessibility #glyph: The icon has no name a screen reader can say.",
      "accessibility #tab: The tab has no name a screen reader can say.",
      "reduced-motion #sweep: An element keeps moving when the viewer asks for reduced motion.",
      "reduced-motion #shimmer: An element keeps moving when the viewer asks for reduced motion.",
      "target-size #glyph: A button is 32×32 px on a phone; 44×44 px is easier to tap.",
      "target-size #icon: A button is 32×32 px on a phone; 44×44 px is easier to tap.",
      "target-size #plus: A button is 32×32 px on a phone; 44×44 px is easier to tap.",
      'target-size #named: The "Add item" button is 32×32 px on a phone; 44×44 px is easier to tap.',
    ]);
  }, 120_000);

  test("a hit area a component library adds inside a control counts; a control named through aria-labelledby or an image's alt is called by its name (2K hands-on)", async () => {
    const { routes, issues } = await captureScreens({
      browserPath: browser!.path,
      baseUrl: `http://127.0.0.1:${server.port}`,
      routes: ["/library"],
      outDir: tempDir("motif-audit-"),
      audit: true,
      settleMs: 100,
    });
    expect(routes[0]!.auditError).toBeUndefined();
    expect(toFindings(issues).map((f) => `${f.location.selector}: ${f.summary}`)).toEqual([
      '#bare: The "Alerts" button is 52×32 px on a phone; 44×44 px is easier to tap.',
      '#inert-touch: The "Later" button is 56×40 px on a phone; 44×44 px is easier to tap.',
      '#clipped: The "Skip" button is 51×40 px on a phone; 44×44 px is easier to tap.',
      '#brand: The "Conduit" link is 88×24 px on a phone; 44×44 px is easier to tap.',
      // The same class, short by the same pixels: one cause.
      '#badge: 2 buttons are 40×40 px on a phone, such as "Inbox" and "Share"; 44×44 px is easier to tap.',
      '#near: The "Near" button is 43×43 px on a phone; 44×44 px is easier to tap.',
      '#pseudo-inert: The "Pin" button is 30×30 px on a phone; 44×44 px is easier to tap.',
      '#cornered: The "7" link is 16×20 px on a phone; 44×44 px is easier to tap.',
    ]);
  }, 120_000);

  test("a browser without checkVisibility() still gets its audit", async () => {
    const { routes, issues } = await captureScreens({
      browserPath: browser!.path,
      baseUrl: `http://127.0.0.1:${server.port}`,
      routes: ["/old"],
      outDir: tempDir("motif-audit-"),
      audit: true,
      settleMs: 100,
    });
    expect(routes[0]!.auditError).toBeUndefined();
    expect(toFindings(issues).map((f) => `${f.severity} ${f.category} ${f.location.selector}`)).toEqual(["minor target-size #small"]);
  }, 120_000);
});
