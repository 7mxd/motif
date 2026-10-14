import { existsSync, readFileSync, statSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { previewCss } from "../generate/preview-css";
import type { Theme } from "../generate/theme";
import { KIT_ASSETS, TEMPLATE_HTML } from "./assets";
import { EMBEDDED_FONT_FILES, FONTS_CSS } from "./fonts";
import { comparePage, galleryPage } from "./pages";
import { EMBEDDED_PRESETS, presetTheme } from "./presets";
import { loadThemeFile } from "./theme-file";

export interface PreviewServer {
  url: string;
  port: number;
  /** Start live reload for these mockups (project paths). Call it after saving PNGs next to them, or saving reloads the page being rendered. */
  watch(files: string[]): void;
  stop(): void;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff",
};

export function injectKit(html: string, themeHref: string): string {
  const tags = [
    `<link rel="stylesheet" href="${themeHref}">`,
    '<link rel="stylesheet" href="/__motif/kit/fonts/fonts.css">',
    '<link rel="stylesheet" href="/__motif/kit/kit.css">',
    '<script src="/__motif/kit/vendor/motion.js"></script>',
    '<script src="/__motif/kit/kit.js"></script>',
  ].join("\n");
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${tags}\n</head>`) : `${tags}\n${html}`;
}

/** The file a request path names, or null if it would leave the project folder. */
export function resolveInside(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
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

function directionCss(root: string, rel: string): string {
  const file = resolveInside(root, rel);
  if (!file || basename(file) !== "tokens.json" || !existsSync(file)) return `/* There's no theme at ${rel}. */\n`;
  const { theme } = loadThemeFile(rel, readFileSync(file, "utf8"));
  return theme ? previewCss(theme) : `/* ${rel} has problems. Run: motif validate --tokens ${rel} */\n`;
}

export function startPreviewServer(opts: { root: string; theme: Theme | null; watch?: string[] }): PreviewServer {
  const root = resolve(opts.root);
  const encoder = new TextEncoder();
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const html = (body: string) => new Response(body, { headers: { "content-type": TYPES[".html"]!, "cache-control": "no-store" } });
  const themeCss = (preset: string | null) => {
    const theme = preset ? presetTheme(preset) : opts.theme;
    return theme ? previewCss(theme) : "/* No design guide yet: use --preset <name>, or write design/tokens.json. */\n";
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
        const css = tokens !== null ? directionCss(root, tokens) : themeCss(url.searchParams.get("preset"));
        return new Response(css, { headers: { "content-type": TYPES[".css"]!, "cache-control": "no-store" } });
      }
      if (path.startsWith("/__motif/kit/fonts/")) {
        const name = path.slice("/__motif/kit/fonts/".length);
        if (name === "fonts.css") return new Response(FONTS_CSS, { headers: { "content-type": TYPES[".css"]! } });
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
      // Hidden files and folders (.env, .git) are never mockup material.
      if (relative(root, file).split(sep).some((part) => part.startsWith("."))) return notFound();
      const ext = extname(file).toLowerCase();
      if (ext === ".html") return html(injectKit(readFileSync(file, "utf8"), themeHrefFor(root, file)));
      return new Response(Bun.file(file), { headers: { "content-type": TYPES[ext] ?? "application/octet-stream" } });
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
  const watchFiles = (files: string[]) => {
    for (const dir of new Set(files.map((f) => dirname(resolve(root, f))))) {
      try {
        watchers.push(watch(dir, notify));
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
