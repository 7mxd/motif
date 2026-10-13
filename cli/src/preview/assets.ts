import kitCss from "../../../skill/preview-kit/kit.css" with { type: "text" };
import template from "../../../skill/preview-kit/template.html" with { type: "text" };
// @ts-ignore -- a text import of a .js file: Bun embeds its contents, TypeScript doesn't need to understand it
import kitJs from "../../../skill/preview-kit/kit.js" with { type: "text" };
// @ts-ignore -- same for the vendored Motion bundle
import motionJs from "../../../skill/preview-kit/vendor/motion.js" with { type: "text" };

export interface Asset {
  body: string;
  type: string;
}

const JS = "text/javascript; charset=utf-8";

export const KIT_ASSETS: Record<"kit.css" | "kit.js" | "vendor/motion.js", Asset> = {
  "kit.css": { body: kitCss, type: "text/css; charset=utf-8" },
  "kit.js": { body: kitJs as unknown as string, type: JS },
  "vendor/motion.js": { body: motionJs as unknown as string, type: JS },
};

// Bun's types call .html imports HTMLBundle (for its dev server); with { type: "text" } it is the file's text.
export const TEMPLATE_HTML: string = template as unknown as string;
