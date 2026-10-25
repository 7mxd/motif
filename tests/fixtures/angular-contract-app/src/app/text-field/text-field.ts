import { Component, input, model } from '@angular/core';

let next = 0;

/** One line of text, with its label above and its hint or error below, in words. */
@Component({
  selector: 'app-text-field',
  templateUrl: './text-field.html',
  styleUrl: './text-field.css',
})
export class TextField {
  readonly value = model('');
  readonly label = input.required<string>();
  readonly name = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string>();
  readonly type = input<'text' | 'email'>('text');
  readonly autocomplete = input<'email' | 'off'>();
  readonly inputmode = input<'text' | 'email' | 'decimal'>();
  readonly enterkeyhint = input<'done' | 'next' | 'send'>();
  protected readonly id = `field-${++next}`;
}
