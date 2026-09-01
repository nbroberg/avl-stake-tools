import { Directive, DestroyRef, ElementRef, afterNextRender, inject, output } from '@angular/core';

/**
 * Marks an element that, when it scrolls into view, means the list above
 * it hasn't filled the screen (or the user reached the bottom) - either
 * way, there's room for more rows. Emits `visible` each time that happens;
 * callers should stop rendering this element once there's nothing left to
 * load, which disconnects the observer.
 */
@Directive({
  selector: '[appLoadMoreSentinel]',
  standalone: true,
})
export class LoadMoreSentinelDirective {
  readonly visible = output<void>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.visible.emit();
      });
      observer.observe(this.el.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
