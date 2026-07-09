import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IconSpriteComponent } from './shared/icons/icon-sprite.component';

@Component({
  selector: 'app-root',
  imports: [IconSpriteComponent, RouterOutlet],
  template: '<app-icon-sprite /><router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
