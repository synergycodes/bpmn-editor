import { inject, Injectable } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramNodeService,
  NgDiagramService,
  NgDiagramViewportService,
  type Node,
  type Size,
} from 'ng-diagram';
import {
  isBpmnElement,
  isLayoutEdge,
  isSwimlane,
  LANE_DEFAULT_SIZE,
  LANE_HEADER_WIDTH,
  LANE_MIN_CONTENT,
  LANE_ORIGIN,
  LANE_PADDING,
  type BpmnEdge,
  type SwimlaneNode,
} from '../model/bpmn.model';
import { ElkLayoutService } from './layout/elk-layout.service';

/**
 * Owns everything about swimlanes: ordering, the vertical stacked arrangement,
 * equal-width alignment, manual lane resize handling, and the elkjs layered
 * layout of the elements inside each lane. Lanes never auto-resize to their
 * children — lane geometry changes only via the lane's own resize handles, the
 * Layout button, and lane add/reorder stacking.
 */
@Injectable()
export class SwimlaneService {
  private readonly model = inject(NgDiagramModelService);
  private readonly nodes = inject(NgDiagramNodeService);
  private readonly viewport = inject(NgDiagramViewportService);
  private readonly ngDiagram = inject(NgDiagramService);
  private readonly elk = inject(ElkLayoutService);

  /**
   * Swimlanes sorted by their stacking order (top → bottom). Read from the
   * committed model, since the nodes() signal refreshes asynchronously.
   */
  lanes(): SwimlaneNode[] {
    return this.model
      .getModel()
      .getNodes()
      .filter(isSwimlane)
      .sort((a, b) => (a.data?.order ?? 0) - (b.data?.order ?? 0));
  }

  /* ── Full layout (Layout button) ──────────────────────────── */

  /**
   * Lays out every lane's contents with elk, then re-stacks the lanes,
   * aligns them to a uniform width, and resizes each lane to fit its content.
   */
  async runLayout(): Promise<void> {
    const lanes = this.lanes();
    if (lanes.length === 0) return;

    const layoutEdges = this.model.edges().filter((e) => isLayoutEdge(e as BpmnEdge));

    // 1. Layout each lane's children independently (cross-lane edges ignored).
    const perLane = await Promise.all(
      lanes.map(async (lane) => {
        const children = this.model.getChildren(lane.id).filter(isBpmnElement);
        const result = await this.elk.layoutLane(children, layoutEdges);
        return { lane, children, result };
      }),
    );

    // 2. Uniform lane width = widest content across all lanes.
    const maxContentWidth = Math.max(
      LANE_MIN_CONTENT.width,
      ...perLane.map((p) => p.result.width),
    );
    const laneWidth =
      LANE_HEADER_WIDTH + LANE_PADDING.left + maxContentWidth + LANE_PADDING.right;

    // 3. Stack lanes top → bottom and position children within each lane.
    //    Apply lane sizes/positions AND child positions in a single atomic
    //    updateNodes batch — using direct model updates (NOT resizeNode) so the
    //    interactive resize clamps (allowResizeBelowChildrenBounds / min-size,
    //    which read the OLD child positions) can't fight the fresh layout and
    //    leave a lane taller than assumed, which is what caused overlaps.
    const nodeUpdates: (Pick<Node, 'id'> & Partial<Node>)[] = [];
    let cursorY = LANE_ORIGIN.y;

    perLane.forEach(({ lane, children, result }, index) => {
      const contentHeight = Math.max(LANE_MIN_CONTENT.height, result.height);
      const laneHeight = LANE_PADDING.top + contentHeight + LANE_PADDING.bottom;
      const laneX = LANE_ORIGIN.x;
      const laneY = cursorY;

      nodeUpdates.push({
        id: lane.id,
        position: { x: laneX, y: laneY },
        size: { width: laneWidth, height: laneHeight },
        data: { ...(lane.data ?? { label: 'Lane' }), order: index },
      } as Pick<Node, 'id'> & Partial<Node>);

      // Children: place at global coords = lane origin + header + padding + elk offset.
      const contentX = laneX + LANE_HEADER_WIDTH + LANE_PADDING.left;
      const contentY = laneY + LANE_PADDING.top;
      for (const child of children) {
        const rel = result.positions.get(child.id);
        if (!rel) continue;
        nodeUpdates.push({
          id: child.id,
          position: { x: contentX + rel.x, y: contentY + rel.y },
        });
      }

      cursorY += laneHeight;
    });

    // Commit the layout atomically and wait for re-measurement so zoomToFit
    // sees the new bounds, not the pre-layout ones.
    await this.ngDiagram.transaction(() => {
      this.model.updateNodes(nodeUpdates);
    }, { waitForMeasurements: true });
    this.viewport.zoomToFit({ padding: 60 });
  }

  /* ── Reorder (lane up/down buttons) ───────────────────────── */

  /** Swap a lane with its neighbour in the given direction, then re-stack. */
  moveLane(laneId: string, direction: -1 | 1): void {
    const lanes = this.lanes();
    const i = lanes.findIndex((l) => l.id === laneId);
    if (i < 0) return;
    const j = i + direction;
    if (j < 0 || j >= lanes.length) return;

    // Swap positions in a local snapshot so we don't depend on the model
    // reflecting the new order synchronously.
    const reordered = [...lanes];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    this.arrangeLanes(reordered);
  }

  /**
   * Re-stack the given lanes (defaults to current order) vertically, keeping
   * each lane's size. Children move with their lane by the same positional
   * delta, and each lane's `order` is normalised to its new index — position
   * and order are written together in the one batch. No elk.
   *
   * `updateNodeData` REPLACES the data object, so the `order` update spreads
   * the existing data to preserve the lane title.
   */
  arrangeLanes(ordered?: SwimlaneNode[]): void {
    const lanes = ordered ?? this.lanes();
    if (lanes.length === 0) return;

    const updates: (Pick<Node, 'id'> & Partial<Node>)[] = [];
    let cursorY = LANE_ORIGIN.y;

    lanes.forEach((lane, index) => {
      const targetX = LANE_ORIGIN.x;
      const targetY = cursorY;
      const dx = targetX - (lane.position?.x ?? targetX);
      const dy = targetY - (lane.position?.y ?? targetY);
      const moved = dx !== 0 || dy !== 0;
      const orderChanged = (lane.data?.order ?? -1) !== index;

      if (moved || orderChanged) {
        updates.push({
          id: lane.id,
          ...(moved ? { position: { x: targetX, y: targetY } } : {}),
          ...(orderChanged
            ? { data: { ...(lane.data ?? { label: 'Lane' }), order: index } }
            : {}),
        } as Pick<Node, 'id'> & Partial<Node>);
      }
      if (moved) {
        for (const child of this.model.getChildren(lane.id)) {
          const p = child.position ?? { x: 0, y: 0 };
          updates.push({ id: child.id, position: { x: p.x + dx, y: p.y + dy } });
        }
      }

      cursorY += lane.size?.height ?? LANE_MIN_CONTENT.height;
    });

    if (updates.length) {
      this.model.updateNodes(updates);
    }
  }

  /* ── Manual lane resize ───────────────────────────────────── */

  /**
   * A lane was resized by hand: match every other lane to its (possibly new)
   * width so all lanes stay equal, then re-stack so a taller/shorter lane
   * pushes the lanes below it — no overlaps, no gaps.
   */
  onLaneResized(lane: Node): void {
    if (!isSwimlane(lane)) return;
    const width = lane.size?.width;
    if (width) this.syncLaneWidths(width, lane.id);
    this.arrangeLanes();
  }

  /**
   * Match every lane to the given width, keeping each lane's own height and
   * position. `skipId` (the just-resized lane) is left untouched so we don't
   * fight the gesture that already set it.
   */
  syncLaneWidths(width: number, skipId?: string): void {
    const updates = this.lanes()
      .filter((lane) => lane.id !== skipId && (lane.size?.width ?? 0) !== width)
      .map((lane) => ({
        id: lane.id,
        size: { width, height: lane.size?.height ?? LANE_MIN_CONTENT.height },
      }));
    if (updates.length) this.model.updateNodes(updates);
  }

  /**
   * Minimum size a lane may be resized to. Width is GLOBAL — the widest content
   * across *all* lanes — because every lane shares one width, so shrinking one
   * lane must not push another lane's content outside. Height is per-lane (its
   * own content). Used as the diagram's `resize.getMinNodeSize` for lanes.
   */
  laneMinSize(lane: Node): Size {
    const widthFloor =
      LANE_HEADER_WIDTH + LANE_PADDING.left + LANE_MIN_CONTENT.width + LANE_PADDING.right;
    const heightFloor = LANE_PADDING.top + LANE_MIN_CONTENT.height + LANE_PADDING.bottom;

    let width = widthFloor;
    for (const l of this.lanes()) {
      const left = l.position?.x ?? 0;
      for (const c of this.model.getChildren(l.id).filter(isBpmnElement)) {
        const right = (c.position?.x ?? 0) + (c.size?.width ?? 0);
        width = Math.max(width, right - left + LANE_PADDING.right);
      }
    }

    let height = heightFloor;
    const top = lane.position?.y ?? 0;
    for (const c of this.model.getChildren(lane.id).filter(isBpmnElement)) {
      const bottom = (c.position?.y ?? 0) + (c.size?.height ?? 0);
      height = Math.max(height, bottom - top + LANE_PADDING.bottom);
    }

    return { width: Math.ceil(width), height: Math.ceil(height) };
  }

  /** The swimlane whose rectangle contains the given flow-space point, if any. */
  laneAtPoint(point: { x: number; y: number }): SwimlaneNode | undefined {
    return this.lanes().find((lane) => {
      const p = lane.position ?? { x: 0, y: 0 };
      const s = lane.size ?? { width: 0, height: 0 };
      return point.x >= p.x && point.x <= p.x + s.width && point.y >= p.y && point.y <= p.y + s.height;
    });
  }

  /* ── Drop handling ────────────────────────────────────────── */

  /**
   * A freshly-dropped lane joins the bottom of the stack, adopts the shared
   * lane width, and triggers a re-stack.
   */
  onLaneAdded(laneId: string): void {
    const all = this.lanes();
    const lane = all.find((l) => l.id === laneId);
    if (!lane) return;

    // Lanes never move by hand — only via reorder / layout.
    this.model.updateNode(lane.id, { draggable: false });

    const others = all.filter((l) => l.id !== laneId);
    const width = others.length
      ? Math.max(...others.map((l) => l.size?.width ?? 0))
      : (lane.size?.width ?? LANE_DEFAULT_SIZE.width);

    // Match the shared width; arrangeLanes handles x/y and order.
    this.nodes.resizeNode(
      lane.id,
      { width, height: lane.size?.height ?? LANE_DEFAULT_SIZE.height },
      lane.position,
      true,
    );

    // Deterministic order: existing lanes (by order) then the new one last.
    this.arrangeLanes([...others, lane]);
  }
}
