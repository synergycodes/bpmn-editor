import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgDiagramBaseEdgeComponent, type Edge, type NgDiagramEdgeTemplate } from 'ng-diagram';
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
  imports: [NgDiagramBaseEdgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-diagram-base-edge
      [edge]="edge()"
      [strokeWidth]="1.6"
      [strokeDasharray]="dasharray()"
      [sourceArrowhead]="sourceArrow()"
      [targetArrowhead]="targetArrow()"
    />
  `,
})
export class BpmnEdgeComponent implements NgDiagramEdgeTemplate<BpmnEdgeData> {
  edge = input.required<Edge<BpmnEdgeData>>();

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
