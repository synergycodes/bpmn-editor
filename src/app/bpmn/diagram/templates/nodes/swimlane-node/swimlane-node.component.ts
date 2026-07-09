import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  NgDiagramGroupHighlightedDirective,
  NgDiagramModelService,
  NgDiagramNodeResizeAdornmentComponent,
  NgDiagramNodeSelectedDirective,
  type GroupNode,
  type NgDiagramGroupNodeTemplate,
} from 'ng-diagram';
import { LANE_HEADER_WIDTH, type SwimlaneData } from '../../../../model/bpmn.model';
import { IconComponent } from '../../../../../shared/icons/icon.component';
import { InlineEditableLabel } from '../../inline-editable-label';
import { SwimlaneService } from '../../../swimlanes/swimlane.service';

/**
 * Swimlane pool, backed by an ng-diagram group. Draws the left header band and the lane body.
 */
@Component({
  selector: 'app-swimlane-node',
  standalone: true,
  imports: [
    IconComponent,
    NgDiagramNodeResizeAdornmentComponent,
    NgDiagramNodeSelectedDirective,
    NgDiagramGroupHighlightedDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './swimlane-node.component.html',
  styleUrl: './swimlane-node.component.scss',
})
export class SwimlaneNodeComponent
  extends InlineEditableLabel
  implements NgDiagramGroupNodeTemplate<SwimlaneData>
{
  private readonly swimlanes = inject(SwimlaneService);
  private readonly model = inject(NgDiagramModelService);

  node = input.required<GroupNode<SwimlaneData>>();

  protected readonly headerWidth = LANE_HEADER_WIDTH;
  protected readonly label = computed(() => this.node().data?.label ?? 'Lane');

  protected saveLabel(label: string): void {
    this.model.updateNodeData(this.node().id, { ...this.node().data, label });
  }

  moveUp(event: Event): void {
    event.stopPropagation();
    this.swimlanes.moveLane(this.node().id, -1);
  }

  moveDown(event: Event): void {
    event.stopPropagation();
    this.swimlanes.moveLane(this.node().id, +1);
  }
}
