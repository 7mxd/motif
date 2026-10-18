import alexandriaArabic from "../../../skill/preview-kit/fonts/alexandria-arabic.woff2" with { type: "file" };
import balooBhaijaan2Arabic from "../../../skill/preview-kit/fonts/baloo-bhaijaan-2-arabic.woff2" with { type: "file" };
import changaArabic from "../../../skill/preview-kit/fonts/changa-arabic.woff2" with { type: "file" };
import elMessiriArabic from "../../../skill/preview-kit/fonts/el-messiri-arabic.woff2" with { type: "file" };
import fontsCss from "../../../skill/preview-kit/fonts/fonts.css" with { type: "text" };
import fredoka from "../../../skill/preview-kit/fonts/fredoka.woff2" with { type: "file" };
import geologica from "../../../skill/preview-kit/fonts/geologica.woff2" with { type: "file" };
import madaArabic from "../../../skill/preview-kit/fonts/mada-arabic.woff2" with { type: "file" };
import markaziTextArabic from "../../../skill/preview-kit/fonts/markazi-text-arabic.woff2" with { type: "file" };
import merriweatherSans from "../../../skill/preview-kit/fonts/merriweather-sans.woff2" with { type: "file" };
import notoSerifDisplay from "../../../skill/preview-kit/fonts/noto-serif-display.woff2" with { type: "file" };
import nunito from "../../../skill/preview-kit/fonts/nunito.woff2" with { type: "file" };
import onest from "../../../skill/preview-kit/fonts/onest.woff2" with { type: "file" };
import publicSans from "../../../skill/preview-kit/fonts/public-sans.woff2" with { type: "file" };
import readexProArabic from "../../../skill/preview-kit/fonts/readex-pro-arabic.woff2" with { type: "file" };
import rubikArabic from "../../../skill/preview-kit/fonts/rubik-arabic.woff2" with { type: "file" };
import sourceSerif4 from "../../../skill/preview-kit/fonts/source-serif-4.woff2" with { type: "file" };
import tasaOrbiter from "../../../skill/preview-kit/fonts/tasa-orbiter.woff2" with { type: "file" };
import vollkorn from "../../../skill/preview-kit/fonts/vollkorn.woff2" with { type: "file" };
import zalandoSans from "../../../skill/preview-kit/fonts/zalando-sans.woff2" with { type: "file" };
import zalandoSansExpanded from "../../../skill/preview-kit/fonts/zalando-sans-expanded.woff2" with { type: "file" };

/** Font file name → a path Bun.file() reads, in the source tree or inside the compiled tool. */
export const EMBEDDED_FONT_FILES: Record<string, string> = {
  "alexandria-arabic.woff2": alexandriaArabic,
  "baloo-bhaijaan-2-arabic.woff2": balooBhaijaan2Arabic,
  "changa-arabic.woff2": changaArabic,
  "el-messiri-arabic.woff2": elMessiriArabic,
  "fredoka.woff2": fredoka,
  "geologica.woff2": geologica,
  "mada-arabic.woff2": madaArabic,
  "markazi-text-arabic.woff2": markaziTextArabic,
  "merriweather-sans.woff2": merriweatherSans,
  "noto-serif-display.woff2": notoSerifDisplay,
  "nunito.woff2": nunito,
  "onest.woff2": onest,
  "public-sans.woff2": publicSans,
  "readex-pro-arabic.woff2": readexProArabic,
  "rubik-arabic.woff2": rubikArabic,
  "source-serif-4.woff2": sourceSerif4,
  "tasa-orbiter.woff2": tasaOrbiter,
  "vollkorn.woff2": vollkorn,
  "zalando-sans-expanded.woff2": zalandoSansExpanded,
  "zalando-sans.woff2": zalandoSans,
};

/** skill/preview-kit/fonts/fonts.css: relative URLs, so it works from /__motif/kit/fonts/ and from a copied kit alike. */
export const FONTS_CSS: string = fontsCss;
