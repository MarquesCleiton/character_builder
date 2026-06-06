import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AssetItem } from '../../domain/models/asset-item';
import { AssetTransform } from '../../domain/models/asset-transform';
import { Layer } from '../../domain/models/layer';
import { ProjectManifest } from '../../domain/models/project-manifest';
import { Template } from '../../domain/models/template';
import { EXPORT_HEIGHT, EXPORT_WIDTH } from '../../shared/constants/export.constants';
import { WorkspaceFilesService } from '../services/workspace-files.service';

const defaultTransform = (w: number, h: number): AssetTransform => ({
    x: w / 2, y: h / 2, scaleX: 1, scaleY: 1, scale: 1, rotation: 0, opacity: 1
});

const emptyTemplate = (id: string, name: string): Template => ({
    id, name, imagePath: '', previewUrl: undefined,
    canvasWidth: EXPORT_WIDTH, canvasHeight: EXPORT_HEIGHT,
    layers: [], assets: {}, selected: {}, locked: {}, hidden: {}
});

const emptyManifest = (name: string): ProjectManifest => {
    const tplId = 'default-template';
    return { name, version: '2.0.0', templates: [emptyTemplate(tplId, 'Template 1')], activeTemplateId: tplId, history: [] };
};

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
    private readonly manifestSubject = new BehaviorSubject<ProjectManifest>(emptyManifest('Novo Projeto'));
    readonly manifest$: Observable<ProjectManifest> = this.manifestSubject.asObservable();
    private readonly workspaceNameSubject = new BehaviorSubject<string>('');
    readonly workspaceName$: Observable<string> = this.workspaceNameSubject.asObservable();
    private workspaceHandle: FileSystemDirectoryHandle | null = null;
    private readonly objectUrls = new Set<string>();

    constructor(private readonly files: WorkspaceFilesService) { }

    get snapshot(): ProjectManifest { return this.manifestSubject.value; }
    get currentWorkspaceHandle(): FileSystemDirectoryHandle | null { return this.workspaceHandle; }

    get activeTemplate(): Template {
        const m = this.snapshot;
        return m.templates.find(t => t.id === m.activeTemplateId) ?? m.templates[0];
    }

    loadWorkspace(handle: FileSystemDirectoryHandle, manifest: ProjectManifest): void {
        this.revokeObjectUrls();
        this.workspaceHandle = handle;
        this.workspaceNameSubject.next(handle.name);
        this.trackManifestUrls(manifest);
        this.manifestSubject.next(manifest);
        this.files.rememberWorkspace(handle).catch(() => undefined);
    }

    selectTemplate(templateId: string): void {
        this.commit({ ...this.snapshot, activeTemplateId: templateId });
    }

    addTemplate(name?: string): void {
        const id = this.createId();
        const n = this.snapshot.templates.length + 1;
        const template = emptyTemplate(id, name ?? `Template ${n}`);
        this.commit({ ...this.snapshot, templates: [...this.snapshot.templates, template], activeTemplateId: id });
    }

    renameTemplate(templateId: string, name: string): void {
        this.commitTemplate(templateId, { name });
    }

    removeTemplate(templateId: string): void {
        const templates = this.snapshot.templates.filter(t => t.id !== templateId);
        if (!templates.length) return;
        const removed = this.snapshot.templates.find(t => t.id === templateId);
        if (removed) {
            if (removed.previewUrl) { URL.revokeObjectURL(removed.previewUrl); this.objectUrls.delete(removed.previewUrl); }
            for (const assets of Object.values(removed.assets)) {
                for (const asset of assets) {
                    if (asset.previewUrl) { URL.revokeObjectURL(asset.previewUrl); this.objectUrls.delete(asset.previewUrl); }
                }
            }
        }
        const activeTemplateId = templateId === this.snapshot.activeTemplateId
            ? templates[0].id
            : this.snapshot.activeTemplateId;
        this.commit({ ...this.snapshot, templates, activeTemplateId });
    }

    async updateTemplateImage(templateId: string, file: File): Promise<void> {
        if (!this.workspaceHandle) return;
        const bitmap = await createImageBitmap(file);
        const canvasWidth = bitmap.width;
        const canvasHeight = bitmap.height;
        bitmap.close();
        const imagePath = await this.files.saveTemplateImage(this.workspaceHandle, templateId, file);
        const previewUrl = URL.createObjectURL(file);
        this.trackObjectUrl(previewUrl);
        const old = this.snapshot.templates.find(t => t.id === templateId);
        if (old?.previewUrl) { URL.revokeObjectURL(old.previewUrl); this.objectUrls.delete(old.previewUrl); }
        this.commitTemplate(templateId, { imagePath, previewUrl, canvasWidth, canvasHeight });
    }

    async updateTemplate(file: File): Promise<void> {
        return this.updateTemplateImage(this.snapshot.activeTemplateId, file);
    }

    addLayer(refLayerId: string | null, position: 'above' | 'below'): void {
        const template = this.activeTemplate;
        const newLayer: Layer = { id: this.createId(), name: 'Nova Camada' };
        const layers = [...template.layers];

        if (refLayerId === null) {
            layers.push(newLayer);
        } else {
            const idx = layers.findIndex(l => l.id === refLayerId);
            if (idx < 0) {
                layers.push(newLayer);
            } else if (position === 'above') {
                // 'above' in render = insert after idx (renders on top of refLayer)
                layers.splice(idx + 1, 0, newLayer);
            } else {
                // 'below' in render = insert at idx (renders below refLayer)
                layers.splice(idx, 0, newLayer);
            }
        }

        if (this.workspaceHandle) {
            this.files.ensureLayerFolder(this.workspaceHandle, newLayer.id).catch(() => undefined);
        }

        this.commitTemplate(template.id, { layers, assets: { ...template.assets, [newLayer.id]: [] } });
    }

    renameLayer(layerId: string, name: string): void {
        const template = this.activeTemplate;
        this.commitTemplate(template.id, { layers: template.layers.map(l => l.id === layerId ? { ...l, name } : l) });
    }

    moveLayerUp(layerId: string): void {
        const template = this.activeTemplate;
        const layers = [...template.layers];
        const idx = layers.findIndex(l => l.id === layerId);
        if (idx >= 0 && idx < layers.length - 1) {
            [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]];
            this.commitTemplate(template.id, { layers });
        }
    }

    moveLayerDown(layerId: string): void {
        const template = this.activeTemplate;
        const layers = [...template.layers];
        const idx = layers.findIndex(l => l.id === layerId);
        if (idx > 0) {
            [layers[idx], layers[idx - 1]] = [layers[idx - 1], layers[idx]];
            this.commitTemplate(template.id, { layers });
        }
    }

    removeLayer(layerId: string): void {
        const template = this.activeTemplate;
        const layers = template.layers.filter(l => l.id !== layerId);
        const assets = { ...template.assets };
        for (const asset of (assets[layerId] ?? [])) {
            if (asset.previewUrl) { URL.revokeObjectURL(asset.previewUrl); this.objectUrls.delete(asset.previewUrl); }
        }
        delete assets[layerId];
        const selected = { ...template.selected }; delete selected[layerId];
        const locked = { ...template.locked }; delete locked[layerId];
        const hidden = { ...template.hidden }; delete hidden[layerId];

        if (this.workspaceHandle) {
            this.files.deleteLayerFolder(this.workspaceHandle, layerId).catch(() => undefined);
        }

        this.commitTemplate(template.id, { layers, assets, selected, locked, hidden });
    }

    reorderLayers(newOrder: Layer[]): void {
        this.commitTemplate(this.activeTemplate.id, { layers: newOrder });
    }

    toggleVisibility(layerId: string): void {
        const t = this.activeTemplate;
        this.commitTemplate(t.id, { hidden: { ...t.hidden, [layerId]: !t.hidden[layerId] } });
    }

    toggleLock(layerId: string): void {
        const t = this.activeTemplate;
        this.commitTemplate(t.id, { locked: { ...t.locked, [layerId]: !t.locked[layerId] } });
    }

    async addAssetFromBlob(layerId: string, fileName: string, blob: Blob, transform?: AssetTransform): Promise<void> {
        if (!this.workspaceHandle) return;
        const safeName = this.sanitizeFileName(fileName);
        if (!safeName) return;
        const template = this.activeTemplate;
        const assetId = this.createId();
        const filePath = await this.files.saveAssetBlob(this.workspaceHandle, layerId, assetId, blob);
        const previewUrl = await this.files.readFileAsObjectUrl(this.workspaceHandle, filePath);
        if (previewUrl) this.trackObjectUrl(previewUrl);

        const asset: AssetItem = {
            id: assetId, name: safeName, layerId, filePath,
            transform: transform ?? defaultTransform(template.canvasWidth, template.canvasHeight),
            createdAt: new Date().toISOString(), previewUrl
        };

        const layerAssets = [...(template.assets[layerId] ?? []), asset];
        const selected = { ...template.selected };
        if (!selected[layerId]) selected[layerId] = asset.id;
        this.commitTemplate(template.id, { assets: { ...template.assets, [layerId]: layerAssets }, selected });
    }

    async updateAssetFromBlob(layerId: string, id: string, name: string, blob: Blob, transform: AssetTransform): Promise<void> {
        if (!this.workspaceHandle) return;
        const template = this.activeTemplate;
        const existing = (template.assets[layerId] ?? []).find(item => item.id === id);
        if (!existing) return;
        const safeName = this.sanitizeFileName(name);
        if (!safeName) return;
        const filePath = await this.files.saveAssetBlob(this.workspaceHandle, layerId, id, blob);
        const previewUrl = await this.files.readFileAsObjectUrl(this.workspaceHandle, filePath);
        if (existing.previewUrl) { URL.revokeObjectURL(existing.previewUrl); this.objectUrls.delete(existing.previewUrl); }
        if (previewUrl) this.trackObjectUrl(previewUrl);
        const updated: AssetItem = { ...existing, name: safeName, filePath, previewUrl: previewUrl ?? existing.previewUrl, transform };
        const layerAssets = (template.assets[layerId] ?? []).map(item => item.id === id ? updated : item);
        this.commitTemplate(template.id, { assets: { ...template.assets, [layerId]: layerAssets } });
    }

    removeAsset(layerId: string, assetId: string): void {
        const template = this.activeTemplate;
        const layerAssets = (template.assets[layerId] ?? []).filter(item => item.id !== assetId);
        const removed = (template.assets[layerId] ?? []).find(item => item.id === assetId);
        if (removed?.previewUrl) { URL.revokeObjectURL(removed.previewUrl); this.objectUrls.delete(removed.previewUrl); }
        const selected = { ...template.selected };
        if (selected[layerId] === assetId) selected[layerId] = layerAssets[0]?.id ?? '';
        this.commitTemplate(template.id, { assets: { ...template.assets, [layerId]: layerAssets }, selected });
    }

    selectAsset(layerId: string, assetId: string): void {
        const t = this.activeTemplate;
        this.commitTemplate(t.id, { selected: { ...t.selected, [layerId]: assetId } });
    }

    updateTransform(layerId: string, assetId: string, transform: AssetTransform): void {
        const template = this.activeTemplate;
        const layerAssets = (template.assets[layerId] ?? []).map(item =>
            item.id === assetId ? { ...item, transform } : item
        );
        this.commitTemplate(template.id, { assets: { ...template.assets, [layerId]: layerAssets } });
    }

    randomize(): void {
        const template = this.activeTemplate;
        const selected = { ...template.selected };
        for (const layer of template.layers) {
            if (template.locked[layer.id]) continue;
            const items = template.assets[layer.id] ?? [];
            if (!items.length) continue;
            selected[layer.id] = items[Math.floor(Math.random() * items.length)].id;
        }
        this.commitTemplate(template.id, { selected });
    }

    renameProject(name: string): void {
        this.commit({ ...this.snapshot, name });
    }

    private commitTemplate(templateId: string, partial: Partial<Template>): void {
        const templates = this.snapshot.templates.map(t => t.id === templateId ? { ...t, ...partial } : t);
        this.commit({ ...this.snapshot, templates });
    }

    private commit(manifest: ProjectManifest): void {
        this.manifestSubject.next(manifest);
        if (this.workspaceHandle) {
            this.files.saveManifestFromProject(this.workspaceHandle, manifest).catch(() => undefined);
        }
    }

    private createId(): string {
        if ('randomUUID' in crypto) return (crypto as unknown as { randomUUID: () => string }).randomUUID();
        return `id-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }

    private sanitizeFileName(value: string): string {
        return value.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '').replace(/_+/g, '_');
    }

    private trackObjectUrl(url: string): void { this.objectUrls.add(url); }

    private trackManifestUrls(manifest: ProjectManifest): void {
        for (const template of manifest.templates) {
            if (template.previewUrl) this.trackObjectUrl(template.previewUrl);
            for (const assets of Object.values(template.assets)) {
                for (const asset of assets) {
                    if (asset.previewUrl) this.trackObjectUrl(asset.previewUrl);
                }
            }
        }
    }

    private revokeObjectUrls(): void {
        for (const url of this.objectUrls) URL.revokeObjectURL(url);
        this.objectUrls.clear();
    }
}
