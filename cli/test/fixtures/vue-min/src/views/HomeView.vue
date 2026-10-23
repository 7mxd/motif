<script setup lang="ts">
import { strings } from "../strings";
</script>

<template>
  <main class="flex flex-col gap-4 p-4">
    <h1 class="font-title text-title">{{ strings.pantry }}</h1>
    <section class="rounded-md bg-surface p-4 shadow-sm">
      <p class="text-text-secondary">{{ strings.items }}</p>
    </section>
    <button class="self-start rounded-md bg-action-primary px-4 py-3 font-label text-label text-on-action-primary">{{ strings.add }}</button>
  </main>
</template>
