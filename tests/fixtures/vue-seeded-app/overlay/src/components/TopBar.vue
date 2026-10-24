<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { strings } from "../i18n/strings";
import AppIcon from "./AppIcon.vue";

const route = useRoute();
// A plot's page belongs to Plots.
const current = computed(() => (route.path.startsWith("/harvest") ? "harvest" : route.path === "/" || route.path.startsWith("/plots/") ? "plots" : null));
const tabs = [
  { id: "plots", to: "/", label: strings.navPlots },
  { id: "harvest", to: "/harvest", label: strings.navHarvest },
];
</script>

<template>
  <header class="border-b border-border bg-surface">
    <div class="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-8 px-4 md:flex-nowrap md:px-8">
      <RouterLink to="/" class="brand" :aria-label="strings.home">
        <AppIcon name="leaf" />
        <span class="brand-name">{{ strings.appName }}</span>
      </RouterLink>
      <nav :aria-label="strings.mainNav" class="order-last w-full md:order-none md:w-auto md:flex-1">
        <ul class="flex gap-6">
          <li v-for="tab in tabs" :key="tab.id">
            <RouterLink :to="tab.to" class="tab" :class="{ 'tab-current': current === tab.id }" :aria-current="current === tab.id ? 'page' : undefined">
              {{ tab.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>
      <RouterLink to="/sign-in" class="ms-auto inline-flex size-12 items-center justify-center rounded-full md:ms-0"><AppIcon name="user" /></RouterLink>
    </div>
  </header>
</template>

<style scoped>
.brand {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--motif-space-16);
  color: var(--motif-color-action-primary);
  text-decoration: none;
}
.brand-name {
  margin-left: var(--motif-space-2);
  font-family: var(--motif-font-heading-family);
  font-size: var(--motif-font-heading-size);
  font-weight: var(--motif-font-heading-weight);
  line-height: var(--motif-font-heading-line-height);
  color: var(--motif-color-text-primary);
}
.tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-block-size: var(--motif-space-12);
  min-inline-size: var(--motif-space-12);
  border-block-end: 2px solid transparent;
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
  font-weight: var(--motif-font-label-weight);
  color: var(--motif-color-text-secondary);
  text-decoration: none;
  transition: color var(--motif-duration-fast) var(--motif-easing-standard);
}
@media (hover: hover) {
  .tab:hover {
    color: var(--motif-color-text-primary);
  }
}
.tab-current {
  border-block-end-color: var(--motif-color-action-primary);
  color: var(--motif-color-text-primary);
}
</style>
