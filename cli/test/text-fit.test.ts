import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { launchBrowser } from "../src/browser/cdp";
import { findBrowser } from "../src/detect/browser";
import { auditPage, toFindings, type AuditIssue, type RawIssue } from "../src/shot/audit";

// text-fit: text cut off with an ellipsis or clip, and short labels broken one word per line (WCAG 1.4.10, 1.4.12).
const browser = findBrowser();

describe.skipIf(!browser)("text-fit in the web audit (needs Chrome, Edge or Chromium)", () => {
  let b: Awaited<ReturnType<typeof launchBrowser>>;
  beforeAll(async () => {
    b = await launchBrowser(browser!.path);
  });
  afterAll(async () => {
    await b?.close();
  });

  const fitIssues = async (body: string, dir = "ltr"): Promise<RawIssue[]> => {
    const page = await b.newPage();
    await page.goto("data:text/html," + encodeURIComponent(`<html dir="${dir}"><body style="margin:0;font:16px sans-serif">${body}</body></html>`));
    const issues = await auditPage(page, { viewport: "desktop", scheme: "light", motion: false });
    return issues.filter((i) => i.rule === "text-fit");
  };

  const CUT = '<button style="width:60px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Morning Session</button>';

  test("a button whose label is cut with an ellipsis is one cut, major", async () => {
    const found = await fitIssues(CUT);
    expect(found.map((i) => [i.fit, i.kind, i.label, i.prominent])).toEqual([["cut", "button", "Morning Session", true]]);
  });

  test("a short label laid out one word per line is one broken", async () => {
    const found = await fitIssues('<span style="display:inline-block;width:40px">12 days left</span>');
    expect(found.map((i) => [i.fit, i.label])).toEqual([["broken", "12 days left"]]);
  });

  test("a clean page has none", async () => {
    expect(await fitIssues('<h1>Welcome back</h1><button>Continue</button><p>A paragraph that wraps over several lines is fine.</p>')).toEqual([]);
  });

  test("a one-word label in a narrow box is not reported", async () => {
    expect(await fitIssues('<span style="display:inline-block;width:20px">Settings</span>')).toEqual([]);
  });

  test("a visually hidden screen-reader label is not reported", async () => {
    const sr = 'style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"';
    expect(await fitIssues(`<span ${sr}>Skip to the main content</span>`)).toEqual([]);
  });

  test("lines are counted from the text alone, not from a hidden input or a hit-area child beside it", async () => {
    const page = `<style>.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.touch{position:absolute;inset:-8px}</style>
      <label style="display:inline-flex;align-items:center;gap:8px;height:48px"><input class="sr" type="checkbox">I agree</label>
      <p><button style="position:relative">Place order<span class="touch"></span></button></p>`;
    expect(await fitIssues(page)).toEqual([]);
  });

  test("right to left, the cut button is found the same way", async () => {
    const found = await fitIssues(CUT, "rtl");
    expect(found.map((i) => [i.fit, i.kind])).toEqual([["cut", "button"]]);
  });

  test("text in a box that only clips without nowrap or ellipsis, and fits, is not reported", async () => {
    expect(await fitIssues('<div style="width:200px;overflow:hidden">Short text</div>')).toEqual([]);
  });

  test("a heading cut by a line clamp is one cut, major", async () => {
    const found = await fitIssues('<h2 style="width:120px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden">A heading much longer than its box</h2>');
    expect(found.map((i) => [i.fit, i.prominent])).toEqual([["cut", true]]);
  });
});

describe("text-fit findings", () => {
  const issue = (over: Partial<AuditIssue>): AuditIssue => ({
    rule: "text-fit", selector: "button", label: "Morning Session", kind: "button", fit: "cut", prominent: true,
    route: "/", viewport: "mobile", scheme: "light", shot: "home-mobile-light.png", ...over,
  });

  test("a prominent cut label is major, under typography, and says what was cut", () => {
    const [f] = toFindings([issue({})]);
    expect([f!.severity, f!.category]).toEqual(["major", "typography"]);
    expect(f!.summary).toBe('"Morning Session" is cut off.');
    expect(f!.fix).toBe("Shorten the copy, or let it wrap once and give the row room.");
  });

  test("a broken label elsewhere is minor", () => {
    const [f] = toFindings([issue({ kind: "element", fit: "broken", prominent: false, label: "12 days left" })]);
    expect([f!.severity, f!.summary]).toEqual(["minor", '"12 days left" breaks one word per line.']);
  });
});
