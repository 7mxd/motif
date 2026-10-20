import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildDraft } from "../src/extract/draft";
import { COMPOSE } from "../src/stacks/compose";
import { collectCompose } from "../src/stacks/compose/extract";
import type { AppInfo } from "../src/detect/stacks";
import { FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const app = { path: ".", stack: "compose" } as AppInfo;
const collect = (root: string) => collectCompose(COMPOSE.sourceFiles!(root, app, {}));
const values = (samples: { value: string }[]) => samples.map((s) => s.value);
const hexOf = (tokens: any, alias: string) => tokens.primitive.color[alias.slice("{primitive.color.".length, -1)].$value.hex;

describe("collectCompose on the template's colours and a partner pair", () => {
  const occ = collect(join(FIXTURES, "compose-palettes"));
  const { tokens, report } = buildDraft(occ);
  const t = tokens as any;

  test("colour constants are variables, named in kebab case", () => {
    const v = occ.variables!.find((x) => x.name === "--purple-80");
    expect(v).toEqual({ name: "--purple-80", light: "#d0bcff" });
    expect(occ.variables!.map((x) => x.name)).toContain("--purple-grey-40");
  });

  test("the draft declares the default and the partner variant", () => {
    expect(report.designVariants).toEqual([{ id: "default", label: "Default" }, { id: "partner", label: "Partner" }]);
    expect(t.$extensions["dev.motif"].variants).toEqual([{ id: "default", label: "Default", default: true }, { id: "partner", label: "Partner" }]);
  });

  test("action-primary has the light, dark and partner values, followed through constants", () => {
    const role = t.color["action-primary"];
    expect(hexOf(t, role.$value)).toBe("#6650A4");
    expect(hexOf(t, role.$extensions["dev.motif"].modes.dark)).toBe("#D0BCFF");
    const own = role.$extensions["dev.motif"].variants.partner;
    expect([hexOf(t, own.value), hexOf(t, own.dark)]).toEqual(["#0F766E", "#5EEAD4"]);
    expect(report.variables.find((v) => v.name === "--action-primary")).toMatchObject({
      light: "#6650a4",
      dark: "#d0bcff",
      role: "color.action-primary",
      variants: { partner: { light: "#0f766e", dark: "#5eead4" } },
    });
  });

  test("widgets give spacing, radius, motion and type samples", () => {
    expect(values(occ.space)).toContain("13px");
    expect(values(occ.duration)).toContain("250ms");
    expect(values(occ.radius)).toContain("12px");
    expect(values(occ.easing)).toContain("cubic-bezier(0.4, 0, 0.2, 1)");
    expect(values(occ.fontSize)).toEqual(expect.arrayContaining(["22px", "16px"]));
    expect(values(occ.fontFamily)).toContain("Inter");
    expect(occ.typeRoles!.roles.heading).toEqual({ size: 22, weight: 600, lineHeight: 1.27 });
    expect(occ.followVariables).toBe(true);
  });
});

describe("collectCompose on the template alone", () => {
  const COLOR = `package a.b.ui.theme\nimport androidx.compose.ui.graphics.Color\nval Purple80 = Color(0xFFD0BCFF)\nval Purple40 = Color(0xFF6650a4)\n`;
  const THEME = `package a.b.ui.theme\nprivate val DarkColorScheme = darkColorScheme(primary = Purple80)\nprivate val LightColorScheme = lightColorScheme(primary = Purple40)\n`;
  const root = makeProject({ "app/src/main/java/a/b/ui/theme/Color.kt": COLOR, "app/src/main/java/a/b/ui/theme/Theme.kt": THEME });
  const occ = collect(root);

  test("two schemes are the default pair, with no variants block", () => {
    const { tokens, report } = buildDraft(occ);
    expect(report.designVariants).toBeUndefined();
    expect((tokens as any).$extensions["dev.motif"].variants).toBeUndefined();
    expect(report.variables.find((v) => v.name === "--action-primary")).toMatchObject({ light: "#6650a4", dark: "#d0bcff" });
  });
});

describe("collectCompose on a custom colour class", () => {
  test("instances named Light and Dark fill a class's fields", () => {
    const src = [
      "package a",
      "data class AppColors(val brand: Color, val onBrand: Color, val gap: Int)",
      "val LightAppColors = AppColors(brand = Color(0xFF123456), onBrand = Color.White, gap = 1)",
      "val DarkAppColors = AppColors(Color(0xFF654321), Color.Black, 2)",
    ].join("\n");
    const root = makeProject({ "app/src/main/java/a/Colors.kt": src });
    const v = collect(root).variables!.find((x) => x.name === "--brand");
    expect(v).toEqual({ name: "--brand", light: "#123456", dark: "#654321" });
  });
});
