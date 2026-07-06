import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramNodeSelectedDirective,
  NgDiagramPortComponent,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import { BpmnNodeType, type BpmnNodeData } from '../../model/bpmn.model';

/**
 * Single template for every BPMN flow element (events, activities, gateways).
 * Registered against each element type string in the node template map.
 * Activity labels are editable inline (double-click).
 */
@Component({
  selector: 'app-bpmn-node',
  standalone: true,
  imports: [NgDiagramPortComponent, NgDiagramNodeSelectedDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bpmn-node.component.html',
  styleUrl: './bpmn-node.component.scss',
})
export class BpmnNodeComponent implements NgDiagramNodeTemplate<BpmnNodeData> {
  private readonly model = inject(NgDiagramModelService);

  node = input.required<Node<BpmnNodeData>>();

  protected readonly T = BpmnNodeType;
  protected readonly type = computed(() => this.node().type ?? '');
  protected readonly data = computed(() => this.node().data);
  protected readonly label = computed(() => this.data()?.label ?? '');

  protected readonly isEvent = computed(() => this.data()?.kind === 'event');
  protected readonly isTask = computed(() => this.data()?.kind === 'task');
  protected readonly isGateway = computed(() => this.data()?.kind === 'gateway');

  /** Label rendered outside the glyph (below) for events & gateways. */
  protected readonly externalLabel = computed(() => this.isEvent() || this.isGateway());

  /* ── Inline label editing (activities) ─────────────────────── */
  protected readonly editing = signal(false);
  private readonly editor = viewChild<ElementRef<HTMLInputElement>>('editor');

  constructor() {
    // Focus + select the field the moment it appears.
    effect(() => {
      if (this.editing()) {
        const el = this.editor()?.nativeElement;
        if (el) {
          el.focus();
          el.select();
        }
      }
    });
  }

  startEdit(event: Event): void {
    event.stopPropagation();
    this.editing.set(true);
  }

  commit(value: string): void {
    const label = value.trim();
    this.editing.set(false);
    if (label && label !== this.label()) {
      // updateNodeData REPLACES data — spread the existing fields to keep `kind`.
      this.model.updateNodeData(this.node().id, { ...this.data(), label });
    }
  }

  cancel(): void {
    this.editing.set(false);
  }
}
