<script setup lang="ts">
const strings = useStrings();
const name = ref("");
</script>

<template>
  <main>
    <h1>{{ strings.settings }}</h1>
    <label class="field">
      <span>{{ strings.name }}</span>
      <input v-model="name" :aria-label="strings.name" />
    </label>
    <p v-if="name" class="hello">{{ strings.hello }} {{ name }}</p>
  </main>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--motif-space-2);
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
}

.field input {
  padding: var(--motif-space-3);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-surface);
  color: var(--motif-color-text-primary);
  font: inherit;
}

.hello {
  margin: 0;
  color: var(--motif-color-text-secondary);
}
</style>
