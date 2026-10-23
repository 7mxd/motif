<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "../components/AppButton.vue";
import EmptyState from "../components/EmptyState.vue";
import TextField from "../components/TextField.vue";
import { day, kilograms, strings, words } from "../i18n/strings";
import { crops, findCrop } from "../mock-data";
import { garden, logHarvest, seasonTotal } from "../state/garden";

const cropId = ref("");
const weight = ref("");
const tried = ref(false);

// Arabic-Indic digits and a decimal comma are read as well as 0-9 and a point.
const kg = computed(() => Number(weight.value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[٫,]/, ".")));
const cropError = computed(() => (tried.value && !cropId.value ? strings.cropError : undefined));
const weightError = computed(() => (tried.value && !(kg.value >= 0.1 && kg.value <= 50) ? strings.weightError : undefined));

function add(): void {
  tried.value = true;
  if (cropError.value || weightError.value) return;
  logHarvest(cropId.value, Math.round(kg.value * 10) / 10);
  cropId.value = "";
  weight.value = "";
  tried.value = false;
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <header class="flex max-w-2xl flex-col gap-3">
      <h1 class="font-title text-title">{{ strings.harvestTitle }}</h1>
      <p class="text-text-secondary">{{ strings.harvestIntro }}</p>
    </header>

    <div class="grid items-start gap-8 md:grid-cols-5">
      <form class="flex flex-col gap-5 rounded-lg border border-border bg-surface p-6 md:col-span-2" novalidate @submit.prevent="add">
        <h2 class="font-heading text-heading">{{ strings.addHarvest }}</h2>
        <div class="flex flex-col gap-2">
          <label for="crop" class="font-label text-label">{{ strings.crop }}</label>
          <select id="crop" v-model="cropId" name="crop" class="select" :aria-invalid="cropError ? 'true' : undefined" aria-describedby="crop-note">
            <option value="" disabled>{{ strings.chooseCrop }}</option>
            <option v-for="crop in crops" :key="crop.id" :value="crop.id">{{ words(crop.name) }}</option>
          </select>
          <p v-if="cropError" id="crop-note" class="font-caption text-caption text-danger">{{ cropError }}</p>
        </div>
        <TextField
          v-model="weight"
          name="weight"
          :label="strings.weight"
          :hint="strings.weightHint"
          :error="weightError"
          inputmode="decimal"
          autocomplete="off"
          enterkeyhint="done"
        />
        <AppButton type="submit">{{ strings.addToLog }}</AppButton>
      </form>

      <section class="flex flex-col gap-4 md:col-span-3" aria-labelledby="season">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="season" class="font-heading text-heading">{{ strings.thisSeason }}</h2>
          <p v-if="garden.harvest.length > 0" class="font-label text-label">{{ strings.seasonTotal(kilograms(seasonTotal())) }}</p>
        </div>
        <ul v-if="garden.harvest.length > 0" class="flex flex-col rounded-lg border border-border bg-surface">
          <li v-for="entry in garden.harvest" :key="entry.id" class="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-b-0">
            <div class="flex flex-col">
              <span>{{ words(findCrop(entry.cropId)!.name) }}</span>
              <span class="font-caption text-caption text-text-secondary">{{ day(entry.on) }}</span>
            </div>
            <span class="font-label text-label">{{ kilograms(entry.kg) }}</span>
          </li>
        </ul>
        <EmptyState v-else icon="basket" :title="strings.logEmpty" :body="strings.logEmptyHint">
          <AppButton variant="secondary" to="/">{{ strings.seePlots }}</AppButton>
        </EmptyState>
      </section>
    </div>
  </div>
</template>

<style scoped>
.select {
  min-block-size: var(--motif-space-12);
  padding-inline: var(--motif-space-3);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-surface);
  color: var(--motif-color-text-primary);
  font: inherit;
}
.select:focus-visible {
  outline: 2px solid var(--motif-color-focus);
  outline-offset: 1px;
  border-color: var(--motif-color-focus);
}
.select[aria-invalid="true"] {
  border-color: var(--motif-color-danger);
}
</style>
