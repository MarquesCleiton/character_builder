import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AssetCategory } from '../../../domain/models/asset-category';
import { AssetItem } from '../../../domain/models/asset-item';
import { ProjectManifest } from '../../../domain/models/project-manifest';
import { ExportService } from '../../../infrastructure/services/export.service';
import { AssetImportStateService } from '../../../infrastructure/services/asset-import-state.service';
import { WorkspaceFilesService } from '../../../infrastructure/services/workspace-files.service';
import { WorkspaceStore } from '../../../infrastructure/state/workspace.store';
import { CATEGORY_LABELS, DISPLAY_ORDER } from '../../../shared/constants/layer.constants';

@Component({
    selector: 'app-editor-page',
    templateUrl: './editor-page.component.html',
    styleUrls: ['./editor-page.component.scss']
})
export class EditorPageComponent {
    readonly manifest$: Observable<ProjectManifest> = this.store.manifest$;
    readonly workspaceName$: Observable<string> = this.store.workspaceName$;
    readonly totalAssets$: Observable<number> = this.store.manifest$.pipe(
        map(m => Object.values(m.assets).reduce((sum, arr) => sum + arr.length, 0))
    );
    readonly categories = DISPLAY_ORDER;
    readonly labels = CATEGORY_LABELS;
    activeCategory: AssetCategory = AssetCategory.Eyes;
    panelCategory: AssetCategory = this.categories[0];
    showGallery = false;

    constructor(
        private readonly store: WorkspaceStore,
        private readonly router: Router,
        private readonly exporter: ExportService,
        private readonly files: WorkspaceFilesService,
        private readonly importState: AssetImportStateService
    ) { }

    setActive(category: AssetCategory): void {
        this.activeCategory = category;
    }

    setPanelCategory(category: AssetCategory): void {
        this.panelCategory = category;
    }

    onSelect(category: AssetCategory, id: string): void {
        this.activeCategory = category;
        this.store.selectAsset(category, id);
    }

    onPrev(category: AssetCategory, items: AssetItem[], selectedId?: string): void {
        if (items.length === 0) {
            return;
        }
        const index = Math.max(0, items.findIndex(item => item.id === selectedId));
        const nextIndex = (index - 1 + items.length) % items.length;
        this.store.selectAsset(category, items[nextIndex].id);
    }

    onNext(category: AssetCategory, items: AssetItem[], selectedId?: string): void {
        if (items.length === 0) {
            return;
        }
        const index = Math.max(0, items.findIndex(item => item.id === selectedId));
        const nextIndex = (index + 1) % items.length;
        this.store.selectAsset(category, items[nextIndex].id);
    }

    openGallery(category: AssetCategory): void {
        this.activeCategory = category;
        this.showGallery = true;
    }

    closeGallery(): void {
        this.showGallery = false;
    }

    toggleLock(category: AssetCategory): void {
        this.store.toggleLock(category);
    }

    toggleVisibility(category: AssetCategory): void {
        this.store.toggleVisibility(category);
    }

    reorderLayers(newOrder: AssetCategory[]): void {
        this.store.reorderLayers(newOrder);
    }

    onImportFile(category: AssetCategory, file: File): void {
        this.importState.pendingBlob = file;
        this.importState.pendingCategory = category;
        this.importState.pendingName = file.name.replace(/\.[^.]+$/, '');
        this.router.navigate(['/ajustar-elemento']);
    }

    async onEditAsset(category: AssetCategory, id: string): Promise<void> {
        const asset = this.store.snapshot.assets[category].find(a => a.id === id);
        if (!asset?.previewUrl) return;
        const blob = await fetch(asset.previewUrl).then(r => r.blob());
        this.importState.pendingBlob = blob;
        this.importState.pendingCategory = category;
        this.importState.pendingName = asset.name;
        this.importState.editingId = id;
        this.router.navigate(['/ajustar-elemento']);
    }

    onDeleteAsset(category: AssetCategory, id: string): void {
        if (!window.confirm('Deseja realmente excluir este elemento? Esta ação não pode ser desfeita.')) return;
        this.store.removeAsset(category, id);
    }

    removeAsset(category: AssetCategory, id: string): void {
        this.store.removeAsset(category, id);
    }

    randomize(): void {
        this.store.randomize();
    }

    async exportPng(): Promise<void> {
        const blob = await this.exporter.exportPng(this.store.snapshot);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'personagem.png';
        anchor.click();
        URL.revokeObjectURL(url);
    }

    async copyPng(): Promise<void> {
        try {
            const blob = await this.exporter.exportPng(this.store.snapshot);
            if (!navigator.clipboard || !('write' in navigator.clipboard)) {
                window.alert('Clipboard nao suportado neste navegador.');
                return;
            }
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
            window.alert('PNG copiado.');
        } catch {
            window.alert('Falha ao copiar PNG.');
        }
    }

    goToImport(): void {
        this.router.navigate(['/ajustar-elemento']);
    }

    async openWorkspace(): Promise<void> {
        const selection = await this.files.selectWorkspace();
        if (!selection) {
            return;
        }
        if (!selection.project) {
            window.alert('Manifesto nao encontrado. Volte para criar um novo projeto.');
            this.router.navigate(['/boas-vindas']);
            return;
        }
        this.store.loadWorkspace(selection.handle, selection.project);
    }

    async updateTemplate(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) {
            return;
        }
        await this.store.updateTemplate(input.files[0]);
        input.value = '';
    }

}
