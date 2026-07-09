import type { Node } from 'ng-diagram';
import { LANE_MIN_CONTENT, LANE_ORIGIN, type SwimlaneNode } from '../../model/bpmn.model';

export type NodeUpdate = Pick<Node, 'id'> & Partial<Node>;

/**
 * Updates that stack the lanes flush top → bottom at LANE_ORIGIN, normalize
 * `order` to the array index, and move each lane's children by the same
 * delta. Lanes that already sit right produce no update.
 */
export function computeStackUpdates(
  lanes: SwimlaneNode[],
  childrenOf: (laneId: string) => Node[],
): NodeUpdate[] {
  const updates: NodeUpdate[] = [];
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
      } as NodeUpdate);
    }
    if (moved) {
      for (const child of childrenOf(lane.id)) {
        const p = child.position ?? { x: 0, y: 0 };
        updates.push({ id: child.id, position: { x: p.x + dx, y: p.y + dy } });
      }
    }

    cursorY += lane.size?.height ?? LANE_MIN_CONTENT.height;
  });

  return updates;
}
