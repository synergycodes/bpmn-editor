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

  onPaletteItemDropped(event: PaletteItemDroppedEvent): void {
    const node = event.node;
    if (isSwimlane(node)) {
      // Docs make no commit-timing guarantee for paletteItemDropped and offer no
      // post-drop hook, so defer one tick before reading the new lane back from
      // the model (onLaneAdded both reads and writes it).
      setTimeout(() => this.swimlanes.onLaneAdded(node.id), 0);
      return;
    }
    // Parent the element into whichever lane its drop point landed in, via a
    // deterministic geometric hit-test. Deferred one tick because the docs make
    // no commit-timing guarantee for paletteItemDropped, and addToGroup targets
    // the new node's id. Lanes do not auto-resize (manual resize only — F10).
    setTimeout(() => {
      const lane = this.swimlanes.laneAtPoint(event.dropPosition);
      if (lane) this.groups.addToGroup(lane.id, [node.id]);
    }, 0);
  }

  onNodeResizeEnded(event: NodeResizeEndedEvent): void {
    if (isSwimlane(event.node)) {
      // Docs guarantee event.node carries the final size when this fires —
      // no deferral or model read-back needed.
      this.swimlanes.onLaneResized(event.node);
    }
  }
}
