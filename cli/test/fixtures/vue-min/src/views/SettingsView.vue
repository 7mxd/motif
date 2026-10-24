<script setup lang="ts">
import { ref } from "vue";
import { strings } from "../strings";

const name = ref("");
</script>

<template>
  <main class="flex flex-col gap-4 p-4">
    <h1 class="font-title text-title">{{ strings.settings }}</h1>
    <label class="flex flex-col gap-2">
      <span class="font-label text-label">{{ strings.name }}</span>
      <input v-model="name" :aria-label="strings.name" class="rounded-md border border-border bg-surface p-3 text-text-primary" />
    </label>
    <p v-if="name" class="text-text-secondary">{{ strings.hello }} {{ name }}</p>
  </main>
</template>
