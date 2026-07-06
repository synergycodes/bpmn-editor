import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  initializeModel,
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramGroupsService,
  NgDiagramMarkerComponent,
  NgDiagramEdgeTemplateMap,
  NgDiagramNodeTemplateMap,
  type GroupMembershipChangedEvent,
  type NodeDragEndedEvent,
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

  onPaletteItemDropped(event: PaletteItemDroppedEvent): void {
    const node = event.node;
    if (isSwimlane(node)) {
      // Defer one tick so the new lane node is committed to the model before
      // the service reads it back for re-stacking.
      setTimeout(() => this.swimlanes.onLaneAdded(node.id), 0);
      return;
    }
    // Parent the element into whichever lane its drop point landed in. Done via
    // a deterministic geometric hit-test (not overlap of yet-unmeasured bounds),
    // deferred a tick so the new node is in the model.
    setTimeout(() => {
      const lane = this.swimlanes.laneAtPoint(event.dropPosition);
      if (lane) this.groups.addToGroup(lane.id, [node.id]);
      // Grow the target lane to contain the new node and re-stack below it.
      this.swimlanes.refitLanes();
    }, 0);
  }

  onNodeDragEnded(_event: NodeDragEndedEvent): void {
    // A node may have moved into another lane (or lower within its lane),
    // heightening it — re-fit lanes so none overlaps. Deferred so the final
    // positions / group membership are committed to the model first.
    setTimeout(() => this.swimlanes.refitLanes(), 0);
  }

  onGroupMembershipChanged(_event: GroupMembershipChangedEvent): void {
    // A node changed lanes — size the affected lanes to their new children
    // bounds and re-stack so none overlap.
    setTimeout(() => this.swimlanes.refitLanes(), 0);
  }

  onNodeResizeEnded(event: NodeResizeEndedEvent): void {
    if (isSwimlane(event.node)) {
      // Defer one tick so the committed final size is in the model, then
      // equalise widths and re-stack the lanes below.
      const id = event.node.id;
      setTimeout(() => this.swimlanes.onLaneResized(id), 0);
    }
  }
}
