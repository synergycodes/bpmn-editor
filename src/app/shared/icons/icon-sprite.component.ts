import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The app's icon sprite — every inline SVG icon lives here as a `<symbol>`.
 * Rendered once at the app root; `<app-icon name="…">` references the
 * symbols by id, so templates never carry raw SVG markup.
 */
@Component({
  selector: 'app-icon-sprite',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './icon-sprite.component.html',
  styleUrl: './icon-sprite.component.scss',
})
export class IconSpriteComponent {}
