<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "../components/AppButton.vue";
import TextField from "../components/TextField.vue";
import { strings } from "../i18n/strings";

const email = ref("");
const tried = ref(false);
const sentTo = ref<string | null>(null);

const error = computed(() => (tried.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) ? strings.emailError : undefined));

function send(): void {
  tried.value = true;
  if (error.value) return;
  sentTo.value = email.value.trim();
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-6">
    <header class="flex flex-col gap-3">
      <h1 class="font-title text-title" style="font-family: Arial, sans-serif">{{ strings.signInTitle }}</h1>
      <p class="text-text-secondary">{{ strings.signInIntro }}</p>
    </header>
    <form class="flex flex-col gap-5 rounded-lg border border-border bg-surface p-6" novalidate @submit.prevent="send">
      <TextField
        v-model="email"
        name="email"
        type="email"
        :label="strings.email"
        :hint="strings.emailHint"
        :error="error"
        autocomplete="email"
        inputmode="email"
        enterkeyhint="send"
      />
      <AppButton type="submit">{{ strings.sendLink }}</AppButton>
      <p class="font-caption text-caption text-text-secondary opacity-50">{{ strings.emailUse }}</p>
    </form>
    <p v-if="sentTo" role="status" class="rounded-lg border border-border bg-surface-raised p-4">{{ strings.linkSent(sentTo) }}</p>
  </div>
</template>
