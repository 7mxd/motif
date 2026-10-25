import { Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Button } from '../button/button';
import { EmptyState } from '../empty-state/empty-state';
import { LocaleService } from '../i18n/locale.service';
import { Icon } from '../icon/icon';
import { IconButton } from '../icon-button/icon-button';
import { COORDINATOR, findShift, statusOf } from '../mock-data';
import { SignupNote } from '../signup-note/signup-note';
import { SignupsService } from '../state/signups.service';
import { StatusBadge } from '../status-badge/status-badge';

/** A shift's page (/shifts/:id): when and where, what to bring, and signing up. */
@Component({
  selector: 'app-shift-page',
  imports: [Button, EmptyState, Icon, IconButton, RouterLink, SignupNote, StatusBadge],
  templateUrl: './shift.html',
  styleUrl: './shift.css',
})
export class ShiftPage {
  /** From the route's :id (withComponentInputBinding). */
  readonly id = input.required<string>();
  protected readonly locale = inject(LocaleService);
  protected readonly signups = inject(SignupsService);
  protected readonly coordinator = COORDINATOR;
  protected readonly shift = computed(() => findShift(this.id()));
  protected readonly held = computed(() => this.signups.holds(this.id()));
  protected readonly waiting = computed(() => this.signups.isWaiting(this.id()));
  /** Places left, counting the volunteer's own sign-up. */
  protected readonly left = computed(() => {
    const shift = this.shift();
    return shift ? shift.places - shift.taken - (this.held() ? 1 : 0) : 0;
  });
  protected readonly status = computed(() => {
    const shift = this.shift();
    return shift ? statusOf(shift, this.held() ? 1 : 0) : 'full';
  });

  constructor() {
    const title = inject(Title);
    effect(() => {
      const t = this.locale.t();
      const shift = this.shift();
      title.setTitle(`${shift ? this.locale.f().words(shift.name) : t.shiftMissing} · ${t.appName}`);
    });
  }
}
