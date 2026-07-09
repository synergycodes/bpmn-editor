import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgDiagramNodeSelectedDirective, NgDiagramPortComponent } from 'ng-diagram';
import { BpmnElementNode } from '../bpmn-element-node';

/**
 * BPMN events — circles: thin ring for start, thick for end, double ring for
 * intermediate. The label below the glyph is editable inline (double-click).
 */
@Component({
  selector: 'app-event-node',
  standalone: true,
  imports: [NgDiagramPortComponent, NgDiagramNodeSelectedDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './event-node.component.html',
  styleUrl: './event-node.component.scss',
})
export class EventNodeComponent extends BpmnElementNode {}
