import type { Node } from 'ng-diagram';
import { isSwimlane, type SwimlaneNode } from '../../model/bpmn.model';

/** Swimlanes sorted by their stacking order (top → bottom). */
export function sortedLanes(nodes: Node[]): SwimlaneNode[] {
  return nodes.filter(isSwimlane).sort((a, b) => (a.data?.order ?? 0) - (b.data?.order ?? 0));
}

/** The lane whose rectangle contains the given flow-space point, if any. */
export function laneAtPoint(
  lanes: SwimlaneNode[],
  point: { x: number; y: number },
): SwimlaneNode | undefined {
  return lanes.find((lane) => {
    const p = lane.position ?? { x: 0, y: 0 };
    const s = lane.size ?? { width: 0, height: 0 };
    return point.x >= p.x && point.x <= p.x + s.width && point.y >= p.y && point.y <= p.y + s.height;
  });
}
