import { Component, computed, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { LocaleService } from '../i18n/locale.service';
import { shifts } from '../mock-data';
import { ShiftCard } from '../shift-card/shift-card';
import { SignupsService } from '../state/signups.service';

/** The open shifts: every shift this week, and how volunteering works. */
@Component({
  selector: 'app-shifts',
  imports: [ShiftCard],
  templateUrl: './shifts.html',
})
export class Shifts {
  protected readonly locale = inject(LocaleService);
  protected readonly signups = inject(SignupsService);
  protected readonly shifts = shifts;
  protected readonly steps = computed(() => {
    const t = this.locale.t();
    return [t.howSignUp, t.howArrive, t.howWithdraw];
  });

  constructor() {
    const t = this.locale.t();
    inject(Title).setTitle(`${t.shiftsTitle} · ${t.appName}`);
  }
}
