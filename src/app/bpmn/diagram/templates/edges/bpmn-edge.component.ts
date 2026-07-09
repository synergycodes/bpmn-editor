import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  NgDiagramBaseEdgeComponent,
  NgDiagramBaseEdgeLabelComponent,
  NgDiagramModelService,
  type Edge,
  type NgDiagramEdgeTemplate,
} from 'ng-diagram';
import { BpmnEdgeKind, type BpmnEdgeData } from '../../../model/bpmn.model';
import { InlineEditableLabel } from '../inline-editable-label';

/**
 * Renders every BPMN connection. Stroke style + arrowheads are chosen from
 * `edge.data.kind`:
 *   · sequence     — solid line, filled arrow
 *   · message      — dashed line, open circle → open arrow
 *   · association  — dotted line, no arrowhead
 * The referenced marker ids are defined once in the diagram host template.
 * The mid-edge label is editable inline (double-click the edge).
 */
@Component({
  selector: 'app-bpmn-edge',
  standalone: true,
  imports: [NgDiagramBaseEdgeComponent, NgDiagramBaseEdgeLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bpmn-edge.component.html',
  styleUrl: './bpmn-edge.component.scss',
})
export class BpmnEdgeComponent
  extends InlineEditableLabel
  implements NgDiagramEdgeTemplate<BpmnEdgeData>
{
  private readonly model = inject(NgDiagramModelService);

  edge = input.required<Edge<BpmnEdgeData>>();

  protected readonly label = computed(() => this.edge().data?.label ?? '');

  /** An empty value removes the label. */
  protected override readonly allowEmpty = true;

  /** A fresh label stays hidden until the engine measures it. */
  protected override readonly editorVisible = computed(
    () => !!this.edge().measuredLabels?.length,
  );

  protected saveLabel(label: string): void {
    this.model.updateEdgeData(this.edge().id, {
      ...this.edge().data,
      label: label || undefined,
    });
  }

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
