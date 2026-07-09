import type { Edge, NgDiagramConfig, Node, Port, Size } from 'ng-diagram';
import { BPMN_EDGE_TYPE, BpmnEdgeKind, isSwimlane } from '../model/bpmn.model';

/**
 * Diagram engine configuration. Governs grouping rules (only flow elements may
 * join a swimlane), orthogonal edge routing (BPMN house style), and turns every
 * user-drawn connection into a typed BPMN sequence flow.
 *
 * @param laneMinSize returns the minimum resize size for a lane. Width is the
 *   GLOBAL widest content across all lanes (lanes share one width), so a lane
 *   can never be shrunk to a point where another lane's content overflows.
 */
export function buildDiagramConfig(laneMinSize: (lane: Node) => Size): NgDiagramConfig {
  return {
    edgeRouting: {
      defaultRouting: 'orthogonal',
    },
    resize: {
      // Never let a lane (or any node) shrink smaller than the elements it holds.
      allowResizeBelowChildrenBounds: false,
      getMinNodeSize: (node: Node): Size =>
        isSwimlane(node) ? laneMinSize(node) : { width: 20, height: 20 },
    },
    grouping: {
      // Only real flow elements may be grouped, and only into a swimlane.
      canGroup: (node: Node, group: Node) => isSwimlane(group) && !isSwimlane(node),
    },
    linking: {
      // Do not allow a swimlane itself to be a connection endpoint.
      validateConnection: (source: Node | null, _sourcePort: Port | null, target: Node | null) =>
        !!source && !!target && !isSwimlane(source) && !isSwimlane(target),
      // Materialise drawn links as BPMN sequence flows.
      finalEdgeDataBuilder: (edge: Edge) =>
        ({
          ...edge,
          type: BPMN_EDGE_TYPE,
          routing: 'orthogonal',
          data: { ...(edge.data ?? {}), kind: BpmnEdgeKind.Sequence },
        }) as Edge,
    },
  } satisfies NgDiagramConfig;
}
