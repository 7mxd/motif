import { createApp } from "vue";
import App from "./App.vue";
import { locale } from "./i18n/strings";
import { gardenSeason } from "./mock-data";
import router from "./router";
import "./assets/main.css";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/700.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/700.css";

const html = document.documentElement;
html.lang = locale;
html.dir = locale === "ar" ? "rtl" : "ltr";
// The harvest weeks have their own look (DESIGN.md, Variants), chosen before the first paint.
if (gardenSeason === "harvest") html.dataset.variant = "harvest";

createApp(App).use(router).mount("#app");
