import type { Binding, Grammar } from "../../check/component-views";

/**
 * Angular's template syntax (17 and later): {{…}} interpolation; control flow (@if (…) {, } @else if (…) {, } @else {,
 * @for (…; track …) {, } @empty {, @switch (…) {, @case (…) {, @default {, @defer (…) {, } @placeholder (…) {,
 * } @loading (…) {, } @error {) and @let name = expr;; ICU messages ({count, plural, =0 {none} other {# tools}}).
 */
export const ANGULAR_GRAMMAR: Grammar = {
  open: "{{",
  close: "}}",
  flow: /@(?:else\s+if|if|else|for|empty|switch|case|default|defer|placeholder|loading|error|let)(?![\w-])/,
  statement: /^@let$/,
  icu: true,
  // Angular 21's templates may hold regular expression literals.
  regex: true,
};

/**
 * What an Angular template binds. [style.prop]="…" sets one CSS property: a string or number literal reads as CSS, any
 * other value (and [style.prop.unit]="13", whose unit the CSS view has no room to add) is script. Every other bound
 * value is an expression: [prop], [attr.x], [class.name] (its name stays in the markup, where the Tailwind rules read
 * it), [class], [ngClass], [style], [ngStyle], (event), [(model)], *ngIf/*ngFor, bind-/on-/bindon- and Angular's
 * animate.enter/animate.leave as bindings or events. A plain animate.enter="fade-in" is a class list: markup, as #ref
 * and let-item are.
 */
export const ANGULAR_BINDINGS: Binding[] = [
  { attr: /^\[style\.([\w-]+)\]$/, as: "css", literal: true },
  { attr: /^(?:[[(*]|bind-|on-|bindon-)/, as: "script" },
];
