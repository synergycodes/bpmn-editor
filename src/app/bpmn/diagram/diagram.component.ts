import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  initializeModel,
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramGroupsService,
  NgDiagramMarkerComponent,
  NgDiagramEdgeTemplateMap,
  NgDiagramNodeTemplateMap,
  type NodeResizeEndedEvent,
  type PaletteItemDroppedEvent,
} from 'ng-diagram';
import { BpmnNodeType, isSwimlane } from '../model/bpmn.model';
import { seedModel } from './bpmn-seed';
import { BPMN_ELEMENT_TYPES, buildDiagramConfig } from './diagram-config';
import { BPMN_EDGE_TYPE } from '../model/bpmn.model';
import { BpmnEdgeComponent } from './edges/bpmn-edge.component';
import { BpmnNodeComponent } from './nodes/bpmn-node.component';
import { SwimlaneNodeComponent } from './nodes/swimlane-node.component';
import { SwimlaneService } from './swimlane.service';

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
    ...BPMN_ELEMENT_TYPES.map((t) => [t, BpmnNodeComponent] as const),
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

  onNodeResizeEnded(event: NodeResizeEndedEvent): void {
    if (isSwimlane(event.node)) {
      this.swimlanes.onLaneResized(event.node);
    }
  }
}
