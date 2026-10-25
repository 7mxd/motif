import { expect } from "bun:test";

// Review Focus 2 (plan 2K): what only looks like a value, and what is one, in an Angular template.
export const NG_TEMPLATE = [
  `<div class="p-[13px] card" style="padding: 13px" [style.color]="'#333'" [style.padding.px]="13" [ngStyle]="{ 'gap.px': 13 }" [class.p-[13px]]="on">`,
  '  <!-- <p style="color: #fff">color: #fff</p> -->',
  "  <p>Call 555-0134, ticket #123</p>",
  "  <p>{{ count > 13 }} {{ '{' }}</p>",
  "  @if (count > 13) {",
  '    <img src="a.png" [width]="300" (click)="go(13)" />',
  "  } @else if (count > 7) {",
  "    <span>some</span>",
  "  } @else {",
  "    <span>none</span>",
  "  }",
  "  @for (t of tools; track t.id) {",
  "    <span>{{ t.name }}</span>",
  "  } @empty {",
  "    <span>No tools</span>",
  "  }",
  "  @switch (mode) {",
  "    @case ('a') { <b>A</b> }",
  "    @default { <b>B</b> }",
  "  }",
  "  @defer (on viewport; prefetch on idle) {",
  "    <heavy-chart />",
  "  } @placeholder (minimum 500ms) {",
  "    <p>Later</p>",
  "  } @loading (after 100ms; minimum 1s) {",
  "    <p>Loading</p>",
  "  } @error {",
  "    <p>Failed</p>",
  "  }",
  "  @let total = a + b;",
  "  <p>{count, plural, =0 {none} =1 {one tool} other {# tools}}</p>",
  "</div>",
].join("\n");

/** Every view the text's length, line breaks in place; each kept character the original's (the CSS view's separators and colons aside); none read twice. */
export const expectExact = (text: string, views: { css: string; script: string; markup: string }) => {
  for (const [name, view] of Object.entries({ css: views.css, script: views.script, markup: views.markup })) {
    expect(view.length).toBe(text.length);
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n" || text[i] === "\r") expect({ name, i, char: view[i] }).toEqual({ name, i, char: text[i]! });
      else if (view[i] !== " " && view[i] !== text[i] && !(name === "css" && (view[i] === ";" || view[i] === ":"))) expect({ name, i, char: view[i] }).toEqual({ name, i, char: text[i]! });
    }
  }
  for (let i = 0; i < text.length; i++) {
    const readers = [views.css, views.script, views.markup].filter((v) => v[i] === text[i] && !/\s/.test(text[i]!));
    expect({ i, readers: readers.length }).toEqual({ i, readers: Math.min(readers.length, 1) });
  }
};
