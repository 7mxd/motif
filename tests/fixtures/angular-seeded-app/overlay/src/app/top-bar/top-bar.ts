import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { LocaleService } from '../i18n/locale.service';
import { Icon } from '../icon/icon';

/** The food bank's name, its two pages and sign-in, on every page. A shift's page belongs to Shifts. */
@Component({
  selector: 'app-top-bar',
  imports: [Icon, RouterLink],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
})
export class TopBar {
  protected readonly locale = inject(LocaleService);
  private readonly router = inject(Router);
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly current = computed(() => {
    const path = this.path();
    if (path.startsWith('/my-shifts')) return 'mine';
    return path === '/' || path.startsWith('/shifts/') ? 'shifts' : null;
  });
  protected readonly tabs = computed(() => [
    { id: 'shifts', path: '/', label: this.locale.t().navShifts },
    { id: 'mine', path: '/my-shifts', label: this.locale.t().navMine },
  ]);
}
