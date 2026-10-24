<script setup lang="ts">
import { computed } from "vue";
import { strings } from "../i18n/strings";
import type { PlotStatus } from "../mock-data";

const props = defineProps<{ status: PlotStatus }>();

// A word beside the colour, always: the colour alone never says the status.
const label = computed(() => ({ free: strings.statusFree, waiting: strings.statusWaiting, booked: strings.statusBooked })[props.status]);
</script>

<template>
  <span class="badge" :class="`badge-${status}`">{{ label }}</span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  padding-block: var(--motif-space-1);
  padding-inline: var(--motif-space-2);
  border: 1px solid transparent;
  border-radius: var(--motif-radius-sm);
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-caption-size);
  font-weight: var(--motif-font-label-weight);
  line-height: var(--motif-font-caption-line-height);
  white-space: nowrap;
}
.badge-free {
  background: var(--motif-color-success);
  color: var(--motif-color-on-success);
}
.badge-waiting {
  background: var(--motif-color-warning);
  color: var(--motif-color-on-warning);
}
.badge-booked {
  border-color: var(--motif-color-border);
  color: var(--motif-color-text-secondary);
}
</style>
