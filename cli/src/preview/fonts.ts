import archivo from "../../../skill/preview-kit/fonts/archivo.woff2" with { type: "file" };
import dmSans from "../../../skill/preview-kit/fonts/dm-sans.woff2" with { type: "file" };
import fontsCss from "../../../skill/preview-kit/fonts/fonts.css" with { type: "text" };
import fraunces from "../../../skill/preview-kit/fonts/fraunces.woff2" with { type: "file" };
import fredoka from "../../../skill/preview-kit/fonts/fredoka.woff2" with { type: "file" };
import ibmPlexSans from "../../../skill/preview-kit/fonts/ibm-plex-sans.woff2" with { type: "file" };
import inter from "../../../skill/preview-kit/fonts/inter.woff2" with { type: "file" };
import nunito from "../../../skill/preview-kit/fonts/nunito.woff2" with { type: "file" };
import playfairDisplay from "../../../skill/preview-kit/fonts/playfair-display.woff2" with { type: "file" };
import sourceSans3 from "../../../skill/preview-kit/fonts/source-sans-3.woff2" with { type: "file" };
import sourceSerif4 from "../../../skill/preview-kit/fonts/source-serif-4.woff2" with { type: "file" };
import spaceGrotesk from "../../../skill/preview-kit/fonts/space-grotesk.woff2" with { type: "file" };

/** Font file name → a path Bun.file() reads, in the source tree or inside the compiled tool. */
export const EMBEDDED_FONT_FILES: Record<string, string> = {
  "archivo.woff2": archivo,
  "dm-sans.woff2": dmSans,
  "fraunces.woff2": fraunces,
  "fredoka.woff2": fredoka,
  "ibm-plex-sans.woff2": ibmPlexSans,
  "inter.woff2": inter,
  "nunito.woff2": nunito,
  "playfair-display.woff2": playfairDisplay,
  "source-sans-3.woff2": sourceSans3,
  "source-serif-4.woff2": sourceSerif4,
  "space-grotesk.woff2": spaceGrotesk,
};

/** skill/preview-kit/fonts/fonts.css: relative URLs, so it works from /__motif/kit/fonts/ and from a copied kit alike. */
export const FONTS_CSS: string = fontsCss;
