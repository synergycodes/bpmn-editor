import type { BasePaletteItemData, NgDiagramPaletteItem } from 'ng-diagram';
import { BpmnNodeType, LANE_DEFAULT_SIZE, NODE_SIZE, type BpmnNodeData, type SwimlaneData } from './bpmn.model';

export interface PaletteEntry {
  /** Group heading in the palette. */
  section: string;
  label: string;
  /** Simple inline-SVG glyph markup for the palette tile. */
  glyph: string;
  item: NgDiagramPaletteItem;
}

function node(type: string, data: BpmnNodeData): NgDiagramPaletteItem {
  // BpmnNodeData has `label`, so it satisfies BasePaletteItemData; extra fields
  // (kind, …) are preserved at runtime (ng-diagram widens data to base only at
  // the type level).
  return {
    type,
    data: data as BasePaletteItemData,
    size: NODE_SIZE[type],
    // Elements have fixed shapes — keep the declared size, don't shrink to content.
    autoSize: false,
    resizable: false,
    rotatable: false,
  };
}

/* Minimal glyphs (stroke = currentColor) used for the palette tiles. */
const G = {
  start: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>',
  end: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3.5"/>',
  intermediate:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  task: '<rect x="3" y="6" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  user: '<rect x="3" y="6" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="10.5" r="1.6" fill="currentColor"/><path d="M5.4 15c.3-1.6 1.4-2.4 2.6-2.4s2.3.8 2.6 2.4" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  service:
    '<rect x="3" y="6" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.6 12a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 0 0-2.8 0z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10 8.6v-1M10 16.4v-1M6.6 12h-1M14.4 12h-1" stroke="currentColor" stroke-width="1.2"/>',
  exclusive:
    '<path d="M12 3l9 9-9 9-9-9z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8"/>',
  parallel:
    '<path d="M12 3l9 9-9 9-9-9z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.8"/>',
  lane: '<rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 5v14" stroke="currentColor" stroke-width="1.6"/>',
};

export const PALETTE: PaletteEntry[] = [
  {
    section: 'Events',
    label: 'Start',
    glyph: G.start,
    item: node(BpmnNodeType.StartEvent, { label: 'Start', kind: 'event' }),
  },
  {
    section: 'Events',
    label: 'End',
    glyph: G.end,
    item: node(BpmnNodeType.EndEvent, { label: 'End', kind: 'event' }),
  },
  {
    section: 'Events',
    label: 'Intermediate',
    glyph: G.intermediate,
    item: node(BpmnNodeType.IntermediateEvent, { label: 'Intermediate', kind: 'event' }),
  },
  {
    section: 'Activities',
    label: 'Task',
    glyph: G.task,
    item: node(BpmnNodeType.Task, { label: 'Task', kind: 'task' }),
  },
  {
    section: 'Activities',
    label: 'User Task',
    glyph: G.user,
    item: node(BpmnNodeType.UserTask, { label: 'User Task', kind: 'task' }),
  },
  {
    section: 'Activities',
    label: 'Service Task',
    glyph: G.service,
    item: node(BpmnNodeType.ServiceTask, { label: 'Service Task', kind: 'task' }),
  },
  {
    section: 'Gateways',
    label: 'Exclusive',
    glyph: G.exclusive,
    item: node(BpmnNodeType.ExclusiveGateway, { label: '', kind: 'gateway' }),
  },
  {
    section: 'Gateways',
    label: 'Parallel',
    glyph: G.parallel,
    item: node(BpmnNodeType.ParallelGateway, { label: '', kind: 'gateway' }),
  },
  {
    section: 'Containers',
    label: 'Swimlane',
    glyph: G.lane,
    item: {
      type: BpmnNodeType.Swimlane,
      isGroup: true,
      resizable: true,
      rotatable: false,
      autoSize: false,
      size: { ...LANE_DEFAULT_SIZE },
      // `order` is assigned on drop (append to the bottom of the stack).
      data: { label: 'New Lane', order: -1 } as SwimlaneData as BasePaletteItemData,
    },
  },
];

export const PALETTE_SECTIONS = ['Events', 'Activities', 'Gateways', 'Containers'] as const;
