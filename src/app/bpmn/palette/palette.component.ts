import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  NgDiagramPaletteItemComponent,
  NgDiagramPaletteItemPreviewComponent,
} from 'ng-diagram';
import { IconComponent } from '../../shared/icons/icon.component';
import { PALETTE, PALETTE_SECTIONS, type PaletteEntry } from '../model/palette-data';

@Component({
  selector: 'app-palette',
  standalone: true,
  imports: [IconComponent, NgDiagramPaletteItemComponent, NgDiagramPaletteItemPreviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './palette.component.html',
  styleUrl: './palette.component.scss',
})
export class PaletteComponent {
  protected readonly sections = PALETTE_SECTIONS;

  entriesFor(section: string): PaletteEntry[] {
    return PALETTE.filter((e) => e.section === section);
  }
}
