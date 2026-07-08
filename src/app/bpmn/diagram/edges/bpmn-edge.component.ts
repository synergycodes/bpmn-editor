import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  NgDiagramBaseEdgeComponent,
  NgDiagramBaseEdgeLabelComponent,
  type Edge,
  type NgDiagramEdgeTemplate,
} from 'ng-diagram';
import { BpmnEdgeKind, type BpmnEdgeData } from '../../model/bpmn.model';

/**
 * Renders every BPMN connection. Stroke style + arrowheads are chosen from
 * `edge.data.kind`:
 *   · sequence     — solid line, filled arrow
 *   · message      — dashed line, open circle → open arrow
 *   · association   — dotted line, no arrowhead
 * The referenced marker ids are defined once in the diagram host template.
 */
@Component({
  selector: 'app-bpmn-edge',
  standalone: true,
  imports: [NgDiagramBaseEdgeComponent, NgDiagramBaseEdgeLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-diagram-base-edge
      [edge]="edge()"
      [strokeWidth]="1.6"
      [strokeDasharray]="dasharray()"
      [sourceArrowhead]="sourceArrow()"
      [targetArrowhead]="targetArrow()"
    >
      @if (label()) {
        <ng-diagram-base-edge-label [id]="edge().id + '-label'" [positionOnEdge]="0.5">
          <span class="edge-label">{{ label() }}</span>
        </ng-diagram-base-edge-label>
      }
    </ng-diagram-base-edge>
  `,
  styles: `
    .edge-label {
      display: inline-block;
      padding: 1px 6px;
      font-size: 11px;
      line-height: 1.4;
      border-radius: 4px;
      background: var(--ngd-node-background, #fff);
      color: var(--ngd-node-text, #1c1c1c);
      border: 1px solid var(--ngd-node-border, #d0d0d0);
    }
  `,
})
export class BpmnEdgeComponent implements NgDiagramEdgeTemplate<BpmnEdgeData> {
  edge = input.required<Edge<BpmnEdgeData>>();

  protected readonly label = computed(() => this.edge().data?.label);

  private readonly kind = computed<BpmnEdgeKind>(
    () => (this.edge().data?.kind ?? BpmnEdgeKind.Sequence) as BpmnEdgeKind,
  );

  protected readonly dasharray = computed(() => {
    switch (this.kind()) {
      case BpmnEdgeKind.Message:
        return '6 4';
      case BpmnEdgeKind.Association:
        return '1 4';
      default:
        return undefined;
    }
  });

  protected readonly sourceArrow = computed(() =>
    this.kind() === BpmnEdgeKind.Message ? 'bpmn-msg-start' : undefined,
  );

  protected readonly targetArrow = computed(() => {
    switch (this.kind()) {
      case BpmnEdgeKind.Message:
        return 'bpmn-msg-end';
      case BpmnEdgeKind.Association:
        return undefined;
      default:
        return 'bpmn-seq-arrow';
    }
  });
}
