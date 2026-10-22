import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, posix, relative, resolve, sep } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { waitForStop } from "../cleanup";
import { BROWSER_OFF, browserOff, findBrowser, type BrowserInfo } from "../detect/browser";
import { formatFindings, type Finding } from "../findings";
import type { Theme, ThemeSet } from "../generate/theme";
import { themeFonts } from "../generate/theme-fonts";
import { openUrl } from "../preview/open";
import { EMBEDDED_PRESETS, presetTheme } from "../preview/presets";
import { CASELESS, renderPngs, type RenderTarget } from "../preview/render";
import { startPreviewServer } from "../preview/server";
import { loadThemeFile } from "../preview/theme-file";
import { TOKENS_JSON } from "./validate";
import { ONE_PALETTE_NOTE, variantRefusal } from "./variant-flag";

export interface PreviewDeps {
  findBrowser: () => BrowserInfo | null;
  render: typeof renderPngs;
  openUrl: (url: string) => Promise<boolean>;
  waitForStop: () => Promise<void>;
  /** True when MOTIF_BROWSER=none turns the browser off. */
  browserOff?: () => boolean;
}

const defaultDeps: PreviewDeps = {
  findBrowser: () => findBrowser(),
  render: renderPngs,
  openUrl,
  // Ctrl+C ends a live preview normally (exit 0), after the server stops.
  waitForStop,
  browserOff: () => browserOff(),
};

const PRESET_IDS = EMBEDDED_PRESETS.map((p) => p.id);
const INSTALL_HINT = '"motif browser install" downloads a private headless copy (about 120 MB to download, about 300 MB on disk) that only Motif uses.';

const fail = (exitCode: 1 | 2, text: string, data: Record<string, unknown>): CommandResult => ({ command: "preview", exitCode, text, data });
const projectPath = (cwd: string, abs: string) => relative(cwd, abs).split(sep).join("/");
const urlPath = (rel: string) => "/" + rel.split("/").map(encodeURIComponent).join("/");
const isHtml = (name: string) => name.toLowerCase().endsWith(".html");
/** The theme fonts a mockup should show (system fonts are always there). */
/** The fonts a preview checks: every theme font except the system's own, and which of them are only companions. */
const fontsOf = (t: Theme | null) => {
  const fonts = t ? themeFonts(t).filter((f) => f.source !== "system") : [];
  return { fonts: fonts.map((f) => f.family), companions: fonts.filter((f) => f.companion).map((f) => f.family) };
};

/** The mockups named on the command line (files or folders of .html files), as project paths. */
function collectFiles(cwd: string, args: string[]): { files: string[] } | { error: string } {
  const files: string[] = [];
  for (const arg of args) {
    const abs = resolve(cwd, arg);
    const rel = relative(cwd, abs);
    if (rel.split(sep)[0] === ".." || isAbsolute(rel)) {
      return { error: `${arg} is outside this folder. Previews only serve files inside the project (use --cwd to preview another one).` };
    }
    if (!existsSync(abs)) return { error: `Couldn't find ${arg}.` };
    if (statSync(abs).isDirectory()) {
      const pages = readdirSync(abs).filter(isHtml).sort();
      if (pages.length === 0) return { error: `${arg} has no .html mockups.` };
      files.push(...pages.map((p) => projectPath(cwd, join(abs, p))));
    } else if (!isHtml(abs)) {
      return { error: `${arg} isn't an .html mockup.` };
    } else {
      files.push(projectPath(cwd, abs));
    }
  }
  return { files: [...new Set(files)] };
}

/** The tokens.json beside a mockup that makes it a design direction (the design guide's own file doesn't count). */
function directionTokens(cwd: string, file: string): string | null {
  const rel = posix.join(posix.dirname(file), "tokens.json");
  return rel !== TOKENS_JSON && existsSync(join(cwd, rel)) ? rel : null;
}

/** The other directions beside a direction (each folder next to its own with a tokens.json), as their tokens.json paths. */
function siblingDirections(cwd: string, rel: string): string[] {
  const parent = posix.dirname(posix.dirname(rel));
  let names: string[] = [];
  try {
    names = readdirSync(join(cwd, parent)).sort();
  } catch {
    return [];
  }
  return names
    .map((name) => posix.join(parent, name, "tokens.json"))
    .filter((other) => other !== rel && other !== TOKENS_JSON && existsSync(join(cwd, other)));
}

const byName = <T extends { name: string }>(items: T[]) => [...items].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
/** A theme's values in a fixed order, so two files that differ only in layout or key order compare equal. */
const themeKey = (t: Theme) =>
  JSON.stringify([byName(t.colors), byName(t.space), byName(t.radius), byName(t.shadows), byName(t.fonts), byName(t.durations), byName(t.easings), byName(t.springs)]);
/** The families a theme's type roles start with (its type pairing, without companions). */
const pairing = (t: Theme) => themeFonts(t).filter((f) => !f.companion).map((f) => f.family);
const samePairing = (a: string[], b: string[]) => a.length === b.length && a.every((f) => b.some((g) => g.toLowerCase() === f.toLowerCase()));

/**
 * Directions are meant to be clearly different. One whose theme values match another's is refused; one that only
 * shares its fonts gets a note (each direction names its own type pairing).
 */
function compareDirections(cwd: string, directions: Map<string, Theme>): { same: { tokens: string; sameAs: string } } | { notes: string[] } {
  const notes: string[] = [];
  const noted = new Set<string>();
  for (const [rel, theme] of directions) {
    const sameFonts: string[] = [];
    for (const other of siblingDirections(cwd, rel)) {
      const otherTheme = directions.get(other) ?? loadThemeFile(other, readFileSync(join(cwd, other), "utf8")).theme;
      if (!otherTheme) continue;
      if (themeKey(otherTheme) === themeKey(theme)) return { same: { tokens: rel, sameAs: other } };
      const pair = [rel, other].sort().join("\n");
      if (samePairing(pairing(theme), pairing(otherTheme)) && !noted.has(pair)) {
        noted.add(pair);
        sameFonts.push(posix.dirname(other));
      }
    }
    if (sameFonts.length > 0) {
      notes.push(`${posix.dirname(rel)} uses the same fonts as ${sameFonts.join(" and ")} (${pairing(theme).join(", ")}). Give each direction its own type pairing, so they're easy to tell apart.`);
    }
  }
  return { notes };
}

/**
 * PNG base names: the file name, or the whole path when two mockups share a file name and an output folder (names that
 * differ only in case are the same file where case doesn't count).
 */
export function pngNames(files: string[], outDirs: string[], caseless: boolean = CASELESS): string[] {
  const same = (a: string, b: string) => (caseless ? a.toLowerCase() === b.toLowerCase() : a === b);
  const base = files.map((f) => basename(f).replace(/\.html$/i, ""));
  return files.map((f, i) =>
    base.some((b, j) => j !== i && same(b, base[i]!) && same(outDirs[j]!, outDirs[i]!)) ? f.replace(/\.html$/i, "").replace(/\//g, "-") : base[i]!,
  );
}

/** The variants a theme set offers, the default first (the ids; none when the guide declares no variants). */
const variantIds = (set: ThemeSet | null): string[] => (set && set.defaultId ? [set.defaultId, ...set.variants.map((v) => v.id)] : []);

/** A path as a key: normalized, and in one case where case doesn't count (the file watcher reports the case on disk). */
const pathKey = (path: string) => (CASELESS ? normalize(path).toLowerCase() : normalize(path));
/** Files a mockup can use: saving one makes its folder's PNGs again. Anything else (PNGs, editors' temporary files) doesn't. */
const ASSET = /\.(css|js|mjs|json|svg|jpe?g|gif|webp|avif|woff2?|ttf|otf)$/i;

function contractTheme(cwd: string): { theme: Theme | null; themeSet: ThemeSet | null; problems: Finding[] } {
  const path = join(cwd, "design", "tokens.json");
  if (!existsSync(path)) return { theme: null, themeSet: null, problems: [] };
  return loadThemeFile(TOKENS_JSON, readFileSync(path, "utf8"));
}

export async function runPreview(cwd: string, ctx: RunContext, deps: PreviewDeps = defaultDeps): Promise<CommandResult> {
  const flags = ctx.flags ?? {};
  const gallery = flags.gallery === true;
  const compare = flags.compare === true;
  const pngOnly = flags["png-only"] === true;
  const preset = typeof flags.preset === "string" ? flags.preset : undefined;

  if (gallery && ctx.positionals.length > 0) {
    return fail(2, "--gallery shows the 8 starting styles on its own; leave out the file names.", { error: "usage" });
  }
  if (!gallery && ctx.positionals.length === 0) {
    return fail(2, "Name the mockups to preview, e.g. motif preview design/previews/home.html (or a folder of them).\nTo see the 8 starting styles instead: motif preview --gallery", { error: "usage" });
  }
  const collected = collectFiles(cwd, ctx.positionals);
  if ("error" in collected) return fail(2, collected.error, { error: "bad-file" });
  const files = collected.files;
  if (compare && files.length < 2) return fail(2, "--compare needs at least two mockups (or a folder with two or more).", { error: "usage" });

  const variantFlag = typeof flags.variant === "string" ? flags.variant : undefined;
  if (variantFlag !== undefined && gallery) return fail(2, "--variant shows your own mockups; leave it out with --gallery.", { error: "usage" });
  const directions = new Map<string, Theme>();
  const directionSets = new Map<string, ThemeSet>();
  for (const file of gallery ? [] : files) {
    const rel = directionTokens(cwd, file);
    if (!rel || directions.has(rel)) continue;
    const loaded = loadThemeFile(rel, readFileSync(join(cwd, rel), "utf8"));
    if (!loaded.theme) {
      const n = loaded.problems.length;
      return fail(
        1,
        `✗ ${rel} has ${n} ${n === 1 ? "problem" : "problems"}, so its mockups would be wrong:\n${formatFindings(loaded.problems)}\nFix these first (motif validate --tokens ${rel} shows details).`,
        { error: "invalid-direction", tokens: rel, findings: loaded.problems },
      );
    }
    directions.set(rel, loaded.theme);
    if (loaded.themeSet) directionSets.set(rel, loaded.themeSet);
  }
  const compared = compareDirections(cwd, directions);
  if ("same" in compared) {
    const { tokens, sameAs } = compared.same;
    return fail(
      1,
      `✗ ${tokens} has the same theme values as ${sameAs}, so the two directions would look the same.\nMake each direction clearly different (its colours, type pairing or density) before previewing it.`,
      { error: "same-direction", tokens, sameAs },
    );
  }
  const needsGuide = !gallery && preset === undefined && files.some((f) => !directionTokens(cwd, f));

  let theme: Theme | null = null;
  let themeSet: ThemeSet | null = null;
  if (preset !== undefined) {
    theme = presetTheme(preset);
    if (!theme) return fail(2, `There's no starting style called "${preset}". Choose one of: ${PRESET_IDS.join(", ")}.`, { error: "no-such-preset" });
  } else if (needsGuide) {
    const loaded = contractTheme(cwd);
    if (loaded.problems.length > 0) {
      const n = loaded.problems.length;
      return fail(
        1,
        `✗ Your theme values have ${n} ${n === 1 ? "problem" : "problems"}, so the preview would be wrong:\n${formatFindings(loaded.problems)}\nFix these first (motif validate shows details).`,
        { error: "invalid-contract", findings: loaded.problems },
      );
    }
    if (!loaded.theme) {
      return fail(2, "No design guide found in this folder (missing design/tokens.json).\nPreview with a starting style instead: --preset <name> (motif preview --gallery shows all 8).", { error: "no-contract" });
    }
    theme = loaded.theme;
    themeSet = loaded.themeSet;
  }
  const setOf = (file: string): ThemeSet | null => {
    const rel = directionTokens(cwd, file);
    return rel ? directionSets.get(rel) ?? null : themeSet;
  };

  // The variants to render for each mockup: its own set (a design direction has its own), the default without a suffix.
  const variantsFor = new Map<string, (string | undefined)[]>();
  let onePalette = false;
  if (variantFlag !== undefined) {
    for (const file of files) {
      const ids = variantIds(setOf(file));
      const who = directionTokens(cwd, file) ? posix.dirname(file) : "This design guide";
      const refusal = variantRefusal(who, variantFlag, ids);
      if (refusal) return fail(refusal.exitCode, refusal.text, refusal.data);
      if (variantFlag === "all" && ids.length === 0) onePalette = true;
      const chosen = variantFlag === "all" ? ids : [variantFlag];
      variantsFor.set(file, chosen.map((id) => (id === ids[0] ? undefined : id)));
    }
  }

  const browser = deps.findBrowser();
  const off = !browser && (deps.browserOff?.() ?? false);
  if (pngOnly && !browser) {
    return off
      ? fail(2, `${BROWSER_OFF}, so Motif can't make PNGs. Unset MOTIF_BROWSER to use Chrome or Edge.`, { error: "browser-off", status: "browser_off" })
      : fail(2, `No Chrome or Edge found, so Motif can't make PNGs. ${INSTALL_HINT}`, { error: "needs-browser", status: "needs_browser" });
  }

  // Live reload starts after the PNGs are saved: they usually land next to the mockups, and every save
  // would otherwise reload the page the renderer is capturing.
  const server = startPreviewServer({ root: cwd, theme, ...(themeSet ? { themeSet } : {}) });
  const outFlag = typeof flags.out === "string" ? resolve(cwd, flags.out) : null;
  const defaultOut = outFlag ?? join(cwd, "design", "previews");
  const outFor = (file: string) => outFlag ?? join(cwd, dirname(file));
  const themeOf = (file: string) => {
    const rel = directionTokens(cwd, file);
    return rel ? directions.get(rel)! : theme;
  };
  const names = pngNames(files, files.map(outFor));
  // The theme a mockup shows in one variant (its fonts may differ from the default's).
  const themeIn = (file: string, variant: string | undefined) => (variant ? setOf(file)?.variants.find((v) => v.id === variant)?.theme ?? null : themeOf(file));
  // targetFile[i] is the index in files of targets[i]: a mockup has one target per variant.
  const targetFile: number[] = [];
  const targets: RenderTarget[] = gallery
    ? PRESET_IDS.map((id) => ({ name: `preset-${id}`, url: `${server.url}/__motif/preset/${id}/sample.html`, outDir: defaultOut, ...fontsOf(presetTheme(id)) }))
    : files.flatMap((f, i) =>
        (variantsFor.get(f) ?? [undefined]).map((variant) => {
          targetFile.push(i);
          return { name: names[i]!, url: server.url + urlPath(f), outDir: outFor(f), ...fontsOf(themeIn(f, variant)), ...(variant ? { variant } : {}) };
        }),
      );

  const notes: string[] = [...compared.notes, ...(onePalette ? [ONE_PALETTE_NOTE] : [])];
  let pngs: string[] = [];
  let missingFonts: string[] = [];
  // Motif's own PNGs, known before each is written: saving them is no change to the mockups.
  const ours = new Set<string>();
  const onFile = (path: string) => void ours.add(pathKey(path));
  if (browser) {
    try {
      const what = gallery ? "the 8 starting styles" : `${targets.length} ${targets.length === 1 ? "mockup" : "mockups"}`;
      ctx.progress?.(`Making PNGs of ${what}, in light and dark…`);
      const rendered = await deps.render({ browserPath: browser.path, targets, outDir: defaultOut, onFile });
      pngs = rendered.files.map((p) => projectPath(cwd, p));
      missingFonts = rendered.missingFonts;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (pngOnly) {
        server.stop();
        return fail(2, `Couldn't make PNGs: ${message}`, { error: "render-failed", message });
      }
      notes.push(`Couldn't make PNGs: ${message}`);
    }
  } else {
    notes.push(off ? `${BROWSER_OFF}, so no PNGs were made.` : `No Chrome or Edge found, so no PNGs were made. ${INSTALL_HINT}`);
  }
  if (missingFonts.length > 0) {
    notes.push(`Shown with a fallback font: ${missingFonts.join(", ")}. Motif includes the starting styles' fonts; other fonts come from Google Fonts, which didn't provide these (no connection, or not a Google font), and it isn't installed on this computer.`);
  }
  const pngLines = pngs.length > 0 ? [`✓ Saved ${pngs.length} PNGs (light and dark):`, ...pngs.map((p) => `  ${p}`)] : [];

  if (pngOnly) {
    server.stop();
    return { command: "preview", exitCode: 0, text: [...pngLines, ...notes.map((n) => `• ${n}`)].join("\n"), data: { pngs, missingFonts, notes } };
  }

  // Saving a mockup makes its PNGs again; saving a file it can use (shared CSS, an image) makes its folder's. Changes
  // that come while a render runs wait for it, then go in one render.
  const mockupAt = files.map((f) => pathKey(join(cwd, f)));
  let changed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let stopped = false;
  const rerender = async () => {
    if (busy || stopped || !browser || gallery) return;
    const paths = [...changed];
    changed = new Set();
    const again = targets.filter(
      (_, i) => existsSync(join(cwd, files[targetFile[i]!]!)) && paths.some((p) => p === mockupAt[targetFile[i]!] || (ASSET.test(p) && dirname(p) === dirname(mockupAt[targetFile[i]!]!))),
    );
    if (again.length === 0) return;
    busy = true;
    try {
      const rendered = await deps.render({ browserPath: browser.path, targets: again, outDir: defaultOut, nameAgainst: targets, onFile });
      if (stopped) return;
      ctx.progress?.(`Updated the PNGs of ${again.map((t) => t.name).join(", ")}.`);
      if (rendered.missingFonts.length > 0) ctx.progress?.(`Shown with a fallback font: ${rendered.missingFonts.join(", ")}.`);
    } catch (e) {
      if (!stopped) ctx.progress?.(`Couldn't update the PNGs: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
      if (changed.size > 0 && !stopped) void rerender();
    }
  };
  // What each file beside a mockup holds, so an event for one whose content didn't change starts nothing: macOS reports
  // changes made before the watch began, and an editor may save a file as it was.
  const contentOf = (path: string) => {
    try {
      return Bun.hash(readFileSync(path));
    } catch {
      return null;
    }
  };
  const held = new Map<string, ReturnType<typeof contentOf>>();
  for (const dir of new Set(files.map((f) => dirname(join(cwd, f))))) {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      // A folder that went away has nothing to compare.
    }
    for (const name of names) held.set(pathKey(join(dir, name)), contentOf(join(dir, name)));
  }
  server.watch(files, {
    ignore: (path) => ours.has(pathKey(path)),
    onChange: (path) => {
      const key = pathKey(path);
      if (!mockupAt.includes(key) && !ASSET.test(key)) return;
      const now = contentOf(path);
      if (held.has(key) && held.get(key) === now) return;
      held.set(key, now);
      changed.add(key);
      clearTimeout(timer);
      timer = setTimeout(() => void rerender(), 300);
    },
  });

  const pages = gallery
    ? ["/__motif/gallery"]
    : compare
      ? [`/__motif/compare?${files.map((f) => `f=${encodeURIComponent(f)}`).join("&")}`]
      : files.map(urlPath);
  const url = server.url + pages[0];
  if (flags["no-open"] !== true && !(await deps.openUrl(url))) notes.push(`Couldn't open your browser. Open ${url} yourself.`);

  const what = gallery ? "the 8 starting styles" : compare ? `${files.length} mockups side by side` : files[0];
  const lines = [
    `✓ Previewing ${what} at ${url}`,
    ...pages.slice(1).map((p) => `  Also: ${server.url}${p}`),
    gallery ? "  Press Ctrl+C to stop." : browser ? "  Pages reload, and their PNGs are made again, when you save a mockup. Press Ctrl+C to stop." : "  Pages reload when you save a mockup. Press Ctrl+C to stop.",
    ...pngLines,
    ...notes.map((n) => `• ${n}`),
  ];
  // A render still running when it's stopped isn't waited for: Motif exits, and its browser goes with it.
  const hold = deps.waitForStop().then(() => {
    stopped = true;
    clearTimeout(timer);
    server.stop();
  });
  return {
    command: "preview",
    exitCode: 0,
    text: lines.join("\n"),
    data: { url, files, pngs, missingFonts, notes, ...(browser ? {} : { status: off ? "browser_off" : "needs_browser" }) },
    hold,
  };
}
