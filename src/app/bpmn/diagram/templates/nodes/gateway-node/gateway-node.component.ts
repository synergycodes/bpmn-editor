import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgDiagramNodeSelectedDirective, NgDiagramPortComponent } from 'ng-diagram';
import { IconComponent } from '../../../../../shared/icons/icon.component';
import { BpmnElementNode } from '../bpmn-element-node';

/**
 * BPMN gateways — SVG diamonds with an "x" (exclusive) or "+" (parallel)
 * mark. The label below the glyph is editable inline (double-click).
 */
@Component({
  selector: 'app-gateway-node',
  standalone: true,
  imports: [IconComponent, NgDiagramPortComponent, NgDiagramNodeSelectedDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gateway-node.component.html',
  styleUrl: './gateway-node.component.scss',
})
export class GatewayNodeComponent extends BpmnElementNode {}
