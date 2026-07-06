import type { Edge, Node } from 'ng-diagram';

/* ============================================================================
   BPMN node & edge type strings. These select the template component in the
   NgDiagramNodeTemplateMap / NgDiagramEdgeTemplateMap.
   ========================================================================== */

export const BpmnNodeType = {
  StartEvent: 'bpmn-start-event',
  EndEvent: 'bpmn-end-event',
  IntermediateEvent: 'bpmn-intermediate-event',
  Task: 'bpmn-task',
  UserTask: 'bpmn-user-task',
  ServiceTask: 'bpmn-service-task',
  ExclusiveGateway: 'bpmn-exclusive-gateway',
  ParallelGateway: 'bpmn-parallel-gateway',
  Swimlane: 'bpmn-swimlane',
} as const;

export type BpmnNodeType = (typeof BpmnNodeType)[keyof typeof BpmnNodeType];

export const BPMN_EDGE_TYPE = 'bpmn-edge';

/** BPMN connection kinds. Only `sequence` participates in auto-layout. */
export const BpmnEdgeKind = {
  Sequence: 'sequence',
  Message: 'message',
  Association: 'association',
} as const;

export type BpmnEdgeKind = (typeof BpmnEdgeKind)[keyof typeof BpmnEdgeKind];

/* ============================================================================
   Data contracts
   ========================================================================== */

export interface BpmnNodeData {
  label: string;
  /** Broad shape family — drives which template rendering branch is used. */
  kind: 'event' | 'task' | 'gateway';
  [key: string]: unknown;
}

export interface SwimlaneData {
  /** Lane title (also satisfies the palette's BasePaletteItemData.label). */
  label: string;
  /** Vertical stacking order (0 = topmost lane). Drives arrangement. */
  order: number;
  [key: string]: unknown;
}

export interface BpmnEdgeData {
  kind: BpmnEdgeKind;
  label?: string;
  /**
   * When true this edge is purely visual / annotative and must be excluded
   * from the layout algorithm even if it is a sequence flow.
   */
  layoutExclude?: boolean;
  [key: string]: unknown;
}

export type BpmnNode = Node<BpmnNodeData>;
export type SwimlaneNode = Node<SwimlaneData>;
export type BpmnEdge = Edge<BpmnEdgeData>;

/* ============================================================================
   Geometry constants
   ========================================================================== */

/** Default rendered sizes per node type (px). */
export const NODE_SIZE: Record<string, { width: number; height: number }> = {
  [BpmnNodeType.StartEvent]: { width: 56, height: 56 },
  [BpmnNodeType.EndEvent]: { width: 56, height: 56 },
  [BpmnNodeType.IntermediateEvent]: { width: 56, height: 56 },
  [BpmnNodeType.Task]: { width: 150, height: 84 },
  [BpmnNodeType.UserTask]: { width: 150, height: 84 },
  [BpmnNodeType.ServiceTask]: { width: 150, height: 84 },
  [BpmnNodeType.ExclusiveGateway]: { width: 60, height: 60 },
  [BpmnNodeType.ParallelGateway]: { width: 60, height: 60 },
};

/** Width of a swimlane's left header band (holds the rotated title + controls). */
export const LANE_HEADER_WIDTH = 40;
/** Padding between the lane content bounds and the lane edges. */
export const LANE_PADDING = { top: 28, right: 40, bottom: 28, left: 20 };
/** Vertical gap between stacked swimlanes. */
export const LANE_GAP = 0;
/** Default lane size before any content / layout. */
export const LANE_DEFAULT_SIZE = { width: 880, height: 200 };
/** Where the stacked lanes anchor on the canvas. */
export const LANE_ORIGIN = { x: 80, y: 80 };
/** Minimum lane content dimensions kept even when empty. */
export const LANE_MIN_CONTENT = { width: 480, height: 120 };

/* ============================================================================
   Type guards & helpers
   ========================================================================== */

export function isSwimlane(node: Node | undefined | null): node is SwimlaneNode {
  return !!node && node.type === BpmnNodeType.Swimlane;
}

export function isBpmnElement(node: Node | undefined | null): boolean {
  return !!node && !!node.type && node.type !== BpmnNodeType.Swimlane;
}

/**
 * A layout edge is a sequence flow that BPMN logic considers valid for
 * layered layout. Message flows, associations, visual-only edges and edges
 * explicitly flagged `layoutExclude` are all rejected.
 */
export function isLayoutEdge(edge: Edge<BpmnEdgeData> | undefined | null): boolean {
  if (!edge) return false;
  const data = edge.data as BpmnEdgeData | undefined;
  if (!data) return true; // untyped edges default to sequence semantics
  if (data.layoutExclude) return false;
  return data.kind === BpmnEdgeKind.Sequence;
}
