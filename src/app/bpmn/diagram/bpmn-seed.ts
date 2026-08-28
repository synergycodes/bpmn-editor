import type { Edge, Node } from 'ng-diagram';
import {
  BPMN_EDGE_TYPE,
  BpmnEdgeKind,
  BpmnNodeType,
  LANE_HEADER_WIDTH,
  LANE_ORIGIN,
  LANE_PADDING,
  NODE_SIZE,
} from '../model/bpmn.model';

export function seedModel(): { nodes: Node[]; edges: Edge[] } {
  const T = BpmnNodeType;
  const [customer, service, warehouse] = stackLanes([
    { id: 'lane-customer', label: 'Customer', height: 200 },
    { id: 'lane-order-service', label: 'Order Service', height: 320 },
    { id: 'lane-warehouse', label: 'Warehouse', height: 280 },
  ]);

  const cy = customer.centerY;
  const sy = service.top + LANE_PADDING.top + NODE_SIZE[T.Task].height / 2;

  const syRejected =
    sy + NODE_SIZE[T.ExclusiveGateway].height / 2 + 90 + NODE_SIZE[T.EndEvent].height / 2;
  const wy = warehouse.centerY;
  const wyUpper = wy - (NODE_SIZE[T.Task].height + ROW_GAP) / 2;
  const wyLower = wy + (NODE_SIZE[T.Task].height + ROW_GAP) / 2;

  const elements: Node[] = [
    // Customer
    element('c-start', T.StartEvent, customer.id, 'Product Needed', 140, cy),
    element('c-order', T.UserTask, customer.id, 'Place Order', 266, cy),
    element('c-pay', T.UserTask, customer.id, 'Pay Invoice', 539, cy),
    element('c-receive', T.Task, customer.id, 'Receive Package', 756, cy),
    element('c-end', T.EndEvent, customer.id, 'Order Complete', 976, cy),

    // Order Service
    element('s-start', T.StartEvent, service.id, 'Order Received', 140, sy),
    element('s-stock', T.ExclusiveGateway, service.id, 'In Stock?', 256, sy),
    element('s-confirm', T.ServiceTask, service.id, 'Confirm Order', 376, sy),
    element('s-paid', T.IntermediateEvent, service.id, 'Payment Received', 586, sy),
    element('s-done', T.EndEvent, service.id, 'Order Processed', 702, sy),
    element('s-rejected', T.EndEvent, service.id, 'Order Rejected', 258, syRejected),

    // Warehouse
    element('w-start', T.StartEvent, warehouse.id, 'Order Confirmed', 150, wy),
    element('w-fork', T.ParallelGateway, warehouse.id, '', 276, wy),
    element('w-pick', T.Task, warehouse.id, 'Pick Items', 406, wyUpper),
    element('w-label', T.ServiceTask, warehouse.id, 'Print Label', 406, wyLower),
    element('w-join', T.ParallelGateway, warehouse.id, '', 626, wy),
    element('w-ship', T.Task, warehouse.id, 'Ship Package', 756, wy),
    element('w-end', T.EndEvent, warehouse.id, 'Package Shipped', 976, wy),
  ];

  const edges: Edge[] = [
    // Customer
    sequenceFlow('c1', 'c-start', 'c-order'),
    sequenceFlow('c2', 'c-order', 'c-pay'),
    sequenceFlow('c3', 'c-pay', 'c-receive'),
    sequenceFlow('c4', 'c-receive', 'c-end'),

    // Order Service
    sequenceFlow('s1', 's-start', 's-stock'),
    sequenceFlow('s2', 's-stock', 's-confirm', { label: 'Yes' }),
    sequenceFlow('s3', 's-confirm', 's-paid'),
    sequenceFlow('s4', 's-paid', 's-done'),
    sequenceFlow('s5', 's-stock', 's-rejected', { label: 'No', from: 'bottom', to: 'top' }),

    // Warehouse - the parallel branches leave / rejoin the gateways vertically.
    sequenceFlow('w1', 'w-start', 'w-fork'),
    sequenceFlow('w2', 'w-fork', 'w-pick', { from: 'top' }),
    sequenceFlow('w3', 'w-fork', 'w-label', { from: 'bottom' }),
    sequenceFlow('w4', 'w-pick', 'w-join', { to: 'top' }),
    sequenceFlow('w5', 'w-label', 'w-join', { to: 'bottom' }),
    sequenceFlow('w6', 'w-join', 'w-ship'),
    sequenceFlow('w7', 'w-ship', 'w-end'),

    // Hand-offs between the participants.
    messageFlow('m1', 'c-order', 's-start'),
    messageFlow('m2', 's-confirm', 'w-start'),
    messageFlow('m3', 'c-pay', 's-paid'),
    messageFlow('m4', 'w-ship', 'c-receive', { from: 'top', to: 'bottom' }),
  ];

  // Every lane shares one width: wide enough for the widest row of elements.
  const laneWidth = laneWidthFor(elements);
  const lanes = [customer, service, warehouse].map((l) => lane(l, laneWidth));

  return { nodes: [...lanes, ...elements], edges };
}

/* ============================================================================
   Seed helpers - placement math and node/edge factories.
   ========================================================================== */

/** Vertical gap between two rows of elements inside a lane. */
const ROW_GAP = 48;

type PortSide = 'top' | 'right' | 'bottom' | 'left';

interface LaneSpec {
  id: string;
  label: string;
  height: number;
}

interface LaneGeometry extends LaneSpec {
  /** Stacking order (0 = topmost). */
  order: number;
  /** Global y of the lane's top edge. */
  top: number;
  /** Global y of the lane's horizontal centre line. */
  centerY: number;
}

/** Stacks the lanes flush top to bottom starting at LANE_ORIGIN. */
function stackLanes(specs: LaneSpec[]): LaneGeometry[] {
  let top = LANE_ORIGIN.y;
  return specs.map((spec, order) => {
    const geometry = { ...spec, order, top, centerY: top + spec.height / 2 };
    top += spec.height;
    return geometry;
  });
}

/** Width that fits every element's right edge plus the lane padding. */
function laneWidthFor(elements: Node[]): number {
  const contentLeft = LANE_ORIGIN.x + LANE_HEADER_WIDTH + LANE_PADDING.left;
  const contentRight = Math.max(
    contentLeft,
    ...elements.map((n) => n.position.x + (n.size?.width ?? 0)),
  );
  return contentRight - LANE_ORIGIN.x + LANE_PADDING.right;
}

/** A swimlane node at its stacking position. */
function lane({ id, label, order, top, height }: LaneGeometry, width: number): Node {
  return {
    id,
    type: BpmnNodeType.Swimlane,
    isGroup: true,
    resizable: true,
    autoSize: false,
    draggable: false,
    position: { x: LANE_ORIGIN.x, y: top },
    size: { width, height },
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

/** A solid, arrowed sequence flow - left to right unless ports say otherwise. */
function sequenceFlow(
  id: string,
  source: string,
  target: string,
  { label, from = 'right', to = 'left' }: { label?: string; from?: PortSide; to?: PortSide } = {},
): Edge {
  return {
    id,
    source,
    target,
    sourcePort: from,
    targetPort: to,
    type: BPMN_EDGE_TYPE,
    routing: 'orthogonal',
    data: { kind: BpmnEdgeKind.Sequence, label },
  } as Edge;
}

/**
 * A dashed cross-lane message flow (excluded from auto-layout) - downwards
 * unless ports say otherwise.
 */
function messageFlow(
  id: string,
  source: string,
  target: string,
  { from = 'bottom', to = 'top' }: { from?: PortSide; to?: PortSide } = {},
): Edge {
  return {
    id,
    source,
    target,
    sourcePort: from,
    targetPort: to,
    type: BPMN_EDGE_TYPE,
    routing: 'orthogonal',
    data: { kind: BpmnEdgeKind.Message },
  } as Edge;
}
