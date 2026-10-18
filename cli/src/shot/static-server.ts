// Serves a plain web site's folder on 127.0.0.1 for screenshots: its own files only, never hidden ones (.env, .git),
// nothing outside it, and only to requests addressed to it.
import { existsSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { CONTENT_TYPES, realInside, resolveInside } from "../preview/server";

export interface StaticServer {
  url: string;
  stop(): void;
}

const notFound = () => new Response("Not found", { status: 404 });

export function startStaticServer(root: string): StaticServer {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, srv) {
      const host = req.headers.get("host");
      if (host !== `127.0.0.1:${srv.port}` && host !== `localhost:${srv.port}`) return new Response("Forbidden", { status: 403 });
      const path = new URL(req.url).pathname;
      const asked = resolveInside(root, path);
      if (!asked || !existsSync(asked)) return notFound();
      if (relative(root, asked).split(sep).some((part) => part.startsWith("."))) return notFound();
      // The real file must be inside the site too: no links out of it, no hidden file by its Windows short name.
      let file = realInside(root, asked);
      if (!file) return notFound();
      if (statSync(file).isDirectory()) {
        // A folder's page links relative to the folder, so its address ends with "/".
        if (!path.endsWith("/")) return new Response(null, { status: 301, headers: { location: `${path}/` } });
        // index.html, or index.htm as older sites name it.
        file = realInside(root, join(file, "index.html")) ?? realInside(root, join(file, "index.htm"));
        if (!file) return notFound();
      }
      if (!statSync(file).isFile()) return notFound();
      return new Response(Bun.file(file), {
        headers: { "content-type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" },
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => void server.stop(true) };
}
