import {
  afterRenderEffect,
  computed,
  Directive,
  effect,
  ElementRef,
  signal,
  viewChild,
  type Signal,
} from '@angular/core';

/**
 * Inline label editing shared by every element of the editor (tasks,
 * gateways, events, lanes, edge labels). Double-click enters edit mode,
 * Enter or a press outside the input saves, Escape cancels.
 *
 * The host template renders an `<input #editor>` while `editing()` is true,
 * wired to `commit` / `cancel`, with `data-no-drag` / `data-no-pan` set.
 */
@Directive()
export abstract class InlineEditableLabel {
  /** Current label text. */
  protected abstract readonly label: Signal<string>;

  /** Persist the edited label. */
  protected abstract saveLabel(label: string): void;

  /** When true, committing an empty value is saved too (delete semantics). */
  protected readonly allowEmpty: boolean = false;

  /** Whether the rendered editor is actually visible. Override when the host
      hides it until some engine state lands (e.g. edge label measurement). */
  protected readonly editorVisible: Signal<boolean> = computed(() => true);

  protected readonly editing = signal(false);
  protected readonly editor = viewChild<ElementRef<HTMLInputElement>>('editor');

  constructor() {
    // Focus + select the field once it is rendered and visible.
    afterRenderEffect(() => {
      if (!this.editing() || !this.editorVisible()) return;
      const el = this.editor()?.nativeElement;
      if (el) {
        el.focus();
        el.select();
      }
    });

    // Commit the edit when the user presses anywhere outside the input.
    effect((onCleanup) => {
      if (!this.editing()) return;
      const onPointerDown = (event: PointerEvent) => {
        const el = this.editor()?.nativeElement;
        if (el && !el.contains(event.target as HTMLElement)) {
          this.commit(el.value);
        }
      };
      document.addEventListener('pointerdown', onPointerDown, true);
      onCleanup(() => document.removeEventListener('pointerdown', onPointerDown, true));
    });
  }

  /** Double-click: switch to the input. The event must not reach the
      canvas, where double-click has its own meaning. */
  startEdit(event: Event): void {
    event.stopPropagation();
    this.editing.set(true);
  }

  /** Enter or a press outside the input: save the label. */
  commit(value: string): void {
    const label = value.trim();
    this.editing.set(false);
    if ((label || this.allowEmpty) && label !== this.label()) {
      this.saveLabel(label);
    }
  }

  /** Escape: leave edit mode without saving. */
  cancel(): void {
    this.editing.set(false);
  }
}
