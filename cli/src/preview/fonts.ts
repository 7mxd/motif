import alexandriaArabic from "../../../skill/preview-kit/fonts/alexandria-arabic.woff2" with { type: "file" };
import archivo from "../../../skill/preview-kit/fonts/archivo.woff2" with { type: "file" };
import balooBhaijaan2Arabic from "../../../skill/preview-kit/fonts/baloo-bhaijaan-2-arabic.woff2" with { type: "file" };
import changaArabic from "../../../skill/preview-kit/fonts/changa-arabic.woff2" with { type: "file" };
import dmSans from "../../../skill/preview-kit/fonts/dm-sans.woff2" with { type: "file" };
import elMessiriArabic from "../../../skill/preview-kit/fonts/el-messiri-arabic.woff2" with { type: "file" };
import fontsCss from "../../../skill/preview-kit/fonts/fonts.css" with { type: "text" };
import fraunces from "../../../skill/preview-kit/fonts/fraunces.woff2" with { type: "file" };
import fredoka from "../../../skill/preview-kit/fonts/fredoka.woff2" with { type: "file" };
import geologica from "../../../skill/preview-kit/fonts/geologica.woff2" with { type: "file" };
import ibmPlexSans from "../../../skill/preview-kit/fonts/ibm-plex-sans.woff2" with { type: "file" };
import inter from "../../../skill/preview-kit/fonts/inter.woff2" with { type: "file" };
import madaArabic from "../../../skill/preview-kit/fonts/mada-arabic.woff2" with { type: "file" };
import markaziTextArabic from "../../../skill/preview-kit/fonts/markazi-text-arabic.woff2" with { type: "file" };
import merriweatherSans from "../../../skill/preview-kit/fonts/merriweather-sans.woff2" with { type: "file" };
import notoSerifDisplay from "../../../skill/preview-kit/fonts/noto-serif-display.woff2" with { type: "file" };
import nunito from "../../../skill/preview-kit/fonts/nunito.woff2" with { type: "file" };
import onest from "../../../skill/preview-kit/fonts/onest.woff2" with { type: "file" };
import playfairDisplay from "../../../skill/preview-kit/fonts/playfair-display.woff2" with { type: "file" };
import publicSans from "../../../skill/preview-kit/fonts/public-sans.woff2" with { type: "file" };
import readexProArabic from "../../../skill/preview-kit/fonts/readex-pro-arabic.woff2" with { type: "file" };
import rubikArabic from "../../../skill/preview-kit/fonts/rubik-arabic.woff2" with { type: "file" };
import sourceSans3 from "../../../skill/preview-kit/fonts/source-sans-3.woff2" with { type: "file" };
import sourceSerif4 from "../../../skill/preview-kit/fonts/source-serif-4.woff2" with { type: "file" };
import spaceGrotesk from "../../../skill/preview-kit/fonts/space-grotesk.woff2" with { type: "file" };
import tasaOrbiter from "../../../skill/preview-kit/fonts/tasa-orbiter.woff2" with { type: "file" };
import vollkorn from "../../../skill/preview-kit/fonts/vollkorn.woff2" with { type: "file" };
import zalandoSans from "../../../skill/preview-kit/fonts/zalando-sans.woff2" with { type: "file" };
import zalandoSansExpanded from "../../../skill/preview-kit/fonts/zalando-sans-expanded.woff2" with { type: "file" };

/** Font file name → a path Bun.file() reads, in the source tree or inside the compiled tool. */
export const EMBEDDED_FONT_FILES: Record<string, string> = {
  "alexandria-arabic.woff2": alexandriaArabic,
  "archivo.woff2": archivo,
  "baloo-bhaijaan-2-arabic.woff2": balooBhaijaan2Arabic,
  "changa-arabic.woff2": changaArabic,
  "dm-sans.woff2": dmSans,
  "el-messiri-arabic.woff2": elMessiriArabic,
  "fraunces.woff2": fraunces,
  "fredoka.woff2": fredoka,
  "geologica.woff2": geologica,
  "ibm-plex-sans.woff2": ibmPlexSans,
  "inter.woff2": inter,
  "mada-arabic.woff2": madaArabic,
  "markazi-text-arabic.woff2": markaziTextArabic,
  "merriweather-sans.woff2": merriweatherSans,
  "noto-serif-display.woff2": notoSerifDisplay,
  "nunito.woff2": nunito,
  "onest.woff2": onest,
  "playfair-display.woff2": playfairDisplay,
  "public-sans.woff2": publicSans,
  "readex-pro-arabic.woff2": readexProArabic,
  "rubik-arabic.woff2": rubikArabic,
  "source-sans-3.woff2": sourceSans3,
  "source-serif-4.woff2": sourceSerif4,
  "space-grotesk.woff2": spaceGrotesk,
  "tasa-orbiter.woff2": tasaOrbiter,
  "vollkorn.woff2": vollkorn,
  "zalando-sans-expanded.woff2": zalandoSansExpanded,
  "zalando-sans.woff2": zalandoSans,
};

/** skill/preview-kit/fonts/fonts.css: relative URLs, so it works from /__motif/kit/fonts/ and from a copied kit alike. */
export const FONTS_CSS: string = fontsCss;
