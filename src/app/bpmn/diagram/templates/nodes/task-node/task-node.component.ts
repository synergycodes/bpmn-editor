import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgDiagramNodeSelectedDirective, NgDiagramPortComponent } from 'ng-diagram';
import { IconComponent } from '../../../../../shared/icons/icon.component';
import { BpmnElementNode } from '../bpmn-element-node';

/**
 * BPMN activities — rounded rectangles with a small icon for the typed
 * variants (user, service). Labels are editable inline (double-click).
 */
@Component({
  selector: 'app-task-node',
  standalone: true,
  imports: [IconComponent, NgDiagramPortComponent, NgDiagramNodeSelectedDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-node.component.html',
  styleUrl: './task-node.component.scss',
})
export class TaskNodeComponent extends BpmnElementNode {}
