<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { duration, easing, spring } from "../design/motion";
import AppIcon from "./AppIcon.vue";

// The confirmation under a plot's actions. It rises into place; with reduced motion it only fades (App.vue's MotionConfig).
defineProps<{ show: boolean; title: string; body?: string }>();
</script>

<template>
  <div aria-live="polite">
    <AnimatePresence>
      <motion.div
        v-if="show"
        class="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-md"
        :initial="{ opacity: 0, y: 12 }"
        :animate="{ opacity: 1, y: 0, transition: spring.smooth }"
        :exit="{ opacity: 0, transition: { duration: duration.fast, ease: easing.exit } }"
      >
        <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-on-success">
          <AppIcon name="check" />
        </span>
        <div class="flex flex-col gap-1">
          <p class="font-label text-label">{{ title }}</p>
          <p v-if="body" class="text-text-secondary">{{ body }}</p>
        </div>
      </motion.div>
    </AnimatePresence>
  </div>
</template>
