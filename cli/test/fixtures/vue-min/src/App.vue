<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
import { strings } from "./strings";
</script>

<template>
  <div class="min-h-screen bg-background font-body text-body text-text-primary">
    <nav class="flex gap-2 border-b border-border px-2 text-label">
      <RouterLink to="/" class="inline-flex min-h-11 items-center px-2 text-action-primary">{{ strings.home }}</RouterLink>
      <RouterLink to="/settings" class="inline-flex min-h-11 items-center px-2 text-action-primary">{{ strings.settings }}</RouterLink>
    </nav>
    <RouterView />
  </div>
</template>
