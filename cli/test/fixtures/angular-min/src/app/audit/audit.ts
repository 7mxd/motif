import { afterNextRender, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { animate } from 'motion';

// Planted for motif shot --audit: a caption too faint to read, a 32 px icon button with no name, and a square that Motion
// keeps turning under reduced motion (it moves in script, which the theme's reduced-motion rule doesn't stop).
@Component({
  selector: 'app-audit',
  template: `
    <main class="flex flex-col gap-4 p-4">
      <h1 class="font-title text-title">Audit</h1>
      <p class="text-caption" style="color: #c4c4c4; background: #f2f2f2">Last restocked three days ago</p>
      <button type="button" class="flex size-8 items-center justify-center rounded-md bg-action-primary text-on-action-primary">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7 1h2v6h6v2H9v6H7V9H1V7h6z" /></svg>
      </button>
      <div #square class="size-8 rounded-sm bg-action-primary"></div>
    </main>
  `,
})
export class Audit {
  private readonly square = viewChild.required<ElementRef<HTMLElement>>('square');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const turning = animate(this.square().nativeElement, { rotate: 360 }, { duration: 1.6, ease: 'linear', repeat: Infinity });
      destroyRef.onDestroy(() => turning.stop());
    });
  }
}
