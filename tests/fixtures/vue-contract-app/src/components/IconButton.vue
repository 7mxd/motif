<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from "vue-router";
import AppIcon, { type IconName } from "./AppIcon.vue";

// An icon-only control: always named, always 48 px square. `to` makes it a link.
defineProps<{ icon: IconName; label: string; to?: RouteLocationRaw }>();
</script>

<template>
  <RouterLink v-if="to" :to="to" class="icon-button" :aria-label="label"><AppIcon :name="icon" /></RouterLink>
  <button v-else type="button" class="icon-button" :aria-label="label"><AppIcon :name="icon" /></button>
</template>

<style scoped>
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--motif-space-12);
  block-size: var(--motif-space-12);
  flex-shrink: 0;
  border: 0;
  border-radius: var(--motif-radius-full);
  background: transparent;
  color: var(--motif-color-text-primary);
  cursor: pointer;
  transition: background-color var(--motif-duration-fast) var(--motif-easing-standard);
}
@media (hover: hover) {
  .icon-button:hover {
    background: var(--motif-color-action-secondary);
  }
}
.icon-button:active {
  background: var(--motif-color-action-secondary);
}
.icon-button:focus-visible {
  outline: 2px solid var(--motif-color-focus);
  outline-offset: 2px;
}
</style>
