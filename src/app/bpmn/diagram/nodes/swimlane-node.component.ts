import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  NgDiagramGroupHighlightedDirective,
  NgDiagramNodeResizeAdornmentComponent,
  NgDiagramNodeSelectedDirective,
  type GroupNode,
  type NgDiagramGroupNodeTemplate,
} from 'ng-diagram';
import { LANE_HEADER_WIDTH, type SwimlaneData } from '../../model/bpmn.model';
import { SwimlaneService } from '../swimlane.service';

/**
 * Swimlane pool, backed by an ng-diagram group. Draws the left header band
 * (rotated title + reorder controls) and the lane body. Group children (BPMN
 * elements) are rendered by the engine as separate canvas nodes positioned in
 * global coordinates — they float above this container, so no content
 * projection is needed here.
 */
@Component({
  selector: 'app-swimlane-node',
  standalone: true,
  imports: [
    NgDiagramNodeResizeAdornmentComponent,
    NgDiagramNodeSelectedDirective,
    NgDiagramGroupHighlightedDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './swimlane-node.component.html',
  styleUrl: './swimlane-node.component.scss',
})
export class SwimlaneNodeComponent implements NgDiagramGroupNodeTemplate<SwimlaneData> {
  private readonly swimlanes = inject(SwimlaneService);

  node = input.required<GroupNode<SwimlaneData>>();

  protected readonly headerWidth = LANE_HEADER_WIDTH;
  protected readonly title = computed(() => this.node().data?.label ?? 'Lane');

  moveUp(event: Event): void {
    event.stopPropagation();
    this.swimlanes.moveLane(this.node().id, -1);
  }

  moveDown(event: Event): void {
    event.stopPropagation();
    this.swimlanes.moveLane(this.node().id, +1);
  }

  stop(event: Event): void {
    event.stopPropagation();
  }
}
