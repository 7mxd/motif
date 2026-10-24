<script setup lang="ts">
const strings = useStrings();
</script>

<template>
  <main>
    <h1>{{ strings.pantry }}</h1>
    <section class="card">
      <p>{{ strings.items }}</p>
    </section>
    <button class="add">{{ strings.add }}</button>
  </main>
</template>

<style scoped>
.card {
  padding: var(--motif-space-4);
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-surface);
  box-shadow: var(--motif-shadow-sm);
  color: var(--motif-color-text-secondary);
}

.card p {
  margin: 0;
}

.add {
  align-self: flex-start;
  min-height: 44px;
  padding: var(--motif-space-3) var(--motif-space-4);
  border: 0;
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-action-primary);
  color: var(--motif-color-on-action-primary);
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
  font-weight: var(--motif-font-label-weight);
}
</style>
