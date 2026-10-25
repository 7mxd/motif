import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, type IconName } from '../icon/icon';

/** An icon-only control: always named, always 48 px square. A link makes it a link to that page. */
@Component({
  selector: 'app-icon-button',
  imports: [Icon, RouterLink],
  template: `
    @if (link(); as path) {
      <a class="icon-button" [routerLink]="path" [attr.aria-label]="label()"><svg appIcon [name]="icon()"></svg></a>
    } @else {
      <button type="button" class="icon-button" [attr.aria-label]="label()" (click)="pressed.emit()"><svg appIcon [name]="icon()"></svg></button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--motif-space-12);
      block-size: var(--motif-space-12);
      flex-shrink: 0;
      border: 0;
      border-radius: var(--motif-radius-full);
      background: transparent;
      color: var(--motif-color-text-primary);
      cursor: pointer;
      transition: background-color var(--motif-duration-fast) var(--motif-easing-standard);
    }
    @media (hover: hover) {
      .icon-button:hover {
        background: var(--motif-color-action-secondary);
      }
    }
    .icon-button:active {
      background: var(--motif-color-action-secondary);
    }
    .icon-button:focus-visible {
      outline: 2px solid var(--motif-color-focus);
      outline-offset: 2px;
    }
  `,
})
export class IconButton {
  readonly icon = input.required<IconName>();
  readonly label = input.required<string>();
  readonly link = input<string>();
  readonly pressed = output<void>();
}
