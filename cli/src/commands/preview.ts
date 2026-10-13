import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { loadTokenDocument } from "../contract/load";
import { checkRoles } from "../contract/roles";
import { validateTokens } from "../contract/tokens";
import { findBrowser, type BrowserInfo } from "../detect/browser";
import { formatFindings, type Finding } from "../findings";
import { buildTheme, type Theme } from "../generate/theme";
import { openUrl } from "../preview/open";
import { EMBEDDED_PRESETS, presetTheme } from "../preview/presets";
import { renderPngs, type RenderTarget } from "../preview/render";
import { startPreviewServer } from "../preview/server";
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
const INSTALL_HINT = '"motif browser install" downloads a private headless copy (about 100 MB) that only Motif uses.';

const fail = (exitCode: 1 | 2, text: string, data: Record<string, unknown>): CommandResult => ({ command: "preview", exitCode, text, data });
const projectPath = (cwd: string, abs: string) => relative(cwd, abs).split(sep).join("/");
const urlPath = (rel: string) => "/" + rel.split("/").map(encodeURIComponent).join("/");
const isHtml = (name: string) => name.toLowerCase().endsWith(".html");

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

/** PNG base names: the file name, or the whole path when two mockups share a file name. */
function pngNames(files: string[]): string[] {
  const base = files.map((f) => basename(f).replace(/\.html$/i, ""));
  return files.map((f, i) =>
    base.filter((b) => b === base[i]).length > 1 ? f.replace(/\.html$/i, "").replace(/\//g, "-") : base[i]!,
  );
}

function contractTheme(cwd: string): { theme: Theme | null; problems: Finding[] } {
  const path = join(cwd, "design", "tokens.json");
  if (!existsSync(path)) return { theme: null, problems: [] };
  const { doc, findings } = loadTokenDocument(TOKENS_JSON, readFileSync(path, "utf8"));
  const problems = doc ? [...findings, ...validateTokens(doc), ...checkRoles(doc)].filter((f) => f.severity === "error") : findings;
  return { theme: doc && problems.length === 0 ? buildTheme(doc) : null, problems };
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

  let theme: Theme | null = null;
  if (preset !== undefined) {
    theme = presetTheme(preset);
    if (!theme) return fail(2, `There's no starting style called "${preset}". Choose one of: ${PRESET_IDS.join(", ")}.`, { error: "no-such-preset" });
  } else if (!gallery) {
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
  const outDir = resolve(cwd, typeof flags.out === "string" ? flags.out : join("design", "previews"));
  const names = pngNames(files);
  const targets: RenderTarget[] = gallery
    ? PRESET_IDS.map((id) => ({ name: `preset-${id}`, url: `${server.url}/__motif/preset/${id}/sample.html` }))
    : files.map((f, i) => ({ name: names[i]!, url: server.url + urlPath(f) }));

  const notes: string[] = [];
  let pngs: string[] = [];
  if (browser) {
    try {
      pngs = (await deps.render({ browserPath: browser.path, targets, outDir })).map((p) => projectPath(cwd, p));
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
  const pngLines = pngs.length > 0 ? [`✓ Saved ${pngs.length} PNGs (light and dark):`, ...pngs.map((p) => `  ${p}`)] : [];

  if (pngOnly) {
    server.stop();
    return { command: "preview", exitCode: 0, text: pngLines.join("\n"), data: { pngs } };
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
    data: { url, files, pngs, ...(browser ? {} : { status: "needs_browser" }) },
    hold,
  };
}
