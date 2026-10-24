import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import SettingsView from "../views/SettingsView.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomeView },
    { path: "/settings", component: SettingsView },
    // Planted problems for motif shot --audit, and the loop that respects reduced motion.
    { path: "/audit", component: () => import("../views/AuditView.vue") },
    { path: "/calm", component: () => import("../views/CalmView.vue") },
  ],
});
