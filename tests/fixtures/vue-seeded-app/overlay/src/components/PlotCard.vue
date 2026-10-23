<script setup lang="ts">
import { RouterLink } from "vue-router";
import { dinars, number, strings, words } from "../i18n/strings";
import type { Plot } from "../mock-data";
import AppIcon from "./AppIcon.vue";
import StatusBadge from "./StatusBadge.vue";

defineProps<{ plot: Plot }>();
</script>

<template>
  <RouterLink :to="`/plots/${plot.id}`" class="card flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-1">
    <div class="flex items-start justify-between gap-1">
      <div class="flex min-w-0 flex-col">
        <p class="font-caption text-caption text-text-secondary">{{ strings.plotNumber(number(plot.number)) }}</p>
        <h2 class="truncate font-heading text-heading">{{ words(plot.name) }}</h2>
      </div>
      <StatusBadge :status="plot.status" />
    </div>
    <p class="flex items-center gap-1 truncate text-text-secondary"><AppIcon name="drop" />{{ words(plot.water) }}</p>
    <p class="mt-auto font-label text-label">{{ strings.perSeason(dinars(plot.fee)) }}</p>
  </RouterLink>
</template>

<style scoped>
.card {
  color: var(--motif-color-text-primary);
  text-decoration: none;
  transition: border-color var(--motif-duration-fast) var(--motif-easing-standard);
}
@media (hover: hover) {
  .card:hover {
    border-color: var(--motif-color-action-primary);
  }
}
.card:focus-visible {
  outline: 2px solid var(--motif-color-focus);
  outline-offset: 2px;
}
</style>
