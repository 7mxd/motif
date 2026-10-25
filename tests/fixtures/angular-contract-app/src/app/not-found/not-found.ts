import { Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Button } from '../button/button';
import { EmptyState } from '../empty-state/empty-state';
import { LocaleService } from '../i18n/locale.service';

/** A page that isn't there: says so, and leads back to the open shifts. */
@Component({
  selector: 'app-not-found',
  imports: [Button, EmptyState, RouterLink],
  template: `
    <app-empty-state level="h1" [title]="locale.t().pageMissing" [body]="locale.t().pageMissingHint">
      <a appButton routerLink="/">{{ locale.t().seeShifts }}</a>
    </app-empty-state>
  `,
})
export class NotFound {
  protected readonly locale = inject(LocaleService);

  constructor() {
    const t = this.locale.t();
    inject(Title).setTitle(`${t.pageMissing} · ${t.appName}`);
  }
}
