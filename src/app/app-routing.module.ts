import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EditorPageComponent } from './presentation/pages/editor-page/editor-page.component';
import { AjustarElementoPageComponent } from './presentation/pages/ajustar-elemento-page/ajustar-elemento-page.component';
import { WelcomePageComponent } from './presentation/pages/welcome-page/welcome-page.component';

const routes: Routes = [
  { path: '', redirectTo: 'boas-vindas', pathMatch: 'full' },
  { path: 'boas-vindas', component: WelcomePageComponent },
  { path: 'editor', component: EditorPageComponent },
  { path: 'ajustar-elemento', component: AjustarElementoPageComponent },
  { path: '**', redirectTo: 'boas-vindas' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
