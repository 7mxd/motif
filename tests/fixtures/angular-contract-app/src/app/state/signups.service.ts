import { Injectable, computed, signal } from '@angular/core';
import { findShift, shifts, type Shift } from '../mock-data';

/**
 * The shifts a volunteer signs up for and the waiting lists they join in this visit, in memory. Only clicks change
 * them, so every visit starts with none.
 */
@Injectable({ providedIn: 'root' })
export class SignupsService {
  private readonly held = signal<string[]>([]);
  private readonly waiting = signal<string[]>([]);

  /** Soonest first, as My shifts lists them. */
  readonly mine = computed(() =>
    this.held()
      .map((id) => findShift(id)!)
      .sort((a, b) => a.starts.getTime() - b.starts.getTime()),
  );

  /** Shifts with a place for one more, counting the volunteer's own. */
  readonly openCount = computed(() => shifts.filter((s) => s.places - s.taken - (this.holds(s.id) ? 1 : 0) > 0).length);

  holds = (id: string): boolean => this.held().includes(id);
  isWaiting = (id: string): boolean => this.waiting().includes(id);

  signUp(shift: Shift): void {
    if (!this.holds(shift.id)) this.held.update((ids) => [...ids, shift.id]);
  }

  joinWaitlist(shift: Shift): void {
    if (!this.isWaiting(shift.id)) this.waiting.update((ids) => [...ids, shift.id]);
  }

  withdraw(id: string): void {
    this.held.update((ids) => ids.filter((x) => x !== id));
  }
}
