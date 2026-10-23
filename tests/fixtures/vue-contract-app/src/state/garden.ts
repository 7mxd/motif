// What a member does in this visit, in memory: the plot they booked, the waiting lists they joined and their harvest log.
import { reactive } from "vue";

export interface HarvestEntry {
  id: number;
  cropId: string;
  kg: number;
  on: Date;
}

export const garden = reactive({
  bookedPlotId: null as string | null,
  waitingFor: [] as string[],
  harvest: [] as HarvestEntry[],
});

export function bookPlot(id: string): void {
  garden.bookedPlotId = id;
}

export function joinWaitingList(id: string): void {
  if (!garden.waitingFor.includes(id)) garden.waitingFor.push(id);
}

/** Newest first, as the log shows it. */
export function logHarvest(cropId: string, kg: number): void {
  garden.harvest.unshift({ id: Date.now(), cropId, kg, on: new Date() });
}

export const seasonTotal = (): number => garden.harvest.reduce((sum, e) => sum + e.kg, 0);
