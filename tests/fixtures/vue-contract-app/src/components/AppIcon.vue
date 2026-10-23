<script lang="ts">
export type IconName = "back" | "leaf" | "sun" | "part-sun" | "shade" | "drop" | "ruler" | "user" | "basket" | "check";
</script>

<script setup lang="ts">
const props = defineProps<{ name: IconName }>();

// Line icons on a 24-unit grid, drawn in the text colour.
const PATHS: Record<IconName, string[]> = {
  back: ["M19 12H5", "M11 6l-6 6 6 6"],
  leaf: ["M5 19c0-8 5.5-14 14-14 0 8.5-6 14-14 14Z", "M5 19l8-8"],
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"],
  "part-sun": ["M9.5 4.5a4.5 4.5 0 0 1 4.3 3.2", "M5.2 7.6A4.5 4.5 0 0 0 5 9", "M9.5 1.5v1", "M3.2 3.2l.7.7", "M8 20h9a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.5 1.7A3.2 3.2 0 0 0 8 20Z"],
  shade: ["M7 19h10a4.5 4.5 0 0 0 .7-9 6 6 0 0 0-11.4 1.9A3.6 3.6 0 0 0 7 19Z"],
  drop: ["M12 3c3.2 4 6 7.2 6 11a6 6 0 0 1-12 0c0-3.8 2.8-7 6-11Z"],
  ruler: ["M3 16.5 16.5 3 21 7.5 7.5 21Z", "M7.5 12l2 2", "M10.5 9l2 2", "M13.5 6l2 2"],
  user: ["M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M4 21c.9-3.6 4.2-6 8-6s7.1 2.4 8 6"],
  basket: ["M3 10h18l-2 10H5Z", "M8 10l4-6 4 6", "M9 14v3", "M15 14v3"],
  check: ["M5 12.5l4.5 4.5L19 7"],
};

// Icons that point a direction turn round in right-to-left languages.
const mirrored = props.name === "back";
</script>

<template>
  <svg
    class="size-5 shrink-0"
    :class="{ 'rtl:-scale-x-100': mirrored }"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="d in PATHS[name]" :key="d" :d="d" />
  </svg>
</template>
