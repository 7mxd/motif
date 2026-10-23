import { createRouter, createWebHistory } from "vue-router";
import PlotsView from "../views/PlotsView.vue";

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "plots", component: PlotsView },
    { path: "/plots/:id", name: "plot", component: () => import("../views/PlotView.vue"), props: true },
    { path: "/harvest", name: "harvest", component: () => import("../views/HarvestView.vue") },
    { path: "/sign-in", name: "sign-in", component: () => import("../views/SignInView.vue") },
    { path: "/:missing(.*)*", name: "missing", component: () => import("../views/NotFoundView.vue") },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
