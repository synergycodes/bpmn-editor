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
  const nodes: Node[] = [
    lane('lane-customer', 'Customer', 0),
    lane('lane-system', 'System', 1),

    element('start', BpmnNodeType.StartEvent, 'lane-customer', 'Start', columnX.start, laneCenterY(0)),
    element('t-request', BpmnNodeType.UserTask, 'lane-customer', 'Submit Request', columnX.request, laneCenterY(0)),
    element('gw', BpmnNodeType.ExclusiveGateway, 'lane-customer', 'Approved?', columnX.decide, laneCenterY(0)),
    element('t-revise', BpmnNodeType.Task, 'lane-customer', 'Revise Request', columnX.revise, laneCenterY(0)),
    element('end', BpmnNodeType.EndEvent, 'lane-customer', 'Done', columnX.end, laneCenterY(0)),
    element('t-validate', BpmnNodeType.ServiceTask, 'lane-system', 'Validate', columnX.request, laneCenterY(1)),
    element('t-process', BpmnNodeType.ServiceTask, 'lane-system', 'Process', columnX.revise, laneCenterY(1)),
  ];

  const edges: Edge[] = [
    sequenceFlow('e1', 'start', 't-request'),
    sequenceFlow('e2', 't-request', 'gw'),
    sequenceFlow('e3', 'gw', 't-revise', 'No'),
    sequenceFlow('e4', 't-revise', 'end'),
    sequenceFlow('e5', 't-validate', 't-process'),
    messageFlow('m1', 't-request', 't-validate'),
  ];

  return { nodes, edges };
}

/* ============================================================================
   Seed helpers — placement math and node/edge factories.
   ========================================================================== */

const columnX = { start: 160, request: 286, decide: 506, revise: 636, end: 856 };

function laneCenterY(laneOrder: number): number {
  return LANE_ORIGIN.y + laneOrder * LANE_DEFAULT_SIZE.height + LANE_DEFAULT_SIZE.height / 2;
}

/** A swimlane at its stacking position. */
function lane(id: string, label: string, order: number): Node {
  return {
    id,
    type: BpmnNodeType.Swimlane,
    isGroup: true,
    resizable: true,
    autoSize: false,
    draggable: false,
    position: { x: LANE_ORIGIN.x, y: LANE_ORIGIN.y + order * LANE_DEFAULT_SIZE.height },
    size: { ...LANE_DEFAULT_SIZE },
    data: { label, order },
  } as Node;
}

/** A flow element, vertically centered on `centerY`. */
function element(
  id: string,
  type: string,
  laneId: string,
  label: string,
  x: number,
  centerY: number,
): Node {
  return {
    id,
    type,
    groupId: laneId,
    resizable: false,
    autoSize: false,
    position: { x, y: centerY - NODE_SIZE[type].height / 2 },
    size: { ...NODE_SIZE[type] },
    data: { label },
  } as Node;
}

/** A solid, arrowed sequence flow running left to right. */
function sequenceFlow(id: string, source: string, target: string, label?: string): Edge {
  return {
    id,
    source,
    target,
    sourcePort: 'right',
    targetPort: 'left',
    type: BPMN_EDGE_TYPE,
    routing: 'orthogonal',
    data: { kind: BpmnEdgeKind.Sequence, label },
  } as Edge;
}

/** A dashed cross-lane message flow (excluded from auto-layout). */
function messageFlow(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    sourcePort: 'bottom',
    targetPort: 'top',
    type: BPMN_EDGE_TYPE,
    routing: 'orthogonal',
    data: { kind: BpmnEdgeKind.Message },
  } as Edge;
}
