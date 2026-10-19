import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runValidate } from "../src/commands/validate";
import { loadTokenDocument } from "../src/contract/load";
import { motifCss } from "../src/generate/motif-css";
import { buildThemeSet } from "../src/generate/theme";

const APP = join(import.meta.dir, "../../tests/fixtures/react-contract-app");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8").replace(/\r\n/g, "\n");

describe("the contract app (Larder)", () => {
  test("its design guide is valid, without a single warning", async () => {
    const r = await runValidate(APP);
    expect(r.exitCode).toBe(0);
    expect(r.data.summary).toMatchObject({ errors: 0, warnings: 0 });
  });

  test("its code follows the design guide: no violations, exceptions or warnings", async () => {
    const r = await runCheck(APP, { positionals: [] });
    expect(r.data.summary).toMatchObject({ violations: 0, exceptions: 0, warnings: 0 });
    expect(r.exitCode).toBe(0);
  });

  test("it's wired the way the React web guide says", () => {
    expect(read("src/app/globals.css").trim()).toBe('@import "tailwindcss";\n@import "../styles/motif.tailwind.css";');
    const layout = read("src/app/layout.tsx");
    for (const s of ['import "@fontsource/dm-sans/400.css";', 'import "@fontsource/dm-sans/500.css";', 'import "@fontsource/fraunces/600.css";', 'import "@fontsource/fraunces/700.css";', "<Providers>", '<html lang="en" suppressHydrationWarning>']) {
      expect(layout).toContain(s);
    }
    expect(layout).not.toContain("next/font");
    expect(read("src/app/providers.tsx")).toContain('<MotionConfig reducedMotion="user">');
  });

  test("the design guide was made from the Warm style and keeps its history", () => {
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(tokens.primitive.font.display.$value[0]).toBe("Fraunces");
    const guide = read("DESIGN.md");
    expect(guide).toContain("name: Larder");
    expect(guide).toMatch(/^## 10\. Change log\n\n- \d{4}-\d{2}-\d{2} — .+ — .+ — approved by .+$/m);
  });

  test("dependencies, build output and drafts stay out of git", () => {
    const ignore = read(".gitignore");
    for (const s of ["/node_modules", "/.next/"]) expect(ignore).toContain(s);
    expect(read("design/.gitignore")).toContain(".progress.json");
    expect(existsSync(join(APP, "package-lock.json"))).toBe(true);
  });
});

describe("the contract app's variants", () => {
  test("it has a default look and a partner store's, both readable in light and dark", async () => {
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(tokens.$extensions["dev.motif"].variants.map((v: { id: string }) => v.id)).toEqual(["default", "partner"]);
    const r = await runValidate(APP);
    expect(r.exitCode).toBe(0);
    expect(r.data.summary).toMatchObject({ errors: 0, warnings: 0, contrastChecks: tokens.$extensions["dev.motif"].pairs.length * 4 });
    expect(read("DESIGN.md")).toMatch(/^## Variants$/m);
  });

  test("its default look is unchanged: without the partner blocks, its motif.css is the one from before variants", () => {
    const { doc } = loadTokenDocument("design/tokens.json", read("design/tokens.json"));
    const set = buildThemeSet(doc!);
    const css = motifCss(set.base, set.variants);
    expect(css).toBe(read("src/styles/motif.css"));
    const withoutPartner = css.split("\n\n").filter((rule) => !rule.includes('data-variant="partner"')).join("\n\n");
    // The SHA-256 of tests/fixtures/react-contract-app/src/styles/motif.css at 1284b15, before Larder had variants.
    expect(createHash("sha256").update(withoutPartner).digest("hex")).toBe("2eac359c5ce32e444d598e36705aa8755d1b6d2d289f624a9d322170afeb4d3c");
  });

  test("its generated styles carry the partner variant, and a switch on Home chooses it", async () => {
    expect(read("src/styles/motif.css")).toContain(':root[data-variant="partner"]');
    const r = await runCheck(APP, { positionals: [] });
    expect(r.data.summary).toMatchObject({ violations: 0, exceptions: 0, warnings: 0 });
    expect(read("src/components/VariantSwitch.tsx")).toContain("dataset.variant");
    expect(read("src/app/page.tsx")).toContain("<VariantSwitch");
  });
});

const STARTER_SET = [
  "Button", "IconButton", "Input", "Textarea", "Select", "Checkbox", "Switch", "Card", "ListItem", "TopBar",
  "TabBar", "Sidebar", "Sheet", "Dialog", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge",
];

describe("the contract app's components", () => {
  test("it has the React web guide's starter set, one file each", () => {
    for (const name of STARTER_SET) expect(read(`src/components/${name}.tsx`)).toMatch(new RegExp(`export function ${name}\\b`));
  });

  test("everything interactive shows focus, and states are announced", () => {
    for (const name of ["Button", "IconButton", "Input", "Textarea", "Select", "Checkbox", "Switch", "Card", "ListItem", "TopBar", "TabBar", "Sidebar"]) {
      expect(read(`src/components/${name}.tsx`)).toContain("focus-visible:outline-focus");
    }
    expect(read("src/components/Button.tsx")).toContain("aria-busy");
    expect(read("src/components/Input.tsx")).toContain("aria-invalid");
    expect(read("src/components/IconButton.tsx")).toContain("aria-label={label}");
    expect(read("src/components/Toast.tsx")).toContain('aria-live="polite"');
    expect(read("src/components/TabBar.tsx")).toContain('aria-current={');
  });

  test("a toast's action is readable on every tone: its own button in the toast's text colour", () => {
    const toast = read("src/components/Toast.tsx");
    expect(toast).not.toContain("<Button");
    expect(toast).toMatch(/<button[^>]*className="[^"]*text-current[^"]*min-h-12|<button[^>]*className="[^"]*min-h-12[^"]*text-current/);
    expect(toast).toContain("focus-visible:outline-focus");
  });

  test("a switch's whole row is its tap target", () => {
    const sw = read("src/components/Switch.tsx");
    expect(sw).toMatch(/<label htmlFor=\{id\} className="flex min-h-12/);
  });

  test("motion comes from the design guide's roles", () => {
    expect(read("src/components/Button.tsx")).toContain("spring.snappy");
    expect(read("src/components/Sheet.tsx")).toContain("spring.smooth");
  });
});

describe("the contract app's screens", () => {
  test("Home, Products and a product, with their loading, empty and not-found states", () => {
    for (const file of ["src/app/page.tsx", "src/app/products/page.tsx", "src/app/products/loading.tsx", "src/app/products/[id]/page.tsx", "src/app/products/[id]/not-found.tsx"]) {
      expect(existsSync(join(APP, file))).toBe(true);
    }
    expect(read("src/app/products/page.tsx")).toContain("<EmptyState");
    expect(read("src/app/products/loading.tsx")).toContain("<Skeleton");
    expect(read("src/app/products/[id]/page.tsx")).toContain("notFound()");
    expect(read("src/app/products/[id]/page.tsx")).toContain('backHref="/products"');
  });

  test("one primary action per screen", () => {
    for (const file of ["src/app/page.tsx", "src/app/products/[id]/page.tsx"]) {
      const buttons = read(file).match(/<Button(?![^>]*variant=)/g) ?? [];
      expect(buttons).toHaveLength(1);
    }
  });

  test("all mock data comes from one file", () => {
    const data = read("src/mock-data.ts");
    for (const s of ["export const products", "export const orders", "export const user", "export function formatPrice"]) expect(data).toContain(s);
  });

  test("the shell has the tab bar on phones and the sidebar on desktop", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("<TabBar />");
    expect(layout).toContain("<Sidebar />");
  });
});

describe("the contract app keeps its design guide's promises (backlog)", () => {
  test("sheets and dialogs move with spring.smooth and leave with duration.fast and easing.exit; a sheet can be described", () => {
    for (const f of ["src/components/Sheet.tsx", "src/components/Dialog.tsx"]) {
      const s = read(f);
      expect(s).toContain("AnimatePresence");
      expect(s).toContain("spring.smooth");
      expect(s).toContain("transition: { duration: duration.fast, ease: easing.exit }");
    }
    expect(read("src/components/Sheet.tsx")).toContain("RadixDialog.Description");
    for (const f of ["src/components/Sheet.tsx", "src/components/Dialog.tsx"]) expect(read(f)).toContain('{ "aria-describedby": undefined }');
  });

  test("rows can be selected and pressed, and link cards pressed, with spring.snappy", () => {
    const row = read("src/components/ListItem.tsx");
    expect(row).toContain("aria-current");
    for (const f of ["src/components/ListItem.tsx", "src/components/Card.tsx"]) {
      expect(read(f)).toContain("whileTap={{ scale: 0.97 }}");
      expect(read(f)).toContain("spring.snappy");
    }
  });

  test("the top bar lines up with the page, and the sidebar's name sits below the screen's title", () => {
    expect(read("src/components/TopBar.tsx")).toContain("md:px-8");
    expect(read("src/components/Sidebar.tsx")).not.toContain("font-title");
  });

  test("prices read naturally, components that use hooks are client components, and the tab bar's safe-area padding works", () => {
    expect(read("src/mock-data.ts")).not.toMatch(/unit: "\d+"/);
    const components = readdirSync(join(APP, "src/components")).filter((f) => f.endsWith(".tsx"));
    const hooked = components.filter((f) => /\buse[A-Z]\w*\(/.test(read(`src/components/${f}`)) && !read(`src/components/${f}`).startsWith('"use client";'));
    expect(hooked).toEqual([]);
    expect(read("src/app/layout.tsx")).toContain('viewportFit: "cover"');
  });
});
