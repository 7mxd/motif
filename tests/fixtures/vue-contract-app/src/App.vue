<script setup lang="ts">
import { MotionConfig } from "motion-v";
import { RouterView } from "vue-router";
import TopBar from "./components/TopBar.vue";
</script>

<template>
  <MotionConfig reduced-motion="user">
    <TopBar />
    <main class="mx-auto w-full max-w-5xl px-4 pt-8 pb-16 md:px-8">
      <RouterView />
    </main>
  </MotionConfig>
</template>
