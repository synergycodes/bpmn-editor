import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Renders an icon from the app sprite (see IconSpriteComponent). Size comes
 * from CSS on the host, color from `currentColor`.
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.scss',
})
export class IconComponent {
  /** Sprite symbol name — resolves to `#icon-<name>`. */
  name = input.required<string>();
}
