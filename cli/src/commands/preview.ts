import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { findBrowser, type BrowserInfo } from "../detect/browser";
import { formatFindings, type Finding } from "../findings";
import type { Theme } from "../generate/theme";
import { themeFonts } from "../generate/theme-fonts";
import { openUrl } from "../preview/open";
import { EMBEDDED_PRESETS, presetTheme } from "../preview/presets";
import { renderPngs, type RenderTarget } from "../preview/render";
import { startPreviewServer } from "../preview/server";
import { loadThemeFile } from "../preview/theme-file";
import { TOKENS_JSON } from "./validate";

export interface PreviewDeps {
  findBrowser: () => BrowserInfo | null;
  render: typeof renderPngs;
  openUrl: (url: string) => Promise<boolean>;
  waitForStop: () => Promise<void>;
}

const defaultDeps: PreviewDeps = {
  findBrowser: () => findBrowser(),
  render: renderPngs,
  openUrl,
  waitForStop: () =>
    new Promise((resolve) => {
      process.once("SIGINT", () => resolve());
      process.once("SIGTERM", () => resolve());
    }),
};

const PRESET_IDS = EMBEDDED_PRESETS.map((p) => p.id);
const INSTALL_HINT = '"motif browser install" downloads a private headless copy (about 120 MB to download, about 300 MB on disk) that only Motif uses.';

const fail = (exitCode: 1 | 2, text: string, data: Record<string, unknown>): CommandResult => ({ command: "preview", exitCode, text, data });
const projectPath = (cwd: string, abs: string) => relative(cwd, abs).split(sep).join("/");
const urlPath = (rel: string) => "/" + rel.split("/").map(encodeURIComponent).join("/");
const isHtml = (name: string) => name.toLowerCase().endsWith(".html");
/** The theme fonts a mockup should show (system fonts are always there). */
const fontsOf = (t: Theme | null) => (t ? themeFonts(t).filter((f) => f.source !== "system").map((f) => f.family) : []);

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

/** PNG base names: the file name, or the whole path when two mockups share a file name and an output folder. */
function pngNames(files: string[], outDirs: string[]): string[] {
  const base = files.map((f) => basename(f).replace(/\.html$/i, ""));
  return files.map((f, i) =>
    base.some((b, j) => j !== i && b === base[i] && outDirs[j] === outDirs[i]) ? f.replace(/\.html$/i, "").replace(/\//g, "-") : base[i]!,
  );
}

function contractTheme(cwd: string): { theme: Theme | null; problems: Finding[] } {
  const path = join(cwd, "design", "tokens.json");
  if (!existsSync(path)) return { theme: null, problems: [] };
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

  const directions = new Map<string, Theme>();
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
  }
  const needsGuide = !gallery && preset === undefined && files.some((f) => !directionTokens(cwd, f));

  let theme: Theme | null = null;
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
  }

  const browser = deps.findBrowser();
  if (pngOnly && !browser) {
    return fail(2, `No Chrome or Edge found, so Motif can't make PNGs. ${INSTALL_HINT}`, { error: "needs-browser", status: "needs_browser" });
  }

  // Live reload starts after the PNGs are saved: they usually land next to the mockups, and every save
  // would otherwise reload the page the renderer is capturing.
  const server = startPreviewServer({ root: cwd, theme });
  const outFlag = typeof flags.out === "string" ? resolve(cwd, flags.out) : null;
  const defaultOut = outFlag ?? join(cwd, "design", "previews");
  const outFor = (file: string) => outFlag ?? join(cwd, dirname(file));
  const themeOf = (file: string) => {
    const rel = directionTokens(cwd, file);
    return rel ? directions.get(rel)! : theme;
  };
  const names = pngNames(files, files.map(outFor));
  const targets: RenderTarget[] = gallery
    ? PRESET_IDS.map((id) => ({ name: `preset-${id}`, url: `${server.url}/__motif/preset/${id}/sample.html`, outDir: defaultOut, fonts: fontsOf(presetTheme(id)) }))
    : files.map((f, i) => ({ name: names[i]!, url: server.url + urlPath(f), outDir: outFor(f), fonts: fontsOf(themeOf(f)) }));

  const notes: string[] = [];
  let pngs: string[] = [];
  let missingFonts: string[] = [];
  if (browser) {
    try {
      const rendered = await deps.render({ browserPath: browser.path, targets, outDir: defaultOut });
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
    notes.push(`No Chrome or Edge found, so no PNGs were made. ${INSTALL_HINT}`);
  }
  if (missingFonts.length > 0) {
    notes.push(`Shown with a fallback font: ${missingFonts.join(", ")}. Motif includes the starting styles' fonts; other fonts come from Google Fonts, which didn't provide these (no connection, or not a Google font).`);
  }
  const pngLines = pngs.length > 0 ? [`✓ Saved ${pngs.length} PNGs (light and dark):`, ...pngs.map((p) => `  ${p}`)] : [];

  if (pngOnly) {
    server.stop();
    return { command: "preview", exitCode: 0, text: [...pngLines, ...notes.map((n) => `• ${n}`)].join("\n"), data: { pngs, missingFonts } };
  }
  server.watch(files);

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
    gallery ? "  Press Ctrl+C to stop." : "  Pages reload when you save a mockup. Press Ctrl+C to stop.",
    ...pngLines,
    ...notes.map((n) => `• ${n}`),
  ];
  const hold = deps.waitForStop().then(() => server.stop());
  return {
    command: "preview",
    exitCode: 0,
    text: lines.join("\n"),
    data: { url, files, pngs, missingFonts, ...(browser ? {} : { status: "needs_browser" }) },
    hold,
  };
}
