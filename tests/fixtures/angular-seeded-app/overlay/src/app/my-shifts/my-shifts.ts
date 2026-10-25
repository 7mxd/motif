import { Component, inject, type AnimationCallbackEvent } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { animate } from 'motion';
import { Button } from '../button/button';
import { spring } from '../design/motion';
import { LocaleService } from '../i18n/locale.service';
import { Icon } from '../icon/icon';
import { weeklyLimit } from '../mock-data';
import { SignupsService } from '../state/signups.service';

/** The shifts the volunteer has signed up for, soonest first, each one they can withdraw from. */
@Component({
  selector: 'app-my-shifts',
  imports: [Button, Icon, RouterLink],
  templateUrl: './my-shifts.html',
})
export class MyShifts {
  protected readonly locale = inject(LocaleService);
  protected readonly signups = inject(SignupsService);
  protected readonly limit = weeklyLimit;

  constructor() {
    const t = this.locale.t();
    inject(Title).setTitle(`${t.mineTitle} · ${t.appName}`);
  }

  /** A withdrawn shift's row leaves with the snappy spring; with reduced motion it goes at once. */
  protected leave(event: AnimationCallbackEvent): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      event.animationComplete();
      return;
    }
    animate(event.target, { opacity: 0, scale: 0.97 }, spring.snappy).then(() => event.animationComplete());
  }
}
