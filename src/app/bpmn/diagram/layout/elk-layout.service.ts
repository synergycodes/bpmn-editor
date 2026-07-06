import { Injectable } from '@angular/core';
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Edge, Node } from 'ng-diagram';
import { NODE_SIZE } from '../../model/bpmn.model';

export interface LaneLayoutResult {
  /** New child positions, relative to the lane content origin (0,0 = top-left of content). */
  positions: Map<string, { x: number; y: number }>;
  /** Bounding size of the laid-out content. */
  width: number;
  height: number;
}

/**
 * Wraps elkjs. Runs a layered ("digraph") layout over the flow elements of a
 * single swimlane. Only the edges passed in are used — the caller is
 * responsible for filtering out message flows, associations, cross-lane
 * connections and any edge BPMN treats as invalid for layout.
 */
@Injectable()
export class ElkLayoutService {
  private readonly elk = new ELK();

  /** Left-to-right layered layout. Ported from the Synergy Codes workflow apps. */
  private readonly layoutOptions: Record<string, string> = {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.spacing.nodeNode': '48',
    'elk.spacing.edgeNode': '40',
    'elk.layered.spacing.nodeNodeBetweenLayers': '72',
    'elk.layered.spacing.edgeNodeBetweenLayers': '32',
    'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  };

  async layoutLane(children: Node[], layoutEdges: Edge[]): Promise<LaneLayoutResult> {
    const positions = new Map<string, { x: number; y: number }>();

    if (children.length === 0) {
      return { positions, width: 0, height: 0 };
    }

    const childIds = new Set(children.map((c) => c.id));

    const elkChildren: ElkNode[] = children.map((node) => {
      const size = this.sizeOf(node);
      return { id: node.id, width: size.width, height: size.height };
    });

    // Keep only edges whose both ends are children of this lane.
    const elkEdges = layoutEdges
      .filter((e) => childIds.has(e.source) && childIds.has(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] }));

    const graph: ElkNode = {
      id: 'lane-root',
      layoutOptions: this.layoutOptions,
      children: elkChildren,
      edges: elkEdges,
    };

    const result = await this.elk.layout(graph);

    let width = 0;
    let height = 0;
    for (const child of result.children ?? []) {
      const x = child.x ?? 0;
      const y = child.y ?? 0;
      positions.set(child.id, { x, y });
      width = Math.max(width, x + (child.width ?? 0));
      height = Math.max(height, y + (child.height ?? 0));
    }

    return { positions, width, height };
  }

  private sizeOf(node: Node): { width: number; height: number } {
    if (node.size?.width && node.size?.height) {
      return { width: node.size.width, height: node.size.height };
    }
    const fallback = node.type ? NODE_SIZE[node.type] : undefined;
    return fallback ?? { width: 120, height: 72 };
  }
}
