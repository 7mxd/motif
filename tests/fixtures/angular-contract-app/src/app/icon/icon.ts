import { Component, computed, input } from '@angular/core';

export type IconName = 'back' | 'basket' | 'user' | 'clock' | 'calendar' | 'pin' | 'people' | 'check';

// Line icons on a 24-unit grid, drawn in the text colour.
const PATHS: Record<IconName, string[]> = {
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  basket: ['M3 10h18l-2 10H5Z', 'M7.5 10 11 4', 'M16.5 10 13 4', 'M9 14v3', 'M15 14v3'],
  user: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M4 21c.9-3.6 4.2-6 8-6s7.1 2.4 8 6'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7v5l3 2'],
  calendar: ['M4 6h16v14H4Z', 'M4 10h16', 'M8 3v5', 'M16 3v5'],
  pin: ['M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z', 'M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z'],
  people: ['M9 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z', 'M2.5 20c.7-3.2 3.3-5.5 6.5-5.5s5.8 2.3 6.5 5.5', 'M16 4.5a3.5 3.5 0 0 1 0 6.5', 'M18 14.8c1.8.8 3.1 2.6 3.5 5.2'],
  check: ['M5 12.5l4.5 4.5L19 7'],
};

/** A line icon on an <svg>: <svg appIcon name="clock"></svg>. Icons that point a direction turn round in right-to-left languages. */
@Component({
  selector: 'svg[appIcon]',
  template: `
    @for (d of paths(); track d) {
      <svg:path [attr.d]="d" />
    }
  `,
  host: {
    '[class]': "name() === 'back' ? 'size-5 shrink-0 rtl:-scale-x-100' : 'size-5 shrink-0'",
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  },
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly paths = computed(() => PATHS[this.name()]);
}
