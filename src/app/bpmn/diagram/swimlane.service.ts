import { inject, Injectable } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramNodeService,
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
 * equal-width alignment, resize-to-fit after a child layout, and the elkjs
 * layered layout of the elements inside each lane.
 */
@Injectable()
export class SwimlaneService {
  private readonly model = inject(NgDiagramModelService);
  private readonly nodes = inject(NgDiagramNodeService);
  private readonly viewport = inject(NgDiagramViewportService);
  private readonly elk = inject(ElkLayoutService);

  /** Swimlanes sorted by their stacking order (top → bottom). */
  lanes(): SwimlaneNode[] {
    return this.model
      .nodes()
      .filter(isSwimlane)
      .sort((a, b) => (a.data?.order ?? 0) - (b.data?.order ?? 0));
  }

  /**
   * Set a lane's order. `updateNodeData` REPLACES the data object, so we must
   * spread the existing data to preserve the lane title.
   */
  private setOrder(lane: SwimlaneNode, order: number): void {
    if ((lane.data?.order ?? -1) === order) return;
    this.model.updateNodeData(lane.id, { ...(lane.data ?? { label: 'Lane' }), order });
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

    this.model.updateNodes(nodeUpdates);
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
   * delta, and each lane's `order` is normalised to its new index. No elk.
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

      if (dx !== 0 || dy !== 0) {
        updates.push({ id: lane.id, position: { x: targetX, y: targetY } });
        for (const child of this.model.getChildren(lane.id)) {
          const p = child.position ?? { x: 0, y: 0 };
          updates.push({ id: child.id, position: { x: p.x + dx, y: p.y + dy } });
        }
      }

      this.setOrder(lane, index);

      cursorY += lane.size?.height ?? LANE_MIN_CONTENT.height;
    });

    if (updates.length) {
      this.model.updateNodes(updates);
    }
  }

  /**
   * Size every lane to the bounds of its children and re-stack the lanes so
   * none overlap. Called after a node is dragged/dropped into (or out of) a
   * lane. NOT a layout — the children's relative arrangement is untouched; the
   * lane just wraps them (each lane's content block is pinned to the lane top
   * so there's no gap/overflow) and the lanes below shift to stay flush.
   */
  refitLanes(): void {
    const lanes = this.lanes();
    if (lanes.length === 0) return;

    // Uniform width: fit the widest content, but never narrower than the
    // current widest lane (so a manual widen sticks).
    const laneWidth = Math.max(
      this.laneMinSize(lanes[0]).width,
      ...lanes.map((l) => l.size?.width ?? 0),
    );

    const updates: (Pick<Node, 'id'> & Partial<Node>)[] = [];
    let cursorY = LANE_ORIGIN.y;

    lanes.forEach((lane, index) => {
      const laneX = LANE_ORIGIN.x;
      const laneY = cursorY;
      const children = this.model.getChildren(lane.id).filter(isBpmnElement);

      let laneHeight: number;
      let shiftX = 0;
      let shiftY = 0;

      if (children.length) {
        const minTop = Math.min(...children.map((c) => c.position?.y ?? 0));
        const maxBottom = Math.max(...children.map((c) => (c.position?.y ?? 0) + (c.size?.height ?? 0)));
        const contentHeight = Math.max(LANE_MIN_CONTENT.height, maxBottom - minTop);
        laneHeight = LANE_PADDING.top + contentHeight + LANE_PADDING.bottom;
        // Pin the content block: topmost child → lane content top. This single
        // delta also absorbs the re-stack move, so children keep their relative
        // positions and always sit inside the lane.
        shiftY = laneY + LANE_PADDING.top - minTop;
        shiftX = laneX - (lane.position?.x ?? laneX);
      } else {
        laneHeight = LANE_PADDING.top + LANE_MIN_CONTENT.height + LANE_PADDING.bottom;
      }

      updates.push({
        id: lane.id,
        position: { x: laneX, y: laneY },
        size: { width: laneWidth, height: laneHeight },
        data: { ...(lane.data ?? { label: 'Lane' }), order: index },
      } as Pick<Node, 'id'> & Partial<Node>);

      if (shiftX !== 0 || shiftY !== 0) {
        for (const c of children) {
          const p = c.position ?? { x: 0, y: 0 };
          updates.push({ id: c.id, position: { x: p.x + shiftX, y: p.y + shiftY } });
        }
      }

      cursorY += laneHeight;
    });

    this.model.updateNodes(updates);
  }

  /* ── Manual lane resize ───────────────────────────────────── */

  /**
   * A lane was resized by hand: match every other lane to its (possibly new)
   * width so all lanes stay equal, then re-stack so a taller/shorter lane
   * pushes the lanes below it — no overlaps, no gaps.
   */
  onLaneResized(laneId: string): void {
    const lane = this.model.getNodeById(laneId);
    if (!isSwimlane(lane)) return;
    const width = lane.size?.width;
    if (width) this.syncLaneWidths(width, laneId);
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
   * lane width, and triggers a re-stack. Call after the model has committed
   * the new node (defer one tick from the drop handler).
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
