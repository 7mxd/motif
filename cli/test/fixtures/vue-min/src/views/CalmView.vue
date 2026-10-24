<script setup lang="ts">
import { motion, useReducedMotion } from "motion-v";

// The same loop, still when the viewer asks for reduced motion.
const reduce = useReducedMotion();
</script>

<template>
  <main class="flex flex-col gap-4 p-4">
    <h1 class="font-title text-title">Calm</h1>
    <motion.div class="size-8 rounded-sm bg-action-primary" :animate="reduce ? {} : { rotate: 360 }" :transition="{ duration: 1, repeat: Infinity, ease: 'linear' }" />
  </main>
</template>
