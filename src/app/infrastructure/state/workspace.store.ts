import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AssetCategory } from '../../domain/models/asset-category';
import { AssetItem } from '../../domain/models/asset-item';
import { AssetTransform } from '../../domain/models/asset-transform';
import { ProjectManifest } from '../../domain/models/project-manifest';
import { EXPORT_HEIGHT, EXPORT_WIDTH } from '../../shared/constants/export.constants';
import { LAYER_ORDER } from '../../shared/constants/layer.constants';
import { WorkspaceFilesService } from '../services/workspace-files.service';

const defaultTransform = (): AssetTransform => ({
    x: EXPORT_WIDTH / 2,
    y: EXPORT_HEIGHT / 2,
    scale: 1,
    rotation: 0,
    opacity: 1
});

const emptyManifest = (name: string): ProjectManifest => {
    const now = new Date().toISOString();
    return {
        name,
        version: '1.0.0',
        canvasWidth: 1536,
        canvasHeight: 2752,
        layers: LAYER_ORDER,
        templateImage: '',
        assets: {
            [AssetCategory.Legs]: [],
            [AssetCategory.Torso]: [],
            [AssetCategory.Mouth]: [],
            [AssetCategory.Eyes]: []
        },
        selected: {},
        locked: {},
        hidden: {},
        history: [
            {
                date: now,
                snapshot: {
                    selected: {},
                    locked: {}
                }
            }
        ]
    };
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

    get snapshot(): ProjectManifest {
        return this.manifestSubject.value;
    }

    loadWorkspace(handle: FileSystemDirectoryHandle, manifest: ProjectManifest): void {
        this.revokeObjectUrls();
        this.workspaceHandle = handle;
        this.workspaceNameSubject.next(handle.name);
        this.trackManifestUrls(manifest);
        this.manifestSubject.next(manifest);
    }

    async updateTemplate(file: File): Promise<void> {
        if (!this.workspaceHandle) {
            return;
        }
        const templatePath = await this.files.saveTemplateImage(this.workspaceHandle, file);
        const templatePreviewUrl = URL.createObjectURL(file);
        this.trackObjectUrl(templatePreviewUrl);
        this.commit({
            ...this.snapshot,
            templateImage: templatePath,
            templatePreviewUrl
        });
    }

    async addAssetFromBlob(category: AssetCategory, fileName: string, blob: Blob, transform?: AssetTransform): Promise<void> {
        if (!this.workspaceHandle) {
            return;
        }
        const now = new Date().toISOString();
        const safeName = this.sanitizeFileName(fileName);
        if (!safeName) {
            return;
        }
        const filePath = await this.files.saveAssetBlob(this.workspaceHandle, category, safeName, blob);
        const previewUrl = await this.files.readFileAsObjectUrl(this.workspaceHandle, filePath);
        if (previewUrl) {
            this.trackObjectUrl(previewUrl);
        }

        const asset: AssetItem = {
            id: this.createId(),
            name: safeName,
            category,
            filePath,
            transform: transform ?? defaultTransform(),
            createdAt: now,
            previewUrl
        };

        const current = this.snapshot;
        const updated = {
            ...current,
            assets: {
                ...current.assets,
                [category]: [...current.assets[category], asset]
            }
        };
        if (!updated.selected[category]) {
            updated.selected[category] = asset.id;
        }
        this.commit(updated);
    }

    async updateAssetFromBlob(category: AssetCategory, id: string, name: string, blob: Blob, transform: AssetTransform): Promise<void> {
        if (!this.workspaceHandle) return;
        const current = this.snapshot;
        const existing = current.assets[category].find(item => item.id === id);
        if (!existing) return;
        const safeName = this.sanitizeFileName(name);
        if (!safeName) return;
        const filePath = await this.files.saveAssetBlob(this.workspaceHandle, category, safeName, blob);
        const previewUrl = await this.files.readFileAsObjectUrl(this.workspaceHandle, filePath);
        if (existing.previewUrl) {
            URL.revokeObjectURL(existing.previewUrl);
            this.objectUrls.delete(existing.previewUrl);
        }
        if (previewUrl) this.trackObjectUrl(previewUrl);
        const updatedAsset: AssetItem = { ...existing, name: safeName, filePath, previewUrl: previewUrl ?? existing.previewUrl, transform };
        const assets = current.assets[category].map(item => item.id === id ? updatedAsset : item);
        this.commit({ ...current, assets: { ...current.assets, [category]: assets } });
    }

    removeAsset(category: AssetCategory, id: string): void {
        const current = this.snapshot;
        const assets = current.assets[category].filter(item => item.id !== id);
        const removed = current.assets[category].find(item => item.id === id);
        if (removed?.previewUrl) {
            URL.revokeObjectURL(removed.previewUrl);
            this.objectUrls.delete(removed.previewUrl);
        }
        const selected = { ...current.selected };
        if (selected[category] === id) {
            selected[category] = assets[0]?.id;
        }
        this.commit({
            ...current,
            assets: { ...current.assets, [category]: assets },
            selected
        });
    }

    selectAsset(category: AssetCategory, id: string): void {
        this.commit({
            ...this.snapshot,
            selected: { ...this.snapshot.selected, [category]: id }
        });
    }

    updateTransform(category: AssetCategory, id: string, transform: AssetTransform): void {
        const current = this.snapshot;
        const assets = current.assets[category].map(item =>
            item.id === id ? { ...item, transform } : item
        );
        this.commit({
            ...current,
            assets: { ...current.assets, [category]: assets }
        });
    }

    toggleLock(category: AssetCategory): void {
        const locked = { ...this.snapshot.locked };
        locked[category] = !locked[category];
        this.commit({
            ...this.snapshot,
            locked
        });
    }

    toggleVisibility(category: AssetCategory): void {
        const hidden = { ...this.snapshot.hidden };
        hidden[category] = !hidden[category];
        this.commit({ ...this.snapshot, hidden });
    }

    reorderLayers(newOrder: AssetCategory[]): void {
        this.commit({ ...this.snapshot, layers: newOrder });
    }

    randomize(): void {
        const current = this.snapshot;
        const selected = { ...current.selected };
        for (const category of LAYER_ORDER) {
            if (current.locked[category]) {
                continue;
            }
            const items = current.assets[category];
            if (items.length === 0) {
                continue;
            }
            const randomItem = items[Math.floor(Math.random() * items.length)];
            selected[category] = randomItem.id;
        }
        this.commit({
            ...current,
            selected
        });
    }

    private commit(manifest: ProjectManifest): void {
        this.manifestSubject.next(manifest);
        if (this.workspaceHandle) {
            this.files.saveManifestFromProject(this.workspaceHandle, manifest).catch(() => undefined);
        }
    }

    private createId(): string {
        if ('randomUUID' in crypto) {
            return crypto.randomUUID();
        }
        return `asset-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }

    private sanitizeFileName(value: string): string {
        return value
            .trim()
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9._-]/g, '')
            .replace(/_+/g, '_');
    }

    private trackObjectUrl(url: string): void {
        this.objectUrls.add(url);
    }

    private trackManifestUrls(manifest: ProjectManifest): void {
        if (manifest.templatePreviewUrl) {
            this.trackObjectUrl(manifest.templatePreviewUrl);
        }
        for (const category of LAYER_ORDER) {
            for (const asset of manifest.assets[category]) {
                if (asset.previewUrl) {
                    this.trackObjectUrl(asset.previewUrl);
                }
            }
        }
    }

    private revokeObjectUrls(): void {
        for (const url of this.objectUrls) {
            URL.revokeObjectURL(url);
        }
        this.objectUrls.clear();
    }
}
