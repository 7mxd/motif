// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  // The theme Motif writes (motif tokens), then the app's own fonts.
  css: ["~/assets/css/motif.css", "~/assets/css/main.css"],
});
