import type { Edge, Node } from 'ng-diagram';
import {
  BPMN_EDGE_TYPE,
  BpmnEdgeKind,
  BpmnNodeType,
  LANE_DEFAULT_SIZE,
  LANE_ORIGIN,
  NODE_SIZE,
} from '../model/bpmn.model';

/** A small demo process across two swimlanes. Click "Layout" to auto-arrange. */
export function seedModel(): { nodes: Node[]; edges: Edge[] } {
  const laneW = LANE_DEFAULT_SIZE.width;
  const laneH = LANE_DEFAULT_SIZE.height;

  const lanes: Node[] = [
    {
      id: 'lane-customer',
      type: BpmnNodeType.Swimlane,
      isGroup: true,
      resizable: true,
      autoSize: false,
      draggable: false,
      position: { x: LANE_ORIGIN.x, y: LANE_ORIGIN.y },
      size: { width: laneW, height: laneH },
      data: { label: 'Customer', order: 0 },
    } as Node,
    {
      id: 'lane-system',
      type: BpmnNodeType.Swimlane,
      isGroup: true,
      resizable: true,
      autoSize: false,
      draggable: false,
      position: { x: LANE_ORIGIN.x, y: LANE_ORIGIN.y + laneH },
      size: { width: laneW, height: laneH },
      data: { label: 'System', order: 1 },
    } as Node,
  ];

  const el = (
    id: string,
    type: string,
    groupId: string,
    label: string,
    kind: 'event' | 'task' | 'gateway',
    x: number,
    y: number,
  ): Node =>
    ({
      id,
      type,
      groupId,
      resizable: false,
      autoSize: false,
      position: { x, y },
      size: { ...NODE_SIZE[type] },
      data: { label, kind },
    }) as Node;

  // Rough initial placement inside the Customer lane (y ~ 120).
  const cy = LANE_ORIGIN.y + 60;
  const sy = LANE_ORIGIN.y + laneH + 60;

  const nodes: Node[] = [
    ...lanes,
    el('start', BpmnNodeType.StartEvent, 'lane-customer', 'Start', 'event', 160, cy),
    el('t-request', BpmnNodeType.UserTask, 'lane-customer', 'Submit Request', 'task', 260, cy - 12),
    el('gw', BpmnNodeType.ExclusiveGateway, 'lane-customer', 'Approved?', 'gateway', 440, cy),
    el('t-revise', BpmnNodeType.Task, 'lane-customer', 'Revise Request', 'task', 560, cy - 12),
    el('end', BpmnNodeType.EndEvent, 'lane-customer', 'Done', 'event', 740, cy),
    el('t-validate', BpmnNodeType.ServiceTask, 'lane-system', 'Validate', 'task', 300, sy),
    el('t-process', BpmnNodeType.ServiceTask, 'lane-system', 'Process', 'task', 500, sy),
  ];

  const seq = (id: string, source: string, target: string): Edge =>
    ({
      id,
      source,
      target,
      sourcePort: 'right',
      targetPort: 'left',
      type: BPMN_EDGE_TYPE,
      routing: 'orthogonal',
      data: { kind: BpmnEdgeKind.Sequence },
    }) as Edge;

  const edges: Edge[] = [
    seq('e1', 'start', 't-request'),
    seq('e2', 't-request', 'gw'),
    seq('e3', 'gw', 't-revise'),
    seq('e4', 't-revise', 'end'),
    seq('e5', 't-validate', 't-process'),
    // Cross-lane message flow — excluded from layout.
    {
      id: 'm1',
      source: 't-request',
      target: 't-validate',
      sourcePort: 'bottom',
      targetPort: 'top',
      type: BPMN_EDGE_TYPE,
      routing: 'orthogonal',
      data: { kind: BpmnEdgeKind.Message },
    } as Edge,
  ];

  return { nodes, edges };
}
