import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { readPairs } from "../src/contract/contrast";
import { checkRoles } from "../src/contract/roles";
import { validateTokens } from "../src/contract/tokens";
import type { Sample } from "../src/extract/cluster";
import { buildDraft, collectOccurrences, type Occurrences } from "../src/extract/draft";
import type { TailwindDefaults } from "../src/extract/tailwind-theme";
import { docFrom } from "./helpers";

const tw: TailwindDefaults = {
  colors: new Map([["blue-500", "oklch(62.3% 0.214 259.815)"], ["white", "#fff"]]),
  spacingPx: 4,
  radiusPx: new Map([["md", 6]]),
  textPx: new Map([["sm", 14]]),
  easings: new Map([["in-out", "cubic-bezier(0.4, 0, 0.2, 1)"]]),
};
const files: SourceFile[] = [
  { path: "src/App.tsx", abs: "", lang: "script", text: '<div className="bg-blue-500 text-white p-3 rounded-md text-sm" style={{ color: "#111827" }} />' },
  { path: "src/a.css", abs: "", lang: "css", text: ".a { padding: 13px; font-family: 'Inter', sans-serif; transition: opacity 200ms ease-out; }" },
];
const values = (samples: Sample[]) => samples.map((s) => s.value);

describe("collectOccurrences", () => {
  test("gathers every literal value, resolving Tailwind classes", () => {
    const occ = collectOccurrences(files, tw);
    expect(values(occ.colors).sort()).toEqual(["#111827", "#fff", "oklch(62.3% 0.214 259.815)"]);
    expect(occ.colors.find((c) => c.value.startsWith("oklch"))!.contexts).toEqual({ background: 1 });
    expect(values(occ.space).sort()).toEqual(["12px", "13px"]);
    expect(values(occ.radius)).toEqual(["6px"]);
    expect(values(occ.fontSize)).toEqual(["14px"]);
    expect(values(occ.fontFamily)).toEqual(["Inter"]);
    expect(values(occ.duration)).toEqual(["200ms"]);
    expect(values(occ.easing)).toEqual(["cubic-bezier(0, 0, 0.58, 1)"]);
    expect(occ.unresolved).toEqual([]);
    expect(occ.colors.find((c) => c.value === "#111827")!.examples).toEqual(["src/App.tsx:1"]);
  });
  test("spacing classes follow the app's own spacing base (Tailwind's --spacing) (backlog)", () => {
    expect(values(collectOccurrences(files, { ...tw, spacingPx: 8 }).space).sort()).toEqual(["13px", "24px"]);
  });
  test("without Tailwind installed, palette and key classes are unresolved", () => {
    expect(values(collectOccurrences(files, null).unresolved).sort()).toEqual(["bg-blue-500", "rounded-md", "text-sm", "text-white"]);
  });
});

const s = (value: string, count: number, context?: string): Sample => ({ value, count, contexts: context ? { [context]: count } : {}, examples: [] });
const occ: Occurrences = {
  colors: [
    s("#111827", 10, "text"), s("#FFFFFF", 8, "background"), s("#7C3AED", 5, "background"), s("#6B7280", 4, "text"),
    s("#F3F4F6", 3, "background"), s("#E5E7EB", 2, "border"), s("#16A34A", 1, "text"),
  ],
  space: [s("12px", 5), s("13px", 1)],
  radius: [s("6px", 3), s("12px", 1)],
  fontSize: [s("16px", 10), s("20px", 3), s("14px", 2), s("32px", 1)],
  fontFamily: [s("Inter", 3)],
  duration: [s("150ms", 2), s("300ms", 1)],
  easing: [s("cubic-bezier(0.4, 0, 0.2, 1)", 2)],
  unresolved: [],
};

describe("buildDraft", () => {
  const { tokens, report } = buildDraft(occ);
  const doc = docFrom(tokens);
  const t = tokens as any;

  test("produces a complete design guide that passes the structural checks", () => {
    expect(validateTokens(doc)).toEqual([]);
    expect(checkRoles(doc)).toEqual([]);
    expect(readPairs(doc).findings).toEqual([]);
  });

  test("infers colour roles from how colours are used", () => {
    expect(report.roles).toMatchObject({
      "color.text-primary": "found-1",
      "color.background": "found-2",
      "color.action-primary": "found-3",
      "color.text-secondary": "found-4",
      "color.surface": "found-5",
      "color.border": "found-6",
      "color.success": "found-7",
      "color.warning": "default",
      "color.danger": "default",
      "color.info": "default",
    });
    expect(t.color["on-action-primary"].$value).toBe("{primitive.color.white}");
    expect(t.primitive.color["found-1"].$value.hex).toBe("#111827");
  });

  test("sizes, type and motion", () => {
    expect(t.radius.sm.$value).toEqual({ value: 6, unit: "px" });
    expect(t.radius.md.$value).toEqual({ value: 12, unit: "px" });
    expect(t.radius.lg.$value).toEqual({ value: 18, unit: "px" });
    expect([t.font.caption, t.font.label, t.font.body, t.font.heading, t.font.title, t.font.display].map((f: any) => f.$value.fontSize.value))
      .toEqual([14, 14, 16, 20, 32, 40]);
    expect(t.primitive.font.sans.$value).toEqual(["Inter", "system-ui", "sans-serif"]);
    expect([t.duration.fast, t.duration.base, t.duration.slow].map((d: any) => d.$value.value)).toEqual([150, 300, 300]);
    expect(t.easing.standard.$value).toEqual([0.4, 0, 0.2, 1]);
  });

  test("the report explains spacing and what was assumed", () => {
    expect(report.spacing).toEqual([
      { px: 12, count: 5, nearest: "space.3", onScale: true, examples: [] },
      { px: 13, count: 1, nearest: "space.3", onScale: false, examples: [] },
    ]);
    expect(report.notes.join("\n")).toContain("Dark-mode colours were copied from light mode");
    expect(report.notes.join("\n")).toContain("warning, danger, info");
  });
});

describe("buildDraft: real-app details", () => {
  test("the background prefers a neutral colour over a brand colour", () => {
    const o: Occurrences = { ...occ, colors: [s("#7EEBC1", 9, "background"), s("#FFFFFF", 3, "background"), s("#111827", 5, "text")] };
    const r = buildDraft(o).report;
    const hexOf = (role: string) => (r.colors as any[]).find((c) => c.id === r.roles[role])?.hex;
    expect(hexOf("color.background")).toBe("#FFFFFF");
    expect(hexOf("color.action-primary")).toBe("#7EEBC1");
  });
  test("a named font wins over a generic family like monospace", () => {
    const t = buildDraft({ ...occ, fontFamily: [s("monospace", 13), s("Thmanyah Sans", 5)] }).tokens as any;
    expect(t.primitive.font.sans.$value[0]).toBe("Thmanyah Sans");
  });
});

describe("collectOccurrences + buildDraft: the page's background (backlog)", () => {
  test("the background set on body is the page's, even when white cards use another more", () => {
    const css: SourceFile = {
      path: "styles.css", abs: "", lang: "css",
      text: "body { background: #f4f4f5; color: #18181b }\n" + Array.from({ length: 6 }, (_, i) => `.card-${i} { background: #ffffff }`).join("\n"),
    };
    const { tokens, report } = buildDraft(collectOccurrences([css], null, () => false));
    const hexOf = (role: string) => (tokens as any).primitive.color[report.roles[`color.${role}`]!].$value.hex.toLowerCase();
    expect([hexOf("background"), hexOf("surface")]).toEqual(["#f4f4f5", "#ffffff"]);
  });
});
