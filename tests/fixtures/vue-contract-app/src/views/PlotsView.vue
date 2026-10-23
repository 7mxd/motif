<script setup lang="ts">
import PlotCard from "../components/PlotCard.vue";
import { number, strings } from "../i18n/strings";
import { plots } from "../mock-data";

const free = plots.filter((p) => p.status === "free").length;
</script>

<template>
  <div class="flex flex-col gap-8">
    <header class="flex max-w-2xl flex-col gap-3">
      <h1 class="font-title text-title">{{ strings.plotsTitle }}</h1>
      <p class="text-text-secondary">{{ strings.plotsIntro }}</p>
      <p class="font-label text-label">{{ strings.freeCount(number(free), number(plots.length)) }}</p>
    </header>
    <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="plot in plots" :key="plot.id">
        <PlotCard :plot="plot" />
      </li>
    </ul>
  </div>
</template>
