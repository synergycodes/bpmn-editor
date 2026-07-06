import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./bpmn/pages/editor-page.component').then((m) => m.EditorPageComponent),
  },
  { path: '**', redirectTo: '' },
];
