import type { BasePaletteItemData, NgDiagramPaletteItem } from 'ng-diagram';
import { BpmnNodeType, LANE_DEFAULT_SIZE, NODE_SIZE, type BpmnNodeData, type SwimlaneData } from './bpmn.model';

export interface PaletteEntry {
  /** Group heading in the palette. */
  section: string;
  label: string;
  /** Icon name of the tile glyph in the app sprite (IconSpriteComponent). */
  glyph: string;
  item: NgDiagramPaletteItem;
}

function node(type: string, data: BpmnNodeData): NgDiagramPaletteItem {
  // BpmnNodeData has `label`, so it satisfies BasePaletteItemData.
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

export const PALETTE: PaletteEntry[] = [
  {
    section: 'Events',
    label: 'Start',
    glyph: 'bpmn-start',
    item: node(BpmnNodeType.StartEvent, { label: 'Start' }),
  },
  {
    section: 'Events',
    label: 'End',
    glyph: 'bpmn-end',
    item: node(BpmnNodeType.EndEvent, { label: 'End' }),
  },
  {
    section: 'Events',
    label: 'Intermediate',
    glyph: 'bpmn-intermediate',
    item: node(BpmnNodeType.IntermediateEvent, { label: 'Intermediate' }),
  },
  {
    section: 'Activities',
    label: 'Task',
    glyph: 'bpmn-task',
    item: node(BpmnNodeType.Task, { label: 'Task' }),
  },
  {
    section: 'Activities',
    label: 'User Task',
    glyph: 'bpmn-user-task',
    item: node(BpmnNodeType.UserTask, { label: 'User Task' }),
  },
  {
    section: 'Activities',
    label: 'Service Task',
    glyph: 'bpmn-service-task',
    item: node(BpmnNodeType.ServiceTask, { label: 'Service Task' }),
  },
  {
    section: 'Gateways',
    label: 'Exclusive',
    glyph: 'bpmn-exclusive',
    item: node(BpmnNodeType.ExclusiveGateway, { label: 'Condition?' }),
  },
  {
    section: 'Gateways',
    label: 'Parallel',
    glyph: 'bpmn-parallel',
    item: node(BpmnNodeType.ParallelGateway, { label: 'Parallel' }),
  },
  {
    section: 'Containers',
    label: 'Swimlane',
    glyph: 'bpmn-lane',
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
