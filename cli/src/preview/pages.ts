import { presetTitle, type EmbeddedPreset } from "./presets";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// The tool's own pages (not the app), so they use fixed neutral colours.
const STYLE = `<style>
  body { margin: 0; padding: 32px; background: #f4f4f5; color: #18181b; font: 14px/1.4 system-ui, sans-serif; }
  h1 { margin: 0 0 24px; font-size: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(520px, 1fr)); gap: 24px; }
  figure { margin: 0; background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden; }
  figcaption { padding: 12px 16px; border-top: 1px solid #e4e4e7; }
  figcaption small { display: block; color: #52525b; }
  iframe { display: block; width: 100%; height: 980px; border: 0; }
</style>`;

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title>${STYLE}</head><body><h1>${escape(title)}</h1><div class="grid">${body}</div></body></html>`;

export function comparePage(files: string[]): string {
  const figures = files.map((f) => {
    const src = "/" + f.split("/").map(encodeURIComponent).join("/");
    return `<figure><iframe src="${escape(src)}" title="${escape(f)}"></iframe><figcaption>${escape(f)}</figcaption></figure>`;
  });
  return page("Compare", figures.join(""));
}

export function galleryPage(presets: EmbeddedPreset[]): string {
  const figures = presets.map((p) => {
    const words = p.about.match(/\*\*Feels:\*\*\s*(.+)/)?.[1] ?? "";
    const title = presetTitle(p.about);
    return `<figure><iframe src="/__motif/preset/${p.id}/sample.html" title="${escape(title)}"></iframe><figcaption><strong>${escape(title)}</strong> <small>${escape(words)} · --preset ${escape(p.id)}</small></figcaption></figure>`;
  });
  return page("Starting styles", figures.join(""));
}
