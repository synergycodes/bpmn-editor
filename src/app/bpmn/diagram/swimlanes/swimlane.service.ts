import { inject, Injectable } from '@angular/core';
import { NgDiagramModelService, type Node, type Size } from 'ng-diagram';
import {
  isBpmnElement,
  isLayoutEdge,
  isSwimlane,
  LANE_DEFAULT_SIZE,
  type BpmnEdge,
  type SwimlaneNode,
} from '../../model/bpmn.model';
import { ElkLayoutService } from '../layout/elk-layout.service';
import { computeAutoLayoutUpdates } from './lane-auto-layout';
import { laneAtPoint, sortedLanes } from './lane-queries';
import { computeLaneMinSize, computeWidthSyncUpdates } from './lane-sizing';
import { computeStackUpdates, type NodeUpdate } from './lane-stacking';

/**
 * Orchestrates swimlane behavior — reorder, resize sync, drops, and the elk
 * layout. Reads the model and writes back updates computed by the pure
 * lane-* helpers in this folder.
 */
@Injectable()
export class SwimlaneService {
  private readonly model = inject(NgDiagramModelService);
  private readonly elk = inject(ElkLayoutService);

  private readonly childrenOf = (laneId: string) => this.model.getChildren(laneId);

  /**
   * Swimlanes sorted by their stacking order (top → bottom). Read from the
   * committed model, since the nodes() signal refreshes asynchronously.
   */
  lanes(): SwimlaneNode[] {
    return sortedLanes(this.model.getModel().getNodes());
  }

  /** Lays out every lane's contents with elk, then applies the result as a
      single model change. The viewport stays where the user left it. */
  async runLayout(): Promise<void> {
    const lanes = this.lanes();
    if (lanes.length === 0) return;

    const layoutEdges = this.model.edges().filter((e) => isLayoutEdge(e as BpmnEdge));

    // Layout each lane's children independently (cross-lane edges ignored).
    const perLane = await Promise.all(
      lanes.map(async (lane) => {
        const children = this.childrenOf(lane.id).filter(isBpmnElement);
        const result = await this.elk.layoutLane(children, layoutEdges);
        return { lane, children, result };
      }),
    );

    this.model.updateNodes(computeAutoLayoutUpdates(perLane));
  }

  /** Swap a lane with its neighbour in the given direction, then re-stack. */
  moveLane(laneId: string, direction: -1 | 1): void {
    const lanes = this.lanes();
    const i = lanes.findIndex((l) => l.id === laneId);
    if (i < 0) return;
    const j = i + direction;
    if (j < 0 || j >= lanes.length) return;

    const reordered = [...lanes];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    this.arrangeLanes(reordered);
  }

  /** Re-stack the given lanes (defaults to current order), keeping sizes. */
  arrangeLanes(ordered?: SwimlaneNode[]): void {
    const updates = computeStackUpdates(ordered ?? this.lanes(), this.childrenOf);
    if (updates.length) {
      this.model.updateNodes(updates);
    }
  }

  /** A lane is being resized by hand (called on every gesture tick): match
      the other lanes to its width and re-stack, in 1 batched write. */
  onLaneResized(lane: Node): void {
    if (!isSwimlane(lane)) return;
    const lanes = this.lanes();

    const byId = new Map<string, NodeUpdate>();
    for (const update of computeWidthSyncUpdates(lanes, lane)) {
      byId.set(update.id, update);
    }
    for (const update of computeStackUpdates(lanes, this.childrenOf)) {
      byId.set(update.id, { ...byId.get(update.id), ...update });
    }

    if (byId.size) {
      this.model.updateNodes([...byId.values()]);
    }
  }

  /** Minimum resize size for a lane; wired into `resize.getMinNodeSize`. */
  laneMinSize(lane: Node): Size {
    return computeLaneMinSize(this.lanes(), lane, this.childrenOf);
  }

  /** The swimlane whose rectangle contains the given flow-space point, if any. */
  laneAtPoint(point: { x: number; y: number }): SwimlaneNode | undefined {
    return laneAtPoint(this.lanes(), point);
  }

  /** A freshly-dropped lane joins the bottom of the stack and adopts the
      shared lane width. */
  onLaneAdded(laneId: string): void {
    const all = this.lanes();
    const lane = all.find((l) => l.id === laneId);
    if (!lane) return;

    const others = all.filter((l) => l.id !== laneId);
    const width = others.length
      ? Math.max(...others.map((l) => l.size?.width ?? 0))
      : (lane.size?.width ?? LANE_DEFAULT_SIZE.width);

    // Lanes never move by hand — only via reorder / layout. The shared width
    // is written directly to the model: the engine's resizeNode command
    // ignores groups that are not selected, and a fresh drop is not.
    this.model.updateNode(lane.id, {
      draggable: false,
      size: { width, height: lane.size?.height ?? LANE_DEFAULT_SIZE.height },
    });

    // Deterministic order: existing lanes (by order) then the new one last.
    this.arrangeLanes([...others, lane]);
  }
}
