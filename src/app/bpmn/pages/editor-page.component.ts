import { ChangeDetectionStrategy, Component } from '@angular/core';
import { provideNgDiagram } from 'ng-diagram';
import { DiagramComponent } from '../diagram/diagram.component';
import { ElkLayoutService } from '../diagram/layout/elk-layout.service';
import { SwimlaneService } from '../diagram/swimlane.service';
import { PaletteComponent } from '../palette/palette.component';
import { ToolbarComponent } from '../toolbar/toolbar.component';

/**
 * The routed editor shell. It is the lowest common ancestor of the toolbar,
 * palette and diagram, so `provideNgDiagram()` (and the diagram-scoped
 * services) live here — the ng-diagram public services inject the host
 * ElementRef and must not be provided at the application root.
 */
@Component({
  selector: 'app-editor-page',
  standalone: true,
  imports: [ToolbarComponent, PaletteComponent, DiagramComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideNgDiagram(), ElkLayoutService, SwimlaneService],
  template: `
    <div class="editor">
      <app-toolbar />
      <div class="editor__body">
        <app-palette />
        <app-bpmn-diagram />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .editor {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .editor__body {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
      }
    `,
  ],
})
export class EditorPageComponent {}
