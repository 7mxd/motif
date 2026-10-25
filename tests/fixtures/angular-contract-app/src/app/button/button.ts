import { Component, booleanAttribute, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary';

/**
 * An action on a real <button>, or a link that looks like one on an <a>: <button appButton (click)="…">,
 * <a appButton variant="secondary" href="…">. Every attribute and event of the element passes through.
 */
@Component({
  selector: 'button[appButton], a[appButton]',
  templateUrl: './button.html',
  styleUrl: './button.css',
  host: {
    class: 'button',
    '[class.button-primary]': "variant() === 'primary'",
    '[class.button-secondary]': "variant() === 'secondary'",
    '[attr.disabled]': "disabled() ? '' : null",
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly disabled = input(false, { transform: booleanAttribute });
}
