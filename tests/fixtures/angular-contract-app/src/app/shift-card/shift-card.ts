import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '../i18n/locale.service';
import { Icon } from '../icon/icon';
import { statusOf, type Shift } from '../mock-data';
import { SignupsService } from '../state/signups.service';
import { StatusBadge } from '../status-badge/status-badge';

/** A shift in the list: the whole card is a link to its page. */
@Component({
  selector: 'app-shift-card',
  imports: [Icon, RouterLink, StatusBadge],
  templateUrl: './shift-card.html',
  styleUrl: './shift-card.css',
})
export class ShiftCard {
  readonly shift = input.required<Shift>();
  protected readonly locale = inject(LocaleService);
  private readonly signups = inject(SignupsService);
  /** Places left, counting the volunteer's own sign-up. */
  protected readonly left = computed(() => this.shift().places - this.shift().taken - (this.signups.holds(this.shift().id) ? 1 : 0));
  protected readonly status = computed(() => statusOf(this.shift(), this.signups.holds(this.shift().id) ? 1 : 0));
}
