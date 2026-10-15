import type { Page } from "../browser/cdp";
import { AXE_SOURCE } from "./axe";
import type { Scheme } from "./capture";

export type IssueRule = "color-contrast" | "target-size" | "target-mobile" | "motion";

/** One problem, as the page reports it. */
export interface RawIssue {
  rule: IssueRule;
  /** A CSS selector that finds the element. */
  selector: string;
  /** Its visible text or accessible name, shortened. */
  label: string;
  kind: "link" | "button" | "field" | "element";
  ratio?: number;
  expected?: number;
  fg?: string;
  bg?: string;
  width?: number;
  height?: number;
}

export interface AuditIssue extends RawIssue {
  route: string;
  viewport: "mobile" | "desktop";
  scheme: Scheme;
  /** The screenshot of that page, viewport and scheme. */
  shot: string;
  /** The state script the page was in, if any. */
  state?: string;
}

export type Severity = "critical" | "major" | "minor";

export interface ReviewFinding {
  id: string;
  severity: Severity;
  category: "contrast" | "target-size" | "reduced-motion";
  source: "exact";
  location: { screen: string; selector: string; viewport: "mobile" | "desktop"; scheme?: Scheme; state?: string };
  summary: string;
  fix: string;
  shot: string;
  status: "open";
}

export interface Review {
  motifReview: 1;
  scope: string;
  date: string;
  findings: ReviewFinding[];
}

interface AuditApi {
  axe(rules: string[]): Promise<RawIssue[]>;
  smallTargets(min: number): RawIssue[];
  motion(sampleMs: number): Promise<RawIssue[]>;
}

declare const axe: { run(context: unknown, options: unknown): Promise<{ violations: any[] }> };

/** Runs inside the page and defines window.__motifAudit. It's sent as source text, so it may only use browser globals. */
function installAudit(): boolean {
  const unique = (selector: string) => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };
  const path = (el: Element): string => {
    const parts: string[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const current = e;
      if (current.id && unique(`#${CSS.escape(current.id)}`)) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      let part = current.tagName.toLowerCase();
      const same = current.parentElement ? [...current.parentElement.children].filter((s) => s.tagName === current.tagName) : [];
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(current) + 1})`;
      parts.unshift(part);
      if (unique(parts.join(" > "))) break;
    }
    return parts.join(" > ");
  };
  const kind = (el: Element): RawIssue["kind"] => {
    const role = el.getAttribute("role");
    if (el.tagName === "A" || role === "link") return "link";
    if (el.tagName === "BUTTON" || role === "button") return "button";
    if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return "field";
    return "element";
  };
  const label = (el: Element) =>
    (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("title") || el.getAttribute("alt") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
  const describe = (el: Element) => ({ selector: path(el), label: label(el), kind: kind(el) });

  const api: AuditApi = {
    async axe(rules) {
      const result = await axe.run(document, { runOnly: { type: "rule", values: rules }, resultTypes: ["violations"] });
      const out: RawIssue[] = [];
      for (const violation of result.violations) {
        for (const node of violation.nodes) {
          const el = node.target.length === 1 ? document.querySelector(node.target[0]) : null;
          const info = el ? describe(el) : { selector: node.target.join(" >>> "), label: "", kind: "element" as const };
          const data = (node.any.find((c: any) => c.id === violation.id) ?? node.any[0] ?? {}).data ?? {};
          const rect = el?.getBoundingClientRect();
          out.push({
            rule: violation.id,
            ...info,
            ratio: data.contrastRatio,
            expected: data.expectedContrastRatio ? Number.parseFloat(data.expectedContrastRatio) : undefined,
            fg: data.fgColor,
            bg: data.bgColor,
            width: rect ? Math.round(rect.width) : data.width,
            height: rect ? Math.round(rect.height) : data.height,
          });
        }
      }
      return out;
    },
    smallTargets(min) {
      const selector =
        'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"]';
      const out: RawIssue[] = [];
      for (const el of document.querySelectorAll(selector)) {
        if (el.matches(":disabled, [aria-disabled='true']") || el.closest("[hidden], [inert], [aria-hidden='true']")) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // Visually hidden for screen readers (the usual sr-only pattern): not something anyone taps.
        const clipped = style.clip === "rect(0px, 0px, 0px, 0px)" || /inset\(50%\)/.test(style.clipPath);
        if (clipped || (rect.width <= 1 && rect.height <= 1)) {
          // A form control styled through its label is tapped through the label: measure that instead, below.
          if (!(el as HTMLInputElement).labels?.length) continue;
        }
        // Links inside a sentence are exempt, as in WCAG 2.5.8.
        const parentText = el.parentElement?.textContent?.trim() ?? "";
        if (style.display === "inline" && parentText.length > (el.textContent?.trim().length ?? 0)) continue;
        // A label is part of its control's hit area.
        let width = rect.width;
        let height = rect.height;
        for (const lbl of Array.from((el as HTMLInputElement).labels ?? [])) {
          const r = lbl.getBoundingClientRect();
          width = Math.max(width, r.width);
          height = Math.max(height, r.height);
        }
        if (width < min || height < min) {
          out.push({ rule: "target-mobile", ...describe(el), width: Math.round(width), height: Math.round(height) });
        }
      }
      return out;
    },
    async motion(sampleMs) {
      // Only movement counts: reduced motion is about things moving, so fades and colour changes are fine
      // (Motion's reducedMotion="user" keeps opacity animations too).
      // (Every keyframe also has "offset", its place in the timeline; motion paths are offsetPath, offsetDistance, …)
      const MOVES = /^(transform|translate|rotate|scale|offset(Path|Distance|Rotate|Anchor|Position)|left|top|right|bottom|inset|width|height|margin|backgroundPosition)/;
      const moving = new Set<Element>();
      for (const animation of document.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        const target = effect?.target;
        if (animation.playState !== "running" || !(target instanceof Element)) continue;
        if (effect!.getKeyframes().some((frame) => Object.keys(frame).some((property) => MOVES.test(property)))) moving.add(target);
      }
      // Script-driven motion (requestAnimationFrame) doesn't show up in getAnimations: compare two samples.
      const elements = [...document.querySelectorAll("body *")];
      const sample = () =>
        elements.map((e) => {
          const s = getComputedStyle(e);
          return `${s.transform}|${s.translate}|${s.rotate}|${s.scale}|${s.left}|${s.top}`;
        });
      const before = sample();
      await new Promise((resolve) => setTimeout(resolve, sampleMs));
      const after = sample();
      elements.forEach((e, i) => {
        if (before[i] !== after[i]) moving.add(e);
      });
      return [...moving]
        .filter((e) => e.isConnected && e.getBoundingClientRect().width > 0)
        .map((e) => ({ rule: "motion" as const, ...describe(e) }));
    },
  };
  (window as unknown as { __motifAudit: AuditApi }).__motifAudit = api;
  return true;
}

const INSTALL_AUDIT = `(${installAudit.toString()})()`;

/** Audits the page as it is now (loaded and settled, reduced motion emulated). */
export async function auditPage(page: Page, ctx: { viewport: "mobile" | "desktop"; scheme: Scheme; motionSampleMs?: number }): Promise<RawIssue[]> {
  await page.evaluate(`${AXE_SOURCE}\n;true`);
  await page.evaluate(INSTALL_AUDIT);
  const light = ctx.scheme === "light";
  const rules = light ? ["color-contrast", "target-size"] : ["color-contrast"];
  const issues = await page.evaluate<RawIssue[]>(`__motifAudit.axe(${JSON.stringify(rules)})`);
  if (light && ctx.viewport === "mobile") issues.push(...(await page.evaluate<RawIssue[]>("__motifAudit.smallTargets(44)")));
  if (light && ctx.viewport === "desktop") issues.push(...(await page.evaluate<RawIssue[]>(`__motifAudit.motion(${ctx.motionSampleMs ?? 300})`)));
  return issues;
}

const ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };

function subject(issue: RawIssue, textual: boolean): string {
  if (issue.kind !== "element") return issue.label ? `The "${issue.label}" ${issue.kind}` : `A ${issue.kind}`;
  if (textual) return issue.label ? `Text "${issue.label}"` : "Some text";
  return issue.label ? `The "${issue.label}" element` : "An element";
}

function judge(issue: AuditIssue): Pick<ReviewFinding, "severity" | "category" | "summary" | "fix"> & { withScheme: boolean } {
  switch (issue.rule) {
    case "color-contrast":
      return {
        severity: (issue.ratio ?? 0) < 3 ? "critical" : "major",
        category: "contrast",
        summary: `${subject(issue, true)} is hard to read in ${issue.scheme} mode (${issue.ratio}:1, needs ${issue.expected ?? 4.5}:1).`,
        fix: "Use a text colour role with more contrast on this background, or adjust the role in design/tokens.json (motif validate checks the pairs).",
        withScheme: true,
      };
    case "target-size":
      return {
        severity: "critical",
        category: "target-size",
        summary: `${subject(issue, false)} is ${issue.width}×${issue.height} px with too little space around it; taps need at least 24×24 px (WCAG 2.2 AA).`,
        fix: "Make it at least 24×24 px (padding counts), or give it more space from nearby targets.",
        withScheme: false,
      };
    case "target-mobile":
      return {
        severity: "minor",
        category: "target-size",
        summary: `${subject(issue, false)} is ${issue.width}×${issue.height} px on a phone; 44×44 px is easier to tap.`,
        fix: "Give it at least 44×44 px on small screens, with padding or a larger hit area.",
        withScheme: false,
      };
    case "motion":
      return {
        severity: "major",
        category: "reduced-motion",
        summary: `${subject(issue, false)} keeps moving when the viewer asks for reduced motion.`,
        fix: 'Stop or simplify this animation under prefers-reduced-motion (React web: MotionConfig reducedMotion="user" at the app root, or Tailwind\'s motion-safe: variant).',
        withScheme: false,
      };
  }
}

const mergeKey = (i: AuditIssue) =>
  i.rule === "color-contrast" ? `${i.rule}|${i.route}|${i.state ?? ""}|${i.selector}|${i.scheme}` : `${i.rule}|${i.route}|${i.state ?? ""}|${i.selector}`;

/** Findings in the review format: repeats merged, worst first, numbered F-001, F-002… */
export function toFindings(issues: AuditIssue[]): ReviewFinding[] {
  const seen = new Set<string>();
  const kept: Omit<ReviewFinding, "id">[] = [];
  for (const issue of issues) {
    const key = mergeKey(issue);
    // A target already reported as too small for everyone isn't reported again as small on phones.
    if (seen.has(key) || (issue.rule === "target-mobile" && seen.has(`target-size|${issue.route}|${issue.state ?? ""}|${issue.selector}`))) continue;
    seen.add(key);
    const { withScheme, ...verdict } = judge(issue);
    kept.push({
      severity: verdict.severity,
      category: verdict.category,
      source: "exact",
      location: { screen: issue.route, selector: issue.selector, viewport: issue.viewport, ...(withScheme ? { scheme: issue.scheme } : {}), ...(issue.state ? { state: issue.state } : {}) },
      summary: verdict.summary,
      fix: verdict.fix,
      shot: issue.shot,
      status: "open",
    });
  }
  kept.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return kept.map((f, n) => ({ id: `F-${String(n + 1).padStart(3, "0")}`, ...f }));
}

export function reviewJson(findings: ReviewFinding[], routes: string[], date: string): Review {
  return { motifReview: 1, scope: `screens: ${routes.join(", ")}`, date, findings };
}
