import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AssetItem } from '../../../domain/models/asset-item';
import { Layer } from '../../../domain/models/layer';
import { ProjectManifest } from '../../../domain/models/project-manifest';
import { Template } from '../../../domain/models/template';
import { ExportService } from '../../../infrastructure/services/export.service';
import { AssetImportStateService } from '../../../infrastructure/services/asset-import-state.service';
import { WorkspaceFilesService } from '../../../infrastructure/services/workspace-files.service';
import { WorkspaceStore } from '../../../infrastructure/state/workspace.store';

@Component({
    selector: 'app-editor-page',
    templateUrl: './editor-page.component.html',
    styleUrls: ['./editor-page.component.scss']
})
export class EditorPageComponent implements OnInit {
    readonly manifest$: Observable<ProjectManifest> = this.store.manifest$;
    readonly workspaceName$: Observable<string> = this.store.workspaceName$;
    readonly totalAssets$: Observable<number> = this.store.manifest$.pipe(
        map(m => {
            const tpl = m.templates.find(t => t.id === m.activeTemplateId) ?? m.templates[0];
            return tpl ? Object.values(tpl.assets).reduce((sum, arr) => sum + arr.length, 0) : 0;
        })
    );

    showGallery = false;
    activeLayerId = '';
    private panelDragLayer: Layer | null = null;

    constructor(
        private readonly store: WorkspaceStore,
        private readonly router: Router,
        private readonly exporter: ExportService,
        private readonly files: WorkspaceFilesService,
        private readonly importState: AssetImportStateService
    ) { }

    async ngOnInit(): Promise<void> {
        // Check if workspace is loaded; if empty on editor load, restore from storage
        const current = this.store.snapshot;
        const isEmpty = current.name === 'Novo Projeto' && current.templates.length === 1 && current.templates[0]?.assets && Object.keys(current.templates[0].assets).every(k => !current.templates[0].assets[k].length);

        if (isEmpty) {
            const restored = await this.files.restoreRecentWorkspace();
            if (restored?.project) {
                this.store.loadWorkspace(restored.handle, restored.project);
            } else {
                // No recent workspace available, redirect to welcome
                this.router.navigate(['/boas-vindas']);
            }
        }
    }

    getActiveTemplate(manifest: ProjectManifest): Template | undefined {
        return manifest.templates.find(t => t.id === manifest.activeTemplateId) ?? manifest.templates[0];
    }

    /** Display order: reversed (top = highest z-index) */
    getDisplayLayers(template: Template): Layer[] {
        return [...template.layers].reverse();
    }

    moveLayerUp(layerId: string): void { this.store.moveLayerUp(layerId); }
    moveLayerDown(layerId: string): void { this.store.moveLayerDown(layerId); }

    onPanelDragStart(layer: Layer): void { this.panelDragLayer = layer; }

    onPanelDragOver(event: DragEvent, target: Layer): void {
        event.preventDefault();
        if (!this.panelDragLayer || this.panelDragLayer.id === target.id) return;
        const tpl = this.store.activeTemplate;
        if (!tpl) return;
        const display = [...tpl.layers].reverse();
        const fromIdx = display.findIndex(l => l.id === this.panelDragLayer!.id);
        const toIdx = display.findIndex(l => l.id === target.id);
        if (fromIdx < 0 || toIdx < 0) return;
        display.splice(fromIdx, 1);
        display.splice(toIdx, 0, this.panelDragLayer);
        this.store.reorderLayers([...display].reverse());
    }

    onPanelDrop(event: DragEvent): void { event.preventDefault(); this.panelDragLayer = null; }
    onPanelDragEnd(): void { this.panelDragLayer = null; }

    async onAddTemplateWithImage(file: File): Promise<void> {
        const rawName = window.prompt('Nome do novo template:');
        if (rawName === null) return;
        const name = rawName.trim() || `Template ${this.store.snapshot.templates.length + 1}`;
        this.store.addTemplate(name);
        await this.store.updateTemplateImage(this.store.activeTemplate.id, file);
    }

    onSelectTemplate(templateId: string): void {
        this.store.selectTemplate(templateId);
    }

    onAddTemplate(): void {
        this.store.addTemplate();
    }

    onRenameTemplate(event: { id: string; name: string }): void {
        this.store.renameTemplate(event.id, event.name);
    }

    onDeleteTemplate(id: string): void {
        const name = this.store.snapshot.templates.find(t => t.id === id)?.name ?? 'este template';
        if (!window.confirm(`Deseja apagar "${name}" e todos os seus elementos? Esta ação não pode ser desfeita.`)) return;
        this.store.removeTemplate(id);
    }

    async onChangeTemplateImage(event: { id: string; file: File }): Promise<void> {
        await this.store.updateTemplateImage(event.id, event.file);
    }

    onSelect(layerId: string, id: string): void {
        this.activeLayerId = layerId;
        const tpl = this.store.activeTemplate;
        if (!tpl) return;

        // Get current selection for this layer
        const currentSelection = tpl.selected[layerId];

        // If clicking the same element, deselect it; otherwise select it
        if (currentSelection === id) {
            this.store.selectAsset(layerId, '');
        } else {
            this.store.selectAsset(layerId, id);
        }
    }

    onPrev(layerId: string, items: AssetItem[], selectedId?: string): void {
        if (!items.length) return;
        const idx = Math.max(0, items.findIndex(item => item.id === selectedId));
        this.store.selectAsset(layerId, items[(idx - 1 + items.length) % items.length].id);
    }

    onNext(layerId: string, items: AssetItem[], selectedId?: string): void {
        if (!items.length) return;
        const idx = Math.max(0, items.findIndex(item => item.id === selectedId));
        this.store.selectAsset(layerId, items[(idx + 1) % items.length].id);
    }

    openGallery(layerId: string): void {
        this.activeLayerId = layerId;
        this.showGallery = true;
    }

    closeGallery(): void {
        this.showGallery = false;
    }

    toggleLock(layerId: string): void {
        this.store.toggleLock(layerId);
    }

    toggleVisibility(layerId: string): void {
        this.store.toggleVisibility(layerId);
    }

    reorderLayers(newOrder: Layer[]): void {
        this.store.reorderLayers(newOrder);
    }

    addLayerAbove(layerId: string): void {
        this.store.addLayer(layerId, 'above');
    }

    addLayerBelow(layerId: string | null): void {
        this.store.addLayer(layerId, 'below');
    }

    renameLayer(event: { id: string; name: string }): void {
        this.store.renameLayer(event.id, event.name);
    }

    removeLayer(layerId: string): void {
        if (!window.confirm('Deseja remover esta camada e todos os seus elementos?')) return;
        this.store.removeLayer(layerId);
    }

    onImportFile(layerId: string, file: File): void {
        this.importState.pendingBlob = file;
        this.importState.pendingLayerId = layerId;
        this.importState.pendingName = file.name.replace(/\.[^.]+$/, '');
        this.router.navigate(['/ajustar-elemento']);
    }

    async onEditAsset(layerId: string, id: string): Promise<void> {
        const tpl = this.store.activeTemplate;
        const asset = (tpl?.assets[layerId] ?? []).find(a => a.id === id);
        if (!asset?.previewUrl) return;
        const blob = await fetch(asset.previewUrl).then(r => r.blob());
        this.importState.pendingBlob = blob;
        this.importState.pendingLayerId = layerId;
        this.importState.pendingName = asset.name;
        this.importState.editingId = id;
        this.router.navigate(['/ajustar-elemento']);
    }

    onDeleteAsset(layerId: string, id: string): void {
        if (!window.confirm('Deseja realmente excluir este elemento? Esta aÃ§Ã£o nÃ£o pode ser desfeita.')) return;
        this.store.removeAsset(layerId, id);
    }

    removeAsset(layerId: string, id: string): void {
        this.store.removeAsset(layerId, id);
    }

    randomize(): void {
        this.store.randomize();
    }

    async exportPng(): Promise<void> {
        const blob = await this.exporter.exportPng(this.store.snapshot);
        const suggestedName = `${this.store.snapshot.name ?? 'personagem'}.png`;

        if ('showSaveFilePicker' in window) {
            try {
                const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
                    suggestedName,
                    types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return;
            } catch (e) {
                if ((e as Error).name === 'AbortError') return;
            }
        }

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = suggestedName;
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

    async openWorkspace(): Promise<void> {
        const selection = await this.files.selectWorkspace();
        if (!selection) return;
        if (!selection.project) {
            window.alert('Manifesto nao encontrado. Volte para criar um novo projeto.');
            this.router.navigate(['/boas-vindas']);
            return;
        }
        this.store.loadWorkspace(selection.handle, selection.project);
    }

    onRenameProject(name: string): void {
        this.store.renameProject(name);
    }

    async onChangeTemplate(file: File): Promise<void> {
        await this.store.updateTemplate(file);
    }

    goToImport(): void {
        this.router.navigate(['/ajustar-elemento']);
    }

    getActiveLayerName(manifest: ProjectManifest): string {
        const tpl = this.getActiveTemplate(manifest);
        return tpl?.layers.find(l => l.id === this.activeLayerId)?.name ?? '';
    }
}
