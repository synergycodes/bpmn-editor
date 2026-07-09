import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgDiagramService, NgDiagramViewportService } from 'ng-diagram';
import { ThemeService } from '../../core/theme.service';
import { IconComponent } from '../../shared/icons/icon.component';
import { SwimlaneService } from '../diagram/swimlanes/swimlane.service';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.scss',
})
export class ToolbarComponent {
  private readonly swimlanes = inject(SwimlaneService);
  private readonly viewport = inject(NgDiagramViewportService);
  private readonly diagram = inject(NgDiagramService);
  protected readonly theme = inject(ThemeService);

  protected readonly ready = this.diagram.isInitialized;
  protected readonly laying = signal(false);

  async runLayout(): Promise<void> {
    if (this.laying()) return;
    this.laying.set(true);
    try {
      await this.swimlanes.runLayout();
    } finally {
      this.laying.set(false);
    }
  }

  fit(): void {
    this.viewport.zoomToFit({ padding: 60 });
  }

  toggleTheme(): void {
    this.theme.toggle();
  }
}
