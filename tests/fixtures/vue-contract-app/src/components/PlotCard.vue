<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { dinars, number, strings, words } from "../i18n/strings";
import type { Light, Plot } from "../mock-data";
import AppIcon, { type IconName } from "./AppIcon.vue";
import StatusBadge from "./StatusBadge.vue";

const props = defineProps<{ plot: Plot }>();

const LIGHT_ICONS: Record<Light, IconName> = { full: "sun", part: "part-sun", shade: "shade" };
const light = computed(() => ({ full: strings.lightFull, part: strings.lightPart, shade: strings.lightShade })[props.plot.light]);
const lightIcon = computed(() => LIGHT_ICONS[props.plot.light]);
</script>

<template>
  <RouterLink :to="`/plots/${plot.id}`" class="card flex h-full flex-col gap-4 rounded-lg border border-border bg-surface p-5">
    <div class="flex items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <p class="font-caption text-caption text-text-secondary">{{ strings.plotNumber(number(plot.number)) }}</p>
        <h2 class="font-heading text-heading">{{ words(plot.name) }}</h2>
      </div>
      <StatusBadge :status="plot.status" />
    </div>
    <ul class="flex flex-col gap-2 text-text-secondary">
      <li class="flex items-center gap-2"><AppIcon name="ruler" />{{ strings.size(number(plot.size)) }}</li>
      <li class="flex items-center gap-2"><AppIcon :name="lightIcon" />{{ light }}</li>
      <li class="flex items-center gap-2"><AppIcon name="drop" />{{ words(plot.water) }}</li>
    </ul>
    <p class="mt-auto border-t border-border pt-4 font-label text-label">{{ strings.perSeason(dinars(plot.fee)) }}</p>
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
