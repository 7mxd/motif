import { afterNextRender, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { animate } from 'motion';

// The same square, still when the viewer asks for reduced motion: Motion's loop starts only after matchMedia says the
// viewer didn't ask. The second square loops through animate.enter's CSS animation, which the theme's reduced-motion
// rule stops on its own.
@Component({
  selector: 'app-calm',
  template: `
    <main class="flex flex-col gap-4 p-4">
      <h1 class="font-title text-title">Calm</h1>
      <div #square class="size-8 rounded-sm bg-action-primary"></div>
      <div animate.enter="turn" class="size-8 rounded-sm bg-action-primary"></div>
    </main>
  `,
  styles: `
    .turn { animation: turn 1.6s linear infinite; }
    @keyframes turn { to { rotate: 360deg; } }
  `,
})
export class Calm {
  private readonly square = viewChild.required<ElementRef<HTMLElement>>('square');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const turning = animate(this.square().nativeElement, { rotate: 360 }, { duration: 1.6, ease: 'linear', repeat: Infinity });
      destroyRef.onDestroy(() => turning.stop());
    });
  }
}
