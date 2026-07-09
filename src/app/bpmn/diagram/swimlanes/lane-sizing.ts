import type { Node, Size } from 'ng-diagram';
import {
  isBpmnElement,
  LANE_HEADER_WIDTH,
  LANE_MIN_CONTENT,
  LANE_PADDING,
  type SwimlaneNode,
} from '../../model/bpmn.model';
import type { NodeUpdate } from './lane-stacking';

/** Updates that match every other lane to the resized lane's width. */
export function computeWidthSyncUpdates(lanes: SwimlaneNode[], resized: Node): NodeUpdate[] {
  const width = resized.size?.width;
  if (!width) return [];
  return lanes
    .filter((lane) => lane.id !== resized.id && (lane.size?.width ?? 0) !== width)
    .map((lane) => ({
      id: lane.id,
      size: { width, height: lane.size?.height ?? LANE_MIN_CONTENT.height },
    }));
}

/**
 * Minimum size a lane may be resized to. Width is GLOBAL — the widest content
 * across *all* lanes — because every lane shares one width, so shrinking one
 * lane must not push another lane's content outside. Height is per-lane (its
 * own content). Used as the diagram's `resize.getMinNodeSize` for lanes.
 */
export function computeLaneMinSize(
  lanes: SwimlaneNode[],
  lane: Node,
  childrenOf: (laneId: string) => Node[],
): Size {
  const widthFloor =
    LANE_HEADER_WIDTH + LANE_PADDING.left + LANE_MIN_CONTENT.width + LANE_PADDING.right;
  const heightFloor = LANE_PADDING.top + LANE_MIN_CONTENT.height + LANE_PADDING.bottom;

  let width = widthFloor;
  for (const l of lanes) {
    const left = l.position?.x ?? 0;
    for (const c of childrenOf(l.id).filter(isBpmnElement)) {
      const right = (c.position?.x ?? 0) + (c.size?.width ?? 0);
      width = Math.max(width, right - left + LANE_PADDING.right);
    }
  }

  let height = heightFloor;
  const top = lane.position?.y ?? 0;
  for (const c of childrenOf(lane.id).filter(isBpmnElement)) {
    const bottom = (c.position?.y ?? 0) + (c.size?.height ?? 0);
    height = Math.max(height, bottom - top + LANE_PADDING.bottom);
  }

  return { width: Math.ceil(width), height: Math.ceil(height) };
}
