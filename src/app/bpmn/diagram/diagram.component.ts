import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  initializeModel,
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramGroupsService,
  NgDiagramMarkerComponent,
  NgDiagramEdgeTemplateMap,
  NgDiagramNodeTemplateMap,
  type NodeResizedEvent,
  type PaletteItemDroppedEvent,
} from 'ng-diagram';
import {
  BPMN_EDGE_TYPE,
  BpmnNodeType,
  EVENT_TYPES,
  GATEWAY_TYPES,
  isSwimlane,
  TASK_TYPES,
} from '../model/bpmn.model';
import { seedModel } from './bpmn-seed';
import { buildDiagramConfig } from './diagram-config';
import { BpmnEdgeComponent } from './templates/edges/bpmn-edge.component';
import { EventNodeComponent } from './templates/nodes/event-node/event-node.component';
import { GatewayNodeComponent } from './templates/nodes/gateway-node/gateway-node.component';
import { SwimlaneNodeComponent } from './templates/nodes/swimlane-node/swimlane-node.component';
import { TaskNodeComponent } from './templates/nodes/task-node/task-node.component';
import { SwimlaneService } from './swimlanes/swimlane.service';

@Component({
  selector: 'app-bpmn-diagram',
  standalone: true,
  imports: [NgDiagramComponent, NgDiagramBackgroundComponent, NgDiagramMarkerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './diagram.component.html',
  styleUrl: './diagram.component.scss',
})
export class DiagramComponent {
  private readonly groups = inject(NgDiagramGroupsService);
  private readonly swimlanes = inject(SwimlaneService);

  protected readonly model$ = initializeModel(seedModel());
  protected readonly config = buildDiagramConfig((lane) => this.swimlanes.laneMinSize(lane));

  protected readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
    ...EVENT_TYPES.map((t) => [t, EventNodeComponent] as const),
    ...TASK_TYPES.map((t) => [t, TaskNodeComponent] as const),
    ...GATEWAY_TYPES.map((t) => [t, GatewayNodeComponent] as const),
    [BpmnNodeType.Swimlane, SwimlaneNodeComponent],
  ]);

  protected readonly edgeTemplateMap = new NgDiagramEdgeTemplateMap([
    [BPMN_EDGE_TYPE, BpmnEdgeComponent],
  ]);

  // Fires after the dropped node is committed to the model, so it can be
  // read back and re-parented right away.
  onPaletteItemDropped(event: PaletteItemDroppedEvent): void {
    const node = event.node;
    if (isSwimlane(node)) {
      this.swimlanes.onLaneAdded(node.id);
      return;
    }
    // Parent the element into the lane its drop point landed in, if any.
    const lane = this.swimlanes.laneAtPoint(event.dropPosition);
    if (lane) this.groups.addToGroup(lane.id, [node.id]);
  }

  // Fires on every tick of a resize gesture: the other lanes follow the resized one live — 
  // widths stay equal, the stack stays flush.
  onNodeResized(event: NodeResizedEvent): void {
    if (isSwimlane(event.node)) {
      this.swimlanes.onLaneResized(event.node);
    }
  }
}
