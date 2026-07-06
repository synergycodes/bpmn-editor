import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import {
  NgDiagramPaletteItemComponent,
  NgDiagramPaletteItemPreviewComponent,
} from 'ng-diagram';
import { PALETTE, PALETTE_SECTIONS, type PaletteEntry } from '../model/palette-data';

interface RenderEntry extends PaletteEntry {
  svg: SafeHtml;
}

@Component({
  selector: 'app-palette',
  standalone: true,
  imports: [NgDiagramPaletteItemComponent, NgDiagramPaletteItemPreviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './palette.component.html',
  styleUrl: './palette.component.scss',
})
export class PaletteComponent {
  protected readonly sections = PALETTE_SECTIONS;
  private readonly entries: RenderEntry[];

  constructor(sanitizer: DomSanitizer) {
    this.entries = PALETTE.map((e) => ({
      ...e,
      svg: sanitizer.bypassSecurityTrustHtml(
        `<svg viewBox="0 0 24 24" width="24" height="24">${e.glyph}</svg>`,
      ),
    }));
  }

  entriesFor(section: string): RenderEntry[] {
    return this.entries.filter((e) => e.section === section);
  }
}
