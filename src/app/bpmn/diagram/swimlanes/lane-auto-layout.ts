import type { Node } from 'ng-diagram';
import {
  LANE_HEADER_WIDTH,
  LANE_MIN_CONTENT,
  LANE_ORIGIN,
  LANE_PADDING,
  type SwimlaneNode,
} from '../../model/bpmn.model';
import type { LaneLayoutResult } from '../layout/elk-layout.service';
import type { NodeUpdate } from './lane-stacking';

export interface LaidOutLane {
  lane: SwimlaneNode;
  children: Node[];
  result: LaneLayoutResult;
}

/**
 * Updates that apply the elk results: every lane gets the width of the
 * widest content, lanes stack to fit their own content height, and children
 * land at global coordinates inside their lane.
 */
export function computeAutoLayoutUpdates(perLane: LaidOutLane[]): NodeUpdate[] {
  const maxContentWidth = Math.max(
    LANE_MIN_CONTENT.width,
    ...perLane.map((p) => p.result.width),
  );
  const laneWidth = LANE_HEADER_WIDTH + LANE_PADDING.left + maxContentWidth + LANE_PADDING.right;

  const updates: NodeUpdate[] = [];
  let cursorY = LANE_ORIGIN.y;

  perLane.forEach(({ lane, children, result }, index) => {
    const contentHeight = Math.max(LANE_MIN_CONTENT.height, result.height);
    const laneHeight = LANE_PADDING.top + contentHeight + LANE_PADDING.bottom;
    const laneX = LANE_ORIGIN.x;
    const laneY = cursorY;

    updates.push({
      id: lane.id,
      position: { x: laneX, y: laneY },
      size: { width: laneWidth, height: laneHeight },
      data: { ...(lane.data ?? { label: 'Lane' }), order: index },
    } as NodeUpdate);

    // Children: global coords = lane origin + header + padding + elk offset.
    const contentX = laneX + LANE_HEADER_WIDTH + LANE_PADDING.left;
    const contentY = laneY + LANE_PADDING.top;
    for (const child of children) {
      const rel = result.positions.get(child.id);
      if (!rel) continue;
      updates.push({ id: child.id, position: { x: contentX + rel.x, y: contentY + rel.y } });
    }

    cursorY += laneHeight;
  });

  return updates;
}
