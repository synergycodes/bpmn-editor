import { computed, Directive, inject, input } from '@angular/core';
import {
  NgDiagramModelService,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import { BpmnNodeType, type BpmnNodeData } from '../../../model/bpmn.model';
import { InlineEditableLabel } from '../inline-editable-label';

/**
 * Shared base of the 3 flow-element templates (events, tasks, gateways):
 * the node input, the type/label computeds, and label saving.
 */
@Directive({
  // Engine-provided hover styling: highlights all ports while over the node.
  host: { class: 'ng-diagram-port-hoverable-over-node' },
})
export abstract class BpmnElementNode
  extends InlineEditableLabel
  implements NgDiagramNodeTemplate<BpmnNodeData>
{
  private readonly model = inject(NgDiagramModelService);

  node = input.required<Node<BpmnNodeData>>();

  /** Templates only see class members — expose the type consts for @case. */
  protected readonly T = BpmnNodeType;
  protected readonly type = computed(() => this.node().type ?? '');
  protected readonly label = computed(() => this.node().data?.label ?? '');

  protected saveLabel(label: string): void {
    this.model.updateNodeData(this.node().id, { ...this.node().data, label });
  }
}
