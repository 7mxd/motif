import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runExtract } from "../src/commands/extract";
import type { SourceFile } from "../src/check/files";
import { checkContrastAll, readPairs } from "../src/contract/contrast";
import { checkRoles } from "../src/contract/roles";
import { validateTokens } from "../src/contract/tokens";
import { checkVariants } from "../src/contract/variants";
import type { Sample } from "../src/extract/cluster";
import { isMonospace } from "../src/contract/defaults";
import { buildDraft, collectOccurrences, type Occurrences } from "../src/extract/draft";
import type { TailwindDefaults } from "../src/extract/tailwind-theme";
import { docFrom, FIXTURES } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

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

describe("collectOccurrences: what counts as a class use", () => {
  const theme: SourceFile = { path: "src/index.css", abs: "", lang: "css", text: "@theme { --color-card: #fafafa; --color-ink: #111111; }" };
  /** Each colour's count with this App.tsx beside the theme. */
  const counts = (text: string) => {
    const occ = collectOccurrences([theme, { path: "src/App.tsx", abs: "", lang: "script", text }], tw, () => true, () => true);
    return Object.fromEntries(occ.colors.map((c) => [c.value, c.count]));
  };
  const none = counts("");

  test("a class in a className counts", () => {
    expect(counts('<div className="bg-card text-ink bg-blue-500" />')).toEqual({ ...none, "#fafafa": 2, "#111111": 2, "oklch(62.3% 0.214 259.815)": 1 });
  });
  test("a class name in an import path or in the page's prose isn't a use", () => {
    const app = [
      'import "./bg-card.css";',
      'import { Ink } from "@/components/text-ink";',
      'const Pane = lazy(() => import("./panes/bg-blue-500"));',
      "export const A = () => <p>Give cards the bg-card class, and links the text-ink or bg-blue-500 one.</p>;",
    ].join("\n");
    expect(counts(app)).toEqual(none);
  });
  test("a see-through class (bg-card/10) isn't a use of the solid colour", () => {
    expect(counts('<div className="bg-card/10 text-ink/50 bg-blue-500/20" />')).toEqual(none);
  });
});

const s = (value: string, count: number, context?: string): Sample =>({ value, count, contexts: context ? { [context]: count } : {}, examples: [] });
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
      // #6B7280 is the second text colour, but it reads at 4.39:1 on the found-5 cards (#F3F4F6), short of validate's
      // 4.5:1, so it's darkened a little to read there (v0.5.0 sweep, Landmarks problem 7).
      "color.text-secondary": "found-4-darker",
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
  test("a code font becomes the optional mono role, never the brand font (backlog)", () => {
    const t = buildDraft({ ...occ, fontFamily: [s("Fira Code", 13), s("Inter", 5)] }).tokens as any;
    expect(t.primitive.font.sans.$value[0]).toBe("Inter");
    expect(t.primitive.font.mono.$value).toEqual(["Fira Code", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"]);
    expect(t.font.mono.$value.fontFamily).toBe("{primitive.font.mono}");
    expect(validateTokens(docFrom(t))).toEqual([]);
    expect(checkRoles(docFrom(t))).toEqual([]);
  });
  test("a generic monospace gives a mono role in the system's own fonts; an app without code text gets none (backlog)", () => {
    const t = buildDraft({ ...occ, fontFamily: [s("monospace", 13), s("Thmanyah Sans", 5)] }).tokens as any;
    expect(t.primitive.font.mono.$value[0]).toBe("ui-monospace");
    const plain = buildDraft(occ).tokens as any;
    expect(plain.font.mono).toBeUndefined();
    expect(plain.primitive.font.mono).toBeUndefined();
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

describe("code fonts (review of batch D)", () => {
  test("which families are code fonts", () => {
    const code = ["JetBrains Mono", "Fira Code", "Source Code Pro", "Cascadia Code", "SFMono-Regular", "ui-monospace", "monospace", "Menlo", "Consolas", "Courier New", "Monaspace Neon", "MonoLisa", "Iosevka", "Lucida Console", "Space Mono", "Noto Sans Mono", "'Fira Code', monospace"];
    const text = ["Code Pro", "Code Next", "Code 39", "Kimono", "Monoton", "Monotype Corsiva", "Libre Barcode 39", "Codec Pro", "Inter"];
    expect(code.filter((f) => !isMonospace(f))).toEqual([]);
    expect(text.filter((f) => isMonospace(f))).toEqual([]);
  });

  test("an app set all in a mono font keeps it as its brand font, and is told it's the mono role too", () => {
    const { tokens, report } = buildDraft({ ...occ, fontFamily: [s("Space Mono", 9)] }) as any;
    expect(tokens.primitive.font.sans.$value[0]).toBe("Space Mono");
    expect(tokens.primitive.font.mono.$value[0]).toBe("Space Mono");
    expect(report.notes.join("\n")).toContain("Space Mono");
  });
});

describe("buildDraft: surfaces and borders (backlog 85, HiSalon)", () => {
  test("a surface sits close to the page: a mid-grey used for dots isn't one", () => {
    const page: Sample = { value: "#FFFFFF", count: 10, contexts: { background: 10, page: 1 }, examples: [] };
    const t = (colors: Sample[]) => buildDraft({ ...occ, colors: [page, s("#111827", 9, "text"), ...colors] }).report;
    const hexOf = (r: ReturnType<typeof t>, role: string) => (r.colors as any[]).find((c) => c.id === r.roles[role])?.hex;
    const dots = t([s("#939599", 5, "background")]);
    expect(hexOf(dots, "color.surface")).toBe("#FFFFFF");
    // A hover or pressed fill (1.27:1 on white) is a step too far for a card; the presets' surfaces are within 1.1:1.
    const hover = t([s("#E3E4E8", 5, "background")]);
    expect(hexOf(hover, "color.surface")).toBe("#FFFFFF");
    const cards = t([s("#939599", 5, "background"), s("#F3F4F6", 2, "background")]);
    expect(hexOf(cards, "color.surface")).toBe("#F3F4F6");
  });

  test("a surface is tinted no more than the page: an error badge's pale red isn't one", () => {
    const page: Sample = { value: "#F7F8FA", count: 10, contexts: { background: 10, page: 1 }, examples: [] };
    const r = buildDraft({ ...occ, colors: [page, s("#111827", 9, "text"), s("#FDE8E8", 6, "background")] }).report;
    expect((r.colors as any[]).find((c) => c.id === r.roles["color.surface"])?.hex).toBe("#F7F8FA");
  });

  test("a cream card on a white page is a surface: a warm paper tone isn't a badge's tint", () => {
    const page: Sample = { value: "#FFFFFF", count: 10, contexts: { background: 10, page: 1 }, examples: [] };
    for (const cream of ["#FDF6E3", "#F5F0E6"]) {
      const r = buildDraft({ ...occ, colors: [page, s("#111827", 9, "text"), s(cream, 6, "background")] }).report;
      expect((r.colors as any[]).find((c) => c.id === r.roles["color.surface"])?.hex).toBe(cream);
    }
    // A pale green or blue fill is still a status tint, not a card.
    const r = buildDraft({ ...occ, colors: [page, s("#111827", 9, "text"), s("#F0FDF4", 6, "background")] }).report;
    expect((r.colors as any[]).find((c) => c.id === r.roles["color.surface"])?.hex).toBe("#FFFFFF");
  });

  test("a surface isn't the colour of the lines around it", () => {
    const page: Sample = { value: "#FFFFFF", count: 10, contexts: { background: 10, page: 1 }, examples: [] };
    const line: Sample = { value: "#E9EBEE", count: 11, contexts: { background: 5, border: 6 }, examples: [] };
    const r = buildDraft({ ...occ, colors: [page, s("#111827", 9, "text"), line] }).report;
    const hexOf = (role: string) => (r.colors as any[]).find((c) => c.id === r.roles[role])?.hex;
    expect([hexOf("color.surface"), hexOf("color.border")]).toEqual(["#FFFFFF", "#E9EBEE"]);
  });

  test("a border prefers a neutral line over an accent ring", () => {
    const r = buildDraft({ ...occ, colors: [...occ.colors, s("#7EEBC1", 5, "border")] }).report;
    expect((r.colors as any[]).find((c) => c.id === r.roles["color.border"])?.hex).toBe("#E5E7EB");
  });
});

describe("buildDraft with design variants", () => {
  const css = [
    ":root { --accent: #c2410c; --bg: #ffffff; --text: #111111 }",
    '[data-variant="men"] { --accent: #0e5c4d; --bg: #f1f5f4 }',
    '[data-variant="men"].dark { --accent: #5cc9b3 }',
    "body { background: var(--bg); color: var(--text) } button { background: var(--accent) }",
  ].join("\n");
  const found = collectOccurrences([{ path: "a.css", abs: "", lang: "css", text: css }], null, () => false, () => true);

  test("collects a variant's values on the variable, apart from the default's", () => {
    expect(found.variables!.find((v) => v.name === "--accent")).toEqual({ name: "--accent", light: "#c2410c", variants: { men: { light: "#0e5c4d", dark: "#5cc9b3" } } });
    expect(values(found.colors)).not.toContain("#0e5c4d");
  });

  test("the draft declares the variants and stays a valid guide", () => {
    const { tokens } = buildDraft(found);
    const t = tokens as any;
    expect(t.$extensions["dev.motif"].variants).toEqual([{ id: "default", label: "Default", default: true }, { id: "men", label: "Men" }]);
    expect(Object.keys(t.color["action-primary"].$extensions["dev.motif"].variants)).toEqual(["men"]);
    // Roles that follow another role follow it in the variant too.
    expect(t.color.focus.$extensions["dev.motif"].variants.men).toEqual(t.color["action-primary"].$extensions["dev.motif"].variants.men);
    const doc = docFrom(tokens);
    expect(validateTokens(doc)).toEqual([]);
    expect(checkRoles(doc)).toEqual([]);
  });

  test('a [data-variant="default"] block is the default, not a second variant called "default"', () => {
    const withDefault = css + '\n[data-variant="default"] { --accent: #b91c1c }';
    const occ2 = collectOccurrences([{ path: "a.css", abs: "", lang: "css", text: withDefault }], null, () => false, () => true);
    const { tokens } = buildDraft(occ2);
    const t = tokens as any;
    expect(t.$extensions["dev.motif"].variants).toEqual([{ id: "default", label: "Default", default: true }, { id: "men", label: "Men" }]);
    expect(Object.keys(t.color["action-primary"].$extensions["dev.motif"].variants)).toEqual(["men"]);
    expect(checkVariants(docFrom(tokens)).filter((f) => f.severity === "error")).toEqual([]);
  });

  test("without variant blocks nothing about variants is drafted", () => {
    const { tokens, report } = buildDraft(occ);
    expect(JSON.stringify(tokens)).not.toContain("variants");
    expect(report.designVariants).toBeUndefined();
  });
});

describe("the see-through note names only a see-through value (Task 15 wave B, #6c)", () => {
  // A web app whose --text-primary is solid navy, while its most used text colour is the same navy at 65%: the role takes the
  // variable's solid value, so no note says it came from a see-through colour.
  const occ: Occurrences = {
    colors: [
      { value: "#0a1733a6", count: 12, contexts: { text: 12 }, examples: [] },
      { value: "#0a1733", count: 3, contexts: { text: 3 }, examples: [] },
      { value: "#ffffff", count: 5, contexts: { background: 5, page: 1 }, examples: [] },
    ],
    space: [], radius: [], fontSize: [], fontFamily: [], duration: [], easing: [], unresolved: [],
    variables: [{ name: "--text-primary", light: "#0a1733" }, { name: "--background", light: "#ffffff" }],
    aliases: {},
    roleNames: ["--text-primary", "--background"],
    variableUses: { "--text-primary": { text: 3 }, "--background": { background: 1 } },
    followVariables: true,
  };
  test("a role named by a solid variable isn't noted as see-through", () => {
    const { report } = buildDraft(occ);
    expect(report.notes.join("\n")).not.toContain("text-primary comes from a see-through colour");
  });
  test("a role whose own value is see-through still is", () => {
    const { report } = buildDraft({ ...occ, variables: [{ name: "--background", light: "#ffffff" }], roleNames: ["--background"], variableUses: { "--background": { background: 1 } } });
    expect(report.notes.join("\n")).toContain("text-primary comes from a see-through colour (#0a1733a6): drafted as #60687A, how it shows over the background. Check it.");
  });
});

describe("a see-through role colour is drafted as it shows (v0.5.0 gate, Task 4)", () => {
  const none = { space: [], radius: [], fontSize: [], fontFamily: [], duration: [], easing: [], unresolved: [] };
  /** A see-through #RRGGBBAA colour laid over a solid #RRGGBB one, as #RRGGBB. */
  const over = (rgba: string, bg: string) => {
    const a = Number.parseInt(rgba.slice(7, 9), 16) / 255;
    const ch = (s: string, i: number) => Number.parseInt(s.slice(i, i + 2), 16);
    return `#${[1, 3, 5].map((i) => Math.round(a * ch(rgba, i) + (1 - a) * ch(bg, i)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  };
  const role = (tokens: any, name: string) => {
    const r = tokens.color[name];
    const hex = (ref: string) => tokens.primitive.color[ref.slice("{primitive.color.".length, -1)].$value.hex;
    const own = r.$extensions["dev.motif"].variants ?? {};
    return { light: hex(r.$value), dark: hex(r.$extensions["dev.motif"].modes.dark), men: own.men && [hex(own.men.value), hex(own.men.dark)] };
  };
  const valid = (tokens: Record<string, unknown>) => {
    const doc = docFrom(tokens);
    expect(validateTokens(doc)).toEqual([]);
    expect(checkRoles(doc)).toEqual([]);
    expect(checkContrastAll(doc).findings.filter((f) => f.code === "low-contrast" && /^color\.text-/.test(f.path ?? ""))).toEqual([]);
  };
  // HiSalon: its cards' outline is #0f3c32 at 8% (0x140F3C32), on an off-white page.
  const hisalon: Occurrences = {
    ...none,
    colors: [
      { value: "#0a1733", count: 10, contexts: { text: 10 }, examples: [] },
      { value: "#f7f9f8", count: 8, contexts: { background: 8, page: 1 }, examples: [] },
      { value: "#0f3c3214", count: 5, contexts: { border: 5 }, examples: [] },
    ],
  };

  test("HiSalon's hairline border is the light grey-green it shows as over the page, not its solid #0F3C32", () => {
    const { tokens, report } = buildDraft(hisalon);
    const border = role(tokens, "border");
    expect(border.light).toBe(over("#0f3c3214", "#F7F9F8"));
    expect(border.light).toBe("#E5EAE8");
    expect(border.dark).toBe(border.light);
    const notes = report.notes.join("\n");
    expect(notes).toContain("border comes from a see-through colour (#0f3c3214): drafted as #E5EAE8, how it shows over the background. Check it.");
    expect(notes).not.toContain("drafted as solid");
    valid(tokens);
  });

  test("the variable that sets it gives its dark and variant values, each over its own background", () => {
    const { tokens, report } = buildDraft({
      ...hisalon,
      variables: [
        { name: "--line", light: "#0f3c3214", dark: "#ffffff1f", variants: { men: { light: "#3d4b6e33", dark: "#ffffff33" } } },
        { name: "--page", light: "#f7f9f8", dark: "#0f1413", variants: { men: { light: "#ffffff", dark: "#000000" } } },
      ],
    });
    const border = role(tokens, "border");
    expect([border.light, border.dark]).toEqual([over("#0f3c3214", "#F7F9F8"), over("#ffffff1f", "#0F1413")]);
    expect(border.men).toEqual([over("#3d4b6e33", "#FFFFFF"), over("#ffffff33", "#000000")]);
    expect(report.notes.join("\n")).toContain(
      "border comes from --line, which is see-through (#0f3c3214): drafted as #E5EAE8, how it shows over the background (in dark mode and each variant, over theirs). Check it.",
    );
    expect(report.variables.find((v) => v.name === "--line")?.role).toBe("color.border");
    valid(tokens);
    expect(checkVariants(docFrom(tokens)).filter((f) => f.severity === "error")).toEqual([]);
  });

  test("a see-through colour that's the only text colour is drafted as it shows, and the draft still validates", () => {
    const only = (value: string): Occurrences => ({
      ...none,
      colors: [
        { value, count: 10, contexts: { text: 10 }, examples: [] },
        { value: "#ffffff", count: 8, contexts: { background: 8, page: 1 }, examples: [] },
      ],
    });
    // Navy at 65% reads on white as it shows (#60687A).
    const reads = buildDraft(only("#0a1733a6"));
    expect(role(reads.tokens, "text-primary").light).toBe(over("#0a1733a6", "#FFFFFF"));
    expect(role(reads.tokens, "text-secondary").light).toBe(over("#0a1733a6", "#FFFFFF"));
    valid(reads.tokens);
    // Navy at 25% shows as a pale grey that doesn't read: the text logic takes over, as for any colour that doesn't.
    const faint = buildDraft(only("#0a173340"));
    expect(role(faint.tokens, "text-primary").light).not.toBe("#0A1733");
    expect(faint.report.notes.join("\n")).toContain("#0a173340 was found for text but reads at");
    valid(faint.tokens);
  });

  test("a see-through background isn't laid over itself: it, and a surface that is it, stay its solid colour", () => {
    const { tokens, report } = buildDraft({
      ...none,
      colors: [
        { value: "#ffffff80", count: 8, contexts: { background: 8, page: 1 }, examples: [] },
        { value: "#111111", count: 10, contexts: { text: 10 }, examples: [] },
      ],
    });
    expect(role(tokens, "background").light).toBe("#FFFFFF");
    expect(role(tokens, "surface").light).toBe("#FFFFFF");
    expect(report.notes.join("\n")).toContain("background comes from a see-through colour (#ffffff80), drafted as solid #FFFFFF; check it.");
    valid(tokens);
  });
});

describe("drafted text always reads on the drafted fills (v0.5.0 sweep, Landmarks problem 7)", () => {
  /** The low-contrast findings for the text roles' pairs (and on-action-secondary, the main text on secondary buttons), in every mode. */
  const textProblems = (tokens: Record<string, unknown>) =>
    checkContrastAll(docFrom(tokens)).findings.filter((f) => f.code === "low-contrast" && /^color\.(text-(primary|secondary)|on-action-secondary)$/.test(f.path ?? ""));
  const none = { space: [], radius: [], fontSize: [], fontFamily: [], duration: [], easing: [], unresolved: [] };
  const hexOf = (tokens: any, role: string, mode: "light" | "dark") => {
    const ref = mode === "light" ? tokens.color[role].$value : tokens.color[role].$extensions["dev.motif"].modes.dark;
    return tokens.primitive.color[ref.slice("{primitive.color.".length, -1)].$value.hex;
  };
  // Landmarks: the views' only typed colour is .white, on photos; no background is found, so the page is the default.
  const landmarks: Occurrences = {
    ...none,
    colors: [{ value: "#ffffff", count: 8, contexts: { text: 8 }, examples: ["Landmarks/Views/CircleImage.swift:14"] }],
    source: "swift",
  };

  test("Landmarks: white text on a light page is the wrong way round, so both text roles keep their defaults", () => {
    const { tokens, report } = buildDraft(landmarks);
    expect(report.roles["color.text-primary"]).toBe("default");
    expect(report.roles["color.text-secondary"]).toBe("default");
    expect(textProblems(tokens)).toEqual([]);
    expect(checkContrastAll(docFrom(tokens)).findings).toEqual([]);
    const notes = report.notes.join("\n");
    expect(notes).toContain(
      "White (#ffffff) was found for text but reads at 1.04:1 on the background (#f9fafb), needs 4.5:1, so text-primary and text-secondary keep their defaults; check them.",
    );
    // A colour was found for text, so the draft doesn't say none was.
    expect(notes).not.toMatch(/No colour was found for [^.]*text-primary/);
  });

  test("Tailwind's near miss: #6b7280 on #f3f4f6 cards (4.39:1) is darkened, keeping its hue, not replaced", () => {
    const { tokens, report } = buildDraft(occ);
    const nudged = hexOf(tokens, "text-secondary", "light");
    expect(report.roles["color.text-secondary"]).toBe("found-4-darker");
    expect(nudged).not.toBe("#6B7280");
    expect(nudged).not.toBe("#4B5563");
    expect(textProblems(tokens)).toEqual([]);
    expect(report.notes.join("\n")).toContain(
      `Text colour #6b7280 (4.39:1 on the surface, needs 4.5:1) was darkened to ${nudged.toLowerCase()} so it reads on every background; check it.`,
    );
  });

  test("a found text colour that reads on the page but not quite on the cards is darkened", () => {
    // Mid-grey text reads on the white page (4.54:1) but not on the near-white cards (3.98:1).
    const r = buildDraft({
      ...none,
      colors: [
        { value: "#ffffff", count: 9, contexts: { background: 9, page: 1 }, examples: [] },
        { value: "#767676", count: 6, contexts: { text: 6 }, examples: [] },
        { value: "#f0f0f0", count: 4, contexts: { background: 4 }, examples: [] },
      ],
    });
    expect(r.report.roles["color.surface"]).toBe("found-3");
    expect(r.report.roles["color.text-primary"]).toBe("found-2-darker");
    expect(r.report.notes.join("\n")).toMatch(/Text colour #767676 \(3\.98:1 on the surface, needs 4\.5:1\) was darkened to #[0-9a-f]{6} so it reads on every background; check it\./);
    // Both text roles took that colour; the note says it once.
    expect(r.report.notes.filter((n) => n.startsWith("Text colour #767676"))).toHaveLength(1);
    expect(textProblems(r.tokens)).toEqual([]);
  });

  test("a found text colour whose dark value fails the dark page keeps its light value; only the dark one is drafted", () => {
    const r = buildDraft({
      ...none,
      colors: [
        { value: "#111827", count: 10, contexts: { text: 10 }, examples: [] },
        { value: "#ffffff", count: 8, contexts: { background: 8, page: 1 }, examples: [] },
      ],
      variables: [{ name: "--ink", light: "#111827", dark: "#1f2937" }, { name: "--page", light: "#ffffff", dark: "#030712" }],
    });
    expect(r.report.roles["color.text-primary"]).toBe("found-1");
    expect(hexOf(r.tokens, "text-primary", "light")).toBe("#111827");
    expect(hexOf(r.tokens, "text-primary", "dark")).toBe("#FFFFFF");
    // The drafted dark value isn't one the app's CSS gave.
    expect(r.report.notes[0]).toBe("Dark-mode colours came from your CSS for background, surface; the others were copied from light mode. Review them before turning on dark mode.");
    expect(r.report.notes.join("\n")).toContain(
      "In dark mode, text-primary (#1f2937) reads at 1.37:1 on the background (#030712), needs 4.5:1, so its dark value is drafted as #ffffff; check it.",
    );
    expect(textProblems(r.tokens)).toEqual([]);
  });

  test("a found text colour set aside in light mode keeps its own dark value when that reads (re-review of the fix round)", () => {
    const r = buildDraft({
      ...none,
      colors: [
        { value: "#9a9a9a", count: 10, contexts: { text: 10 }, examples: [] },
        { value: "#fff8ec", count: 8, contexts: { background: 8, page: 1 }, examples: [] },
      ],
      variables: [{ name: "--text", light: "#9a9a9a", dark: "#e5e5e5" }, { name: "--page", light: "#fff8ec", dark: "#101010" }],
    });
    // Light: #9a9a9a doesn't read and is too far to nudge, so the default; dark: the app's own #e5e5e5 reads, so it stays.
    expect(hexOf(r.tokens, "text-primary", "light")).toBe("#111827");
    expect(hexOf(r.tokens, "text-primary", "dark")).toBe("#E5E5E5");
    expect(r.report.notes.join("\n")).not.toContain("In dark mode, text-primary");
    expect(textProblems(r.tokens)).toEqual([]);
  });

  test("a dark page found with text that has no dark value: the text's dark values are drafted from the dark page", () => {
    const r = buildDraft({
      ...none,
      colors: [
        { value: "#222222", count: 10, contexts: { text: 10 }, examples: [] },
        { value: "#ffffff", count: 8, contexts: { background: 8, page: 1 }, examples: [] },
      ],
      variables: [{ name: "--page", light: "#ffffff", dark: "#030712" }],
    });
    expect(hexOf(r.tokens, "text-primary", "light")).toBe("#222222");
    expect(hexOf(r.tokens, "text-primary", "dark")).toBe("#FFFFFF");
    // Secondary text takes a light grey, so it still differs from the primary.
    expect(hexOf(r.tokens, "text-secondary", "dark")).toBe("#D1D5DB");
    expect(r.report.notes.join("\n")).toContain("In dark mode, text-primary (#222222) reads at");
    expect(textProblems(r.tokens)).toEqual([]);
  });

  test("no text found on a dark page: the default ink is set aside for white, and a light grey for secondary text", () => {
    const r = buildDraft({ ...none, colors: [{ value: "#1e1e2e", count: 8, contexts: { background: 8, page: 1 }, examples: [] }] });
    expect(hexOf(r.tokens, "text-primary", "light")).toBe("#FFFFFF");
    expect(hexOf(r.tokens, "text-secondary", "light")).toBe("#D1D5DB");
    const notes = r.report.notes.join("\n");
    expect(notes).toContain("No text colour was found, and the default for text-primary (#111827) reads at 1.");
    expect(notes).not.toMatch(/No colour was found for [^.]*text-primary/);
    expect(textProblems(r.tokens)).toEqual([]);
  });

  test("when nothing reads on both a dark page and light cards, text is drafted for the page and the note names the cards", () => {
    const r = buildDraft({
      ...none,
      colors: [
        { value: "#111111", count: 9, contexts: { background: 9, page: 1 }, examples: [] },
        { value: "#f5f5f5", count: 4, contexts: { background: 4 }, examples: [] },
      ],
      variables: [{ name: "--background", light: "#111111" }, { name: "--surface", light: "#f5f5f5" }],
      roleNames: ["--background", "--surface"],
      variableUses: { "--background": { background: 1 }, "--surface": { background: 1 } },
      followVariables: true,
    });
    expect(r.report.roles["color.surface"]).not.toBe(r.report.roles["color.background"]);
    expect(hexOf(r.tokens, "text-primary", "light")).toBe("#FFFFFF");
    expect(r.report.notes.join("\n")).toContain("nothing reads on both it and the surface (#f5f5f5)");
    expect(textProblems(r.tokens).filter((f) => f.message.includes('on "background"'))).toEqual([]);
  });

  test("a found text colour that passes keeps it, and no note sets it aside", () => {
    // The shared fixture, with secondary text that reads on its grey cards (#4b5563 rather than #6b7280).
    const passing: Occurrences = { ...occ, colors: occ.colors.map((c) => (c.value === "#6B7280" ? { ...c, value: "#4B5563" } : c)) };
    const { tokens, report } = buildDraft(passing);
    expect(report.roles["color.text-primary"]).toBe("found-1");
    expect(report.roles["color.text-secondary"]).toBe("found-4");
    expect((tokens as any).primitive.color["found-1"].$value.hex).toBe("#111827");
    expect(textProblems(tokens)).toEqual([]);
    expect(report.notes.join("\n")).not.toMatch(/was found for text but|Text colour|In dark mode, text-/);
  });
});

describe("drafts whose found text passes stay byte-identical (v0.5.0 sweep, Task 2; snapshots taken at c829bb6^)", () => {
  afterAll(cleanupTempDirs);
  for (const fixture of ["flutter-palettes", "rn-palettes"]) {
    test(`${fixture}: the whole draft and report`, async () => {
      const root = tempDir("motif-draft-snapshot-");
      cpSync(join(FIXTURES, fixture), root, { recursive: true });
      expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
      expect(readFileSync(join(root, "design/tokens.draft.json"), "utf8")).toMatchSnapshot();
      expect(readFileSync(join(root, "design/extract-report.json"), "utf8")).toMatchSnapshot();
    });
  }
});

describe("the small type roles come from the small sizes the app uses most (HiSalon, v0.5.0 sweep problem 6)", () => {
  const sizes = (fontSize: Sample[]) => {
    const t = buildDraft({ ...occ, fontSize }).tokens as any;
    return Object.fromEntries(["caption", "label", "body", "heading", "title", "display"].map((r) => [r, t.font[r].$value.fontSize.value]));
  };
  // HiSalon's text sizes and how often each is used: 12px (22 uses) and 13px (42) are its small text; 10px is used once.
  const HISALON = [
    s("13px", 42), s("14px", 30), s("12px", 22), s("15px", 12), s("16px", 12), s("18px", 12), s("11px", 11), s("26px", 8), s("22px", 6),
    s("30px", 3), s("17px", 2), s("36px", 2), s("10px", 1), s("20px", 1), s("28px", 1), s("34px", 1),
  ];

  test("a size used once doesn't become the caption while a smaller size is used far more", () => {
    expect(sizes(HISALON)).toEqual({ caption: 12, label: 13, body: 14, heading: 15, title: 16, display: 36 });
  });

  test("small sizes used equally often keep the smallest as caption and the largest as label", () => {
    expect(sizes([s("16px", 10), s("10px", 2), s("11px", 2), s("12px", 2), s("13px", 2)])).toMatchObject({ caption: 10, label: 13, body: 16 });
  });

  test("one or two small sizes are the caption and label, however often each is used", () => {
    expect(sizes([s("16px", 10), s("14px", 9), s("11px", 1)])).toMatchObject({ caption: 11, label: 14 });
    expect(sizes([s("16px", 10), s("12px", 1)])).toMatchObject({ caption: 12, label: 14 });
  });
});

describe("Tailwind's text-2xl and text-3xl are sizes from the theme, not 2px and 3px (found with problem 6)", () => {
  const app: SourceFile = { path: "src/App.tsx", abs: "", lang: "script", text: '<h1 className="text-2xl" /><h2 className="text-3xl" /><p className="text-sm" />' };
  test("with Tailwind's sizes, they resolve", () => {
    const occ = collectOccurrences([app], { ...tw, textPx: new Map([["sm", 14], ["2xl", 24], ["3xl", 30]]) });
    expect(values(occ.fontSize).sort()).toEqual(["14px", "24px", "30px"]);
  });
  test("without them, they're unresolved, as text-sm is", () => {
    expect(values(collectOccurrences([app], null).unresolved).sort()).toEqual(["text-2xl", "text-3xl", "text-sm"]);
  });
});

describe("Task 5 fix round 1: type and corner sizes", () => {
  const sizes = (fontSize: Sample[]) => {
    const t = buildDraft({ ...occ, fontSize }).tokens as any;
    return Object.fromEntries(["caption", "label", "body"].map((r) => [r, t.font[r].$value.fontSize.value]));
  };
  test("caption and label less than 5% apart: the more used one stays, with the next most used size at least 5% from it (HiSalon's Flutter admin, 3.7%)", () => {
    const ADMIN = [
      s("13px", 29), s("13.5px", 14), s("12px", 4), s("22px", 4), s("14.5px", 3), s("15px", 2), s("17px", 2), s("18px", 2), s("10px", 1), s("12.5px", 1),
      s("19px", 1), s("20px", 1), s("26px", 1), s("28px", 1),
    ];
    expect(sizes(ADMIN)).toEqual({ caption: 12, label: 13, body: 14.5 });
  });
  test("fix round 2: two sizes 5% or more apart are both kept (ataaflow's 11.2px and 12px, 6.7% apart)", () => {
    const ATAAFLOW = [
      s("12px", 50), s("11.2px", 38), s("12.8px", 31), s("14.4px", 23), s("10.4px", 17), s("16px", 16), s("14px", 13), s("13.6px", 12), s("13px", 10),
      s("17.6px", 10), s("15.2px", 9), s("11px", 7), s("10px", 3), s("8px", 1),
    ];
    expect(sizes(ATAAFLOW)).toEqual({ caption: 11.2, label: 12, body: 14.4 });
  });
  test("with no size 5% away, the close pair stays", () => {
    expect(sizes([s("16px", 10), s("13px", 9), s("13.5px", 8), s("12.6px", 1)])).toEqual({ caption: 13, label: 13.5, body: 16 });
  });
  const app: SourceFile = { path: "src/App.tsx", abs: "", lang: "script", text: '<div className="rounded-xl" /><div className="rounded-2xl" /><div className="rounded-3xl" />' };
  test("rounded-2xl and rounded-3xl are Tailwind's radii, not 2px and 3px corners", () => {
    const o = collectOccurrences([app], { ...tw, radiusPx: new Map([["md", 6], ["xl", 12], ["2xl", 16], ["3xl", 24]]) });
    expect(values(o.radius).sort()).toEqual(["12px", "16px", "24px"]);
    expect(values(collectOccurrences([app], null).unresolved).sort()).toEqual(["rounded-2xl", "rounded-3xl", "rounded-xl"]);
  });
});

describe("final fix wave: draft rules", () => {
  test("two small sizes less than 5% apart are one: the more used is kept, and the other role takes its default", () => {
    const t = buildDraft({ ...occ, fontSize: [s("16px", 10), s("13px", 9), s("13.5px", 4)] }).tokens as any;
    expect(["caption", "label"].map((r) => t.font[r].$value.fontSize.value)).toEqual([13, 14]);
    const apart = buildDraft({ ...occ, fontSize: [s("16px", 10), s("12px", 9), s("14px", 4)] }).tokens as any;
    expect(["caption", "label"].map((r) => apart.font[r].$value.fontSize.value)).toEqual([12, 14]);
  });

  test("with no dark colours from the app, a light pair nothing can fix gets no dark-mode note, and the draft stays valid", () => {
    // A mid-grey page (#777777): neither ink nor white reads on it at 4.5:1, and dark mode is light's copy.
    const { tokens, report } = buildDraft({ ...occ, colors: [s("#777777", 9, "background")] });
    const notes = report.notes.join("\n");
    expect(notes).toContain("so text-primary is drafted as #ffffff for the background, though nothing reads on both it and the surface (#777777)");
    expect(notes).not.toContain("In dark mode");
    expect(validateTokens(docFrom(tokens))).toEqual([]);
  });
});
