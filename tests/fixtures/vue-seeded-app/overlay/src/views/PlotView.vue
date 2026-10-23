<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import BookingNote from "../components/BookingNote.vue";
import EmptyState from "../components/EmptyState.vue";
import StatusBadge from "../components/StatusBadge.vue";
import { day, dinars, number, strings, words } from "../i18n/strings";
import { findPlot, seasonEnds } from "../mock-data";
import { bookPlot, garden, joinWaitingList } from "../state/garden";

const props = defineProps<{ id: string }>();

const plot = computed(() => findPlot(props.id));
const booked = computed(() => garden.bookedPlotId === props.id);
const waiting = computed(() => garden.waitingFor.includes(props.id));
const light = computed(() => (plot.value ? { full: strings.lightFull, part: strings.lightPart, shade: strings.lightShade }[plot.value.light] : ""));
const TEAM = "mailto:team@bustan.example";
</script>

<template>
  <article v-if="plot" class="flex flex-col gap-8">
    <header class="flex flex-col gap-4">
      <RouterLink to="/" class="inline-flex size-8 items-center justify-center rounded-full" :aria-label="strings.back"><AppIcon name="back" /></RouterLink>
      <div class="flex flex-col gap-2">
        <p class="font-label text-label text-text-secondary">{{ strings.plotNumber(number(plot.number)) }}</p>
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="font-title text-title">{{ words(plot.name) }}</h1>
          <StatusBadge :status="booked ? 'booked' : plot.status" />
        </div>
        <p class="description text-text-secondary">{{ strings.plotIntro }}</p>
      </div>
    </header>

    <div class="grid gap-8 md:grid-cols-5">
      <section class="details flex flex-col gap-4 rounded-lg border border-border bg-surface md:col-span-3" aria-labelledby="about">
        <h2 id="about" class="font-heading text-heading">{{ strings.aboutPlot }}</h2>
        <dl class="flex flex-col">
          <div class="row">
            <dt class="flex items-center gap-2 text-text-secondary"><AppIcon name="ruler" />{{ strings.sizeLabel }}</dt>
            <dd>{{ strings.size(number(plot.size)) }}</dd>
          </div>
          <div class="row">
            <dt class="flex items-center gap-2 text-text-secondary"><AppIcon name="sun" />{{ strings.lightLabel }}</dt>
            <dd>{{ light }}</dd>
          </div>
          <div class="row">
            <dt class="flex items-center gap-2 text-text-secondary"><AppIcon name="drop" />{{ strings.waterLabel }}</dt>
            <dd>{{ words(plot.water) }}</dd>
          </div>
          <div class="row">
            <dt class="flex items-center gap-2 text-text-secondary"><AppIcon name="leaf" />{{ strings.soilLabel }}</dt>
            <dd>{{ words(plot.soil) }}</dd>
          </div>
          <div class="row">
            <dt class="flex items-center gap-2 text-text-secondary"><AppIcon name="basket" />{{ strings.lastSeasonLabel }}</dt>
            <dd>{{ words(plot.lastSeason) }}</dd>
          </div>
        </dl>
      </section>

      <aside class="flex flex-col gap-4 md:col-span-2">
        <p class="font-heading text-heading">{{ strings.perSeason(dinars(plot.fee)) }}</p>
        <template v-if="plot.status === 'free'">
          <AppButton :disabled="booked" @click="bookPlot(plot.id)">{{ strings.bookPlot }}</AppButton>
          <AppButton :href="TEAM">{{ strings.askTeam }}</AppButton>
          <BookingNote :show="booked" :title="strings.bookedNote(words(plot.name), day(seasonEnds))" :body="strings.bookedHint" />
        </template>
        <template v-else-if="plot.status === 'waiting'">
          <AppButton :disabled="waiting" @click="joinWaitingList(plot.id)">{{ strings.joinWaitingList }}</AppButton>
          <AppButton variant="secondary" :href="TEAM">{{ strings.askTeam }}</AppButton>
          <BookingNote :show="waiting" :title="strings.waitingNote" />
        </template>
        <template v-else>
          <p class="text-text-secondary">{{ strings.bookedByOther }}</p>
          <AppButton variant="secondary" :href="TEAM">{{ strings.askTeam }}</AppButton>
        </template>
      </aside>
    </div>
  </article>

  <EmptyState v-else level="h1" :title="strings.plotMissing" :body="strings.plotMissingHint">
    <AppButton to="/">{{ strings.seePlots }}</AppButton>
  </EmptyState>
</template>

<style scoped>
.details {
  padding: 18px;
}
.description {
  max-inline-size: 40rem;
  font-size: 15px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--motif-space-1) var(--motif-space-4);
  padding-block: var(--motif-space-3);
  border-block-end: 1px solid var(--motif-color-border);
}
.row:last-child {
  border-block-end: 0;
}
</style>
