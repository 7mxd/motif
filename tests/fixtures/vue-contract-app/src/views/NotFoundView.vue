<script setup lang="ts">
import AppButton from "../components/AppButton.vue";
import EmptyState from "../components/EmptyState.vue";
import { strings } from "../i18n/strings";
</script>

<template>
  <EmptyState level="h1" :title="strings.pageMissing" :body="strings.pageMissingHint">
    <AppButton to="/">{{ strings.seePlots }}</AppButton>
  </EmptyState>
</template>
