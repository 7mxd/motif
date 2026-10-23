<script setup lang="ts">
import { useId } from "vue";

// One line of text, with its label above and its hint or error below, in words.
defineProps<{
  label: string;
  name: string;
  hint?: string;
  error?: string;
  type?: "text" | "email";
  autocomplete?: string;
  inputmode?: "text" | "email" | "decimal";
  enterkeyhint?: "done" | "next" | "send";
}>();
const value = defineModel<string>({ required: true });
const id = useId();
</script>

<template>
  <div class="flex flex-col gap-2">
    <label :for="id" class="font-label text-label">{{ label }}</label>
    <input
      :id="id"
      v-model="value"
      class="field"
      :type="type ?? 'text'"
      :name="name"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :enterkeyhint="enterkeyhint"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="`${id}-note`"
    />
    <p v-if="error" :id="`${id}-note`" class="font-caption text-caption text-danger">{{ error }}</p>
    <p v-else :id="`${id}-note`" class="font-caption text-caption text-text-secondary">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field {
  min-block-size: var(--motif-space-12);
  padding-inline: var(--motif-space-3);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-surface);
  color: var(--motif-color-text-primary);
  font: inherit;
}
.field:focus-visible {
  outline: 2px solid var(--motif-color-focus);
  outline-offset: 1px;
  border-color: var(--motif-color-focus);
}
.field[aria-invalid="true"] {
  border-color: var(--motif-color-danger);
}
</style>
