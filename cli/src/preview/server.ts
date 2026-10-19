import { existsSync, readFileSync, realpathSync, statSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { previewCss } from "../generate/preview-css";
import { fontStylesheets } from "../generate/theme-fonts";
import type { ProjectFont } from "../contract/fonts";
import type { Theme, ThemeSet, ThemeVariant } from "../generate/theme";
import { KIT_ASSETS, TEMPLATE_HTML } from "./assets";
import { EMBEDDED_FONT_FILES, FONTS_CSS } from "./fonts";
import { comparePage, galleryPage } from "./pages";
import { EMBEDDED_PRESETS, presetTheme } from "./presets";
import { loadThemeFile } from "./theme-file";

export interface PreviewServer {
  url: string;
  port: number;
  /**
   * Start live reload for these mockups (project paths). Call it after saving PNGs next to them, or saving reloads the
   * page being rendered. A change to a file ignore() accepts (Motif's own PNGs) is no change; onChange hears the others.
   */
  watch(files: string[], opts?: WatchOptions): void;
  stop(): void;
}

export interface WatchOptions {
  ignore?: (path: string) => boolean;
  onChange?: (path: string) => void;
}

export const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff",
  ".htm": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".avif": "image/avif", ".ico": "image/x-icon",
  ".ttf": "font/ttf", ".otf": "font/otf", ".mp4": "video/mp4", ".webm": "video/webm", ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
};

/**
 * Loads theme font stylesheets only after the page has loaded, so a font server that never answers can't hold
 * the page (or a PNG render) up. window.__motifFonts settles once every stylesheet has loaded or failed.
 */
function fontLoader(links: string[]): string {
  return `<script>window.__motifFonts=new Promise(function(done){addEventListener("load",function(){var urls=${JSON.stringify(links).replace(/</g, "\\u003c")},left=urls.length;urls.forEach(function(u){var l=document.createElement("link");l.rel="stylesheet";l.href=u;l.onload=l.onerror=function(){if(--left===0)done()};document.head.appendChild(l)})})});</script>`;
}

export function injectKit(html: string, themeHref: string, fontLinks: string[] = [], projectFontsHref?: string): string {
  const tags = [
    `<link rel="stylesheet" href="${themeHref}">`,
    ...(projectFontsHref ? [`<link rel="stylesheet" href="${projectFontsHref}">`] : []),
    '<link rel="stylesheet" href="/__motif/kit/fonts/fonts.css">',
    '<link rel="stylesheet" href="/__motif/kit/kit.css">',
    '<script src="/__motif/kit/vendor/motion.js"></script>',
    '<script src="/__motif/kit/kit.js"></script>',
    ...(fontLinks.length > 0 ? [fontLoader(fontLinks)] : []),
  ].join("\n");
  // Looked for outside comments (a "<head>" in a comment isn't the head), in a copy of the same length.
  const seen = html.replace(/<!--[\s\S]*?-->/g, (c) => " ".repeat(c.length));
  const close = /<\/head>/i.exec(seen);
  if (close) return `${html.slice(0, close.index)}${tags}\n${html.slice(close.index)}`;
  // No </head>: right after <head>, else <html>, else the doctype (comments may come first); never before the
  // doctype, which would draw the page in quirks mode.
  const opening = /<head\b[^>]*>/i.exec(seen) ?? /<html\b[^>]*>/i.exec(seen) ?? /^\s*<!doctype[^>]*>/i.exec(seen);
  if (!opening) return `${tags}\n${html}`;
  const at = opening.index + opening[0].length;
  return `${html.slice(0, at)}\n${tags}\n${html.slice(at)}`;
}

/** The file a request path names, or null if it would leave the project folder. */
/**
 * The real path of an existing file or folder (links followed, Windows short names like ENV~1 expanded) when it is
 * inside root's real path and nothing on the way is hidden (.env, .git); otherwise null.
 */
export function realInside(root: string, path: string): string | null {
  let real: string;
  let realRoot: string;
  try {
    real = realpathSync.native(path);
    realRoot = realpathSync.native(root);
  } catch {
    return null;
  }
  const rel = relative(realRoot, real);
  if (rel.split(sep)[0] === ".." || isAbsolute(rel)) return null;
  return rel.split(sep).some((part) => part.startsWith(".")) ? null : real;
}

export function resolveInside(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  return pathInside(root, decoded);
}

/** The file a project path (already decoded) names, or null if it would leave the project folder. */
function pathInside(root: string, decoded: string): string | null {
  if (decoded.includes("\0")) return null;
  const target = resolve(root, "." + (decoded.startsWith("/") ? decoded : `/${decoded}`));
  const rel = relative(root, target);
  return rel.split(sep)[0] === ".." || isAbsolute(rel) ? null : target;
}

const notFound = () => new Response("Not found", { status: 404 });

const GUIDE_TOKENS = "design/tokens.json";

/** A mockup's theme: the tokens.json in its own folder (a design direction), or the design guide's. */
export function themeHrefFor(root: string, file: string): string {
  const own = join(dirname(file), "tokens.json");
  const rel = relative(root, own).split(sep).join("/");
  if (rel === GUIDE_TOKENS || !existsSync(own)) return "/__motif/theme.css";
  return `/__motif/theme.css?tokens=${encodeURIComponent(rel)}`;
}

/** The query that picks a design direction's own fonts (none for the design guide). */
function tokensQuery(root: string, file: string): string {
  const own = join(dirname(file), "tokens.json");
  const rel = relative(root, own).split(sep).join("/");
  return rel === GUIDE_TOKENS || !existsSync(own) ? "" : `?tokens=${encodeURIComponent(rel)}`;
}

/** Each font file type's CSS format(), in the order a browser should try them. */
const FONT_FORMATS: [RegExp, string][] = [[/\.woff2$/i, "woff2"], [/\.woff$/i, "woff"], [/\.ttf$/i, "truetype"], [/\.otf$/i, "opentype"]];

/**
 * @font-face rules for the project fonts: one per family, weight and style, with all its files (WOFF2 first) in one src.
 * File n of the flat list is served at /__motif/project-font/n.
 */
function projectFontsCss(fonts: ProjectFont[], query: string): string {
  let n = 0;
  const rules = new Map<string, { family: string; weight: number; style: string; src: { rank: number; css: string }[] }>();
  for (const f of fonts) {
    const family = f.family.replace(/["\\]/g, "");
    for (const file of f.files) {
      const key = JSON.stringify([family, file.weight, file.style]);
      const rule = rules.get(key) ?? { family, weight: file.weight, style: file.style, src: [] };
      const rank = FONT_FORMATS.findIndex(([ext]) => ext.test(file.path));
      const format = rank >= 0 ? ` format("${FONT_FORMATS[rank]![1]}")` : "";
      rule.src.push({ rank, css: `url("/__motif/project-font/${n++}${query}")${format}` });
      rules.set(key, rule);
    }
  }
  return [...rules.values()]
    .map((r) =>
      [
        "@font-face {",
        `  font-family: "${r.family}";`,
        `  src: ${r.src.sort((a, b) => a.rank - b.rank).map((s) => s.css).join(", ")};`,
        `  font-weight: ${r.weight};`,
        `  font-style: ${r.style};`,
        "  font-display: swap;",
        "}",
        "",
      ].join("\n"),
    )
    .join("\n");
}

function directionCss(root: string, rel: string, fontCssUrl?: FontCssUrl): string {
  // rel comes from the query string, already decoded once: a folder named "50% off" must not be decoded again.
  const file = pathInside(root, rel);
  if (!file || basename(file) !== "tokens.json" || !existsSync(file)) return `/* There's no theme at ${rel}. */\n`;
  const { theme, themeSet } = loadThemeFile(rel, readFileSync(file, "utf8"));
  return theme ? previewCss(theme, fontCssUrl, themeSet?.variants) : `/* ${rel} has problems. Run: motif validate --tokens ${rel} */\n`;
}

/** Where a theme font's stylesheet comes from (Google Fonts; tests point it elsewhere). */
type FontCssUrl = (family: string, weights: number[]) => string;

export function startPreviewServer(opts: { root: string; theme: Theme | null; themeSet?: ThemeSet; watch?: string[]; fontCssUrl?: FontCssUrl }): PreviewServer {
  const root = resolve(opts.root);
  const encoder = new TextEncoder();
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const html = (body: string) => new Response(body, { headers: { "content-type": CONTENT_TYPES[".html"]!, "cache-control": "no-store" } });
  const guideTheme = opts.themeSet?.base ?? opts.theme;
  const guideVariants: ThemeVariant[] = opts.themeSet?.variants ?? [];
  const mockupTheme = (file: string): Theme | null => {
    const own = join(dirname(file), "tokens.json");
    if (relative(root, own).split(sep).join("/") === GUIDE_TOKENS || !existsSync(own)) return guideTheme;
    return loadThemeFile("tokens.json", readFileSync(own, "utf8")).theme;
  };
  // The project fonts of the design guide, or of the design direction a request names.
  const projectFontsFor = (tokens: string | null): ProjectFont[] => {
    if (tokens === null) return guideTheme?.projectFonts ?? [];
    const file = pathInside(root, tokens);
    if (!file || basename(file) !== "tokens.json" || !existsSync(file)) return [];
    return loadThemeFile(tokens, readFileSync(file, "utf8")).theme?.projectFonts ?? [];
  };
  const themeCss = (preset: string | null) => {
    const theme = preset ? presetTheme(preset) : guideTheme;
    return theme ? previewCss(theme, opts.fontCssUrl, preset ? [] : guideVariants) : "/* No design guide yet: use --preset <name>, or write design/tokens.json. */\n";
  };

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, srv) {
      // Only answer requests addressed to this server: a web page that re-points its own domain at 127.0.0.1
      // (DNS rebinding) sends its own name as Host.
      const host = req.headers.get("host");
      if (host !== `127.0.0.1:${srv.port}` && host !== `localhost:${srv.port}`) return new Response("Forbidden", { status: 403 });
      const url = new URL(req.url);
      const path = url.pathname;
      if (path === "/__motif/theme.css") {
        const tokens = url.searchParams.get("tokens");
        const css = tokens !== null ? directionCss(root, tokens, opts.fontCssUrl) : themeCss(url.searchParams.get("preset"));
        return new Response(css, { headers: { "content-type": CONTENT_TYPES[".css"]!, "cache-control": "no-store" } });
      }
      if (path === "/__motif/project-fonts.css") {
        const tokens = url.searchParams.get("tokens");
        const fonts = projectFontsFor(tokens);
        if (fonts.length === 0) return notFound();
        const query = tokens !== null ? `?tokens=${encodeURIComponent(tokens)}` : "";
        return new Response(projectFontsCss(fonts, query), { headers: { "content-type": CONTENT_TYPES[".css"]!, "cache-control": "no-store" } });
      }
      const projectFont = path.match(/^\/__motif\/project-font\/(\d+)$/);
      if (projectFont) {
        const entry = projectFontsFor(url.searchParams.get("tokens")).flatMap((f) => f.files)[Number(projectFont[1])];
        const file = entry ? pathInside(root, entry.path) : null;
        if (!file || !existsSync(file) || !statSync(file).isFile() || !realInside(root, file)) return notFound();
        return new Response(Bun.file(file), { headers: { "content-type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" } });
      }
      if (path.startsWith("/__motif/kit/fonts/")) {
        const name = path.slice("/__motif/kit/fonts/".length);
        if (name === "fonts.css") return new Response(FONTS_CSS, { headers: { "content-type": CONTENT_TYPES[".css"]! } });
        if (!Object.hasOwn(EMBEDDED_FONT_FILES, name)) return notFound();
        return new Response(Bun.file(EMBEDDED_FONT_FILES[name]!), { headers: { "content-type": "font/woff2", "cache-control": "max-age=3600" } });
      }
      if (path.startsWith("/__motif/kit/")) {
        const name = path.slice("/__motif/kit/".length);
        if (!Object.hasOwn(KIT_ASSETS, name)) return notFound();
        const asset = KIT_ASSETS[name as keyof typeof KIT_ASSETS];
        return new Response(asset.body, { headers: { "content-type": asset.type } });
      }
      if (path === "/__motif/events") {
        srv.timeout(req, 0); // keep the event stream open
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            controller = c;
            clients.add(c);
            c.enqueue(encoder.encode(": connected\n\n"));
          },
          cancel() {
            clients.delete(controller);
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
      }
      if (path === "/__motif/compare") return html(comparePage(url.searchParams.getAll("f")));
      if (path === "/__motif/gallery") return html(galleryPage(EMBEDDED_PRESETS));
      const sample = path.match(/^\/__motif\/preset\/([a-z-]+)\/sample\.html$/);
      if (sample) {
        return presetTheme(sample[1]!) ? html(injectKit(TEMPLATE_HTML, `/__motif/theme.css?preset=${sample[1]}`)) : notFound();
      }
      const file = resolveInside(root, path);
      if (!file || !existsSync(file) || !statSync(file).isFile()) return notFound();
      // Hidden files and folders (.env, .git) are never mockup material, under any name or through any link. The real
      // path is only checked: links and paths below are the project's own (macOS /var is really /private/var).
      if (relative(root, file).split(sep).some((part) => part.startsWith("."))) return notFound();
      if (!realInside(root, file)) return notFound();
      const ext = extname(file).toLowerCase();
      if (ext === ".html") {
        const theme = mockupTheme(file);
        const links = theme ? fontStylesheets(theme, opts.fontCssUrl) : [];
        const query = tokensQuery(root, file);
        return html(injectKit(readFileSync(file, "utf8"), themeHrefFor(root, file), links, theme && theme.projectFonts.length > 0 ? `/__motif/project-fonts.css${query}` : undefined));
      }
      return new Response(Bun.file(file), { headers: { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream" } });
    },
  });

  // Live reload: watch the folders of the mockups being previewed.
  const watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const c of clients) {
        try {
          c.enqueue(encoder.encode("event: reload\ndata: 1\n\n"));
        } catch {
          clients.delete(c);
        }
      }
    }, 100);
  };
  const watchFiles = (files: string[], wopts: WatchOptions = {}) => {
    for (const dir of new Set(files.map((f) => dirname(resolve(root, f))))) {
      try {
        watchers.push(
          watch(dir, (_event, name) => {
            // Some systems don't say which file changed: then pages reload, and nothing else is done.
            const changed = name ? join(dir, String(name)) : null;
            if (changed && wopts.ignore?.(changed)) return;
            notify();
            if (changed) wopts.onChange?.(changed);
          }),
        );
      } catch {
        // Live reload is a convenience; previews still work without it.
      }
    }
  };
  watchFiles(opts.watch ?? []);

  return {
    url: `http://127.0.0.1:${server.port}`,
    port: server.port!,
    watch: watchFiles,
    stop() {
      clearTimeout(timer);
      for (const w of watchers) w.close();
      for (const c of clients) {
        try {
          c.close();
        } catch {
          // already closed
        }
      }
      server.stop(true);
    },
  };
}
