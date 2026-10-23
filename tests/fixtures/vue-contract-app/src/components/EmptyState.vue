<script setup lang="ts">
import AppIcon, { type IconName } from "./AppIcon.vue";

// Nothing here yet, or nothing found: a title, one line and one action (the default slot).
withDefaults(defineProps<{ title: string; body: string; icon?: IconName; level?: "h1" | "h2" }>(), { icon: "leaf", level: "h2" });
</script>

<template>
  <div class="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-6 py-10 text-center">
    <span class="flex size-12 items-center justify-center rounded-full bg-action-secondary text-on-action-secondary">
      <AppIcon :name="icon" />
    </span>
    <div class="flex max-w-sm flex-col gap-2">
      <component :is="level" class="font-heading text-heading">{{ title }}</component>
      <p class="text-text-secondary">{{ body }}</p>
    </div>
    <slot />
  </div>
</template>
