import { NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ServiceWorkerModule } from '@angular/service-worker';
import { WelcomePageComponent } from './presentation/pages/welcome-page/welcome-page.component';
import { EditorPageComponent } from './presentation/pages/editor-page/editor-page.component';
import { AjustarElementoPageComponent } from './presentation/pages/ajustar-elemento-page/ajustar-elemento-page.component';
import { TopbarComponent } from './presentation/components/topbar/topbar.component';
import { PreviewCanvasComponent } from './presentation/components/preview-canvas/preview-canvas.component';
import { CategoryBrowserComponent } from './presentation/components/category-browser/category-browser.component';
import { ActionsBarComponent } from './presentation/components/actions-bar/actions-bar.component';
import { LayersPanelComponent } from './presentation/components/layers-panel/layers-panel.component';
import { ProjectNameModalComponent } from './presentation/components/project-name-modal/project-name-modal.component';
import { AssetGalleryModalComponent } from './presentation/components/asset-gallery-modal/asset-gallery-modal.component';
import { AssetPositionEditorComponent } from './presentation/components/asset-position-editor/asset-position-editor.component';

@NgModule({
  declarations: [
    AppComponent,
    WelcomePageComponent,
    EditorPageComponent,
    AjustarElementoPageComponent,
    TopbarComponent,
    PreviewCanvasComponent,
    CategoryBrowserComponent,
    ActionsBarComponent,
    LayersPanelComponent,
    ProjectNameModalComponent,
    AssetGalleryModalComponent,
    AssetPositionEditorComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    })
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
