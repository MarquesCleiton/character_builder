import { Injectable } from '@angular/core';
import { AssetCategory } from '../../domain/models/asset-category';
import { AssetItem } from '../../domain/models/asset-item';
import { AssetTransform } from '../../domain/models/asset-transform';
import { ProjectManifest } from '../../domain/models/project-manifest';
import { EXPORT_HEIGHT, EXPORT_WIDTH } from '../../shared/constants/export.constants';
import { LAYER_ORDER } from '../../shared/constants/layer.constants';

export interface WorkspaceManifestFile {
    nome: string;
    versao: string;
    larguraCanvas: number;
    alturaCanvas: number;
    camadas: string[];
    imagemGabarito: string;
    elementos: Record<string, WorkspaceManifestItem[]>;
    ultimaSelecao: Record<string, string>;
    bloqueios: Record<string, boolean>;
    ocultas: Record<string, boolean>;
    historico: WorkspaceManifestHistory[];
}

export interface WorkspaceManifestItem {
    id: string;
    categoria: string;
    nome: string;
    arquivo: string;
    transformacao: WorkspaceManifestTransform;
    criadoEm: string;
}

export interface WorkspaceManifestTransform {
    x: number;
    y: number;
    escala: number;
    rotacao: number;
    opacidade: number;
}

export interface WorkspaceManifestHistory {
    data: string;
    snapshot: {
        ultimaSelecao: Record<string, string>;
        bloqueios: Record<string, boolean>;
    };
}

export interface WorkspaceSelection {
    handle: FileSystemDirectoryHandle;
    manifestFile: WorkspaceManifestFile | null;
    project: ProjectManifest | null;
}

const MANIFEST_FILE_NAME = 'manifesto.json';
const TEMPLATE_FOLDER = 'templat';
const TEMPLATE_FILE = 'template_mestre.png';
const MAX_HISTORY = 30;

@Injectable({ providedIn: 'root' })
export class WorkspaceFilesService {
    async selectWorkspace(): Promise<WorkspaceSelection | null> {
        if (!('showDirectoryPicker' in window)) {
            window.alert('Seu navegador nao suporta selecao de pasta.');
            return null;
        }

        try {
            const handle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
            const manifestFile = await this.readManifest(handle);
            const project = manifestFile ? await this.toProjectManifest(manifestFile, handle) : null;
            return { handle, manifestFile, project };
        } catch {
            return null;
        }
    }

    async createWorkspace(handle: FileSystemDirectoryHandle, name: string): Promise<ProjectManifest> {
        await this.ensureWorkspaceStructure(handle);
        await this.ensureTemplate(handle);

        const now = new Date().toISOString();
        const manifest: WorkspaceManifestFile = {
            nome: name,
            versao: '1.0.0',
            larguraCanvas: EXPORT_WIDTH,
            alturaCanvas: EXPORT_HEIGHT,
            camadas: LAYER_ORDER.map(layer => layer),
            imagemGabarito: `${TEMPLATE_FOLDER}/${TEMPLATE_FILE}`,
            elementos: this.emptyElements(),
            ultimaSelecao: this.emptySelection(),
            bloqueios: this.emptyLocks(),
            ocultas: {},
            historico: [
                {
                    data: now,
                    snapshot: {
                        ultimaSelecao: this.emptySelection(),
                        bloqueios: this.emptyLocks()
                    }
                }
            ]
        };

        await this.writeManifest(handle, manifest);
        return this.toProjectManifest(manifest, handle);
    }

    async loadProjectFromManifest(manifest: WorkspaceManifestFile, handle: FileSystemDirectoryHandle): Promise<ProjectManifest> {
        return this.toProjectManifest(manifest, handle);
    }

    async saveManifestFromProject(handle: FileSystemDirectoryHandle, manifest: ProjectManifest): Promise<void> {
        const manifestFile = this.toManifestFile(manifest);
        await this.writeManifest(handle, manifestFile);
    }

    async saveTemplateImage(handle: FileSystemDirectoryHandle, file: File): Promise<string> {
        const folderHandle = await handle.getDirectoryHandle(TEMPLATE_FOLDER, { create: true });
        const fileHandle = await folderHandle.getFileHandle(TEMPLATE_FILE, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
        return `${TEMPLATE_FOLDER}/${TEMPLATE_FILE}`;
    }

    async saveAssetBlob(handle: FileSystemDirectoryHandle, category: AssetCategory, fileName: string, blob: Blob): Promise<string> {
        const normalized = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
        const folderHandle = await handle.getDirectoryHandle(category, { create: true });
        const fileHandle = await folderHandle.getFileHandle(normalized, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return `${category}/${normalized}`;
    }

    async readFileAsObjectUrl(handle: FileSystemDirectoryHandle, path: string): Promise<string> {
        try {
            const fileHandle = await this.getFileHandleByPath(handle, path);
            if (!fileHandle) {
                return '';
            }
            const file = await fileHandle.getFile();
            return URL.createObjectURL(file);
        } catch {
            return '';
        }
    }

    private async readManifest(handle: FileSystemDirectoryHandle): Promise<WorkspaceManifestFile | null> {
        try {
            const fileHandle = await handle.getFileHandle(MANIFEST_FILE_NAME);
            const file = await fileHandle.getFile();
            const text = await file.text();
            return JSON.parse(text) as WorkspaceManifestFile;
        } catch {
            return null;
        }
    }

    private async writeManifest(handle: FileSystemDirectoryHandle, manifest: WorkspaceManifestFile): Promise<void> {
        const fileHandle = await handle.getFileHandle(MANIFEST_FILE_NAME, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(manifest, null, 2));
        await writable.close();
    }

    private emptyElements(): Record<string, WorkspaceManifestItem[]> {
        return {
            [AssetCategory.Eyes]: [],
            [AssetCategory.Mouth]: [],
            [AssetCategory.Torso]: [],
            [AssetCategory.Legs]: []
        };
    }

    private emptySelection(): Record<string, string> {
        return {
            [AssetCategory.Eyes]: '',
            [AssetCategory.Mouth]: '',
            [AssetCategory.Torso]: '',
            [AssetCategory.Legs]: ''
        };
    }

    private emptyLocks(): Record<string, boolean> {
        return {
            [AssetCategory.Eyes]: false,
            [AssetCategory.Mouth]: false,
            [AssetCategory.Torso]: false,
            [AssetCategory.Legs]: false
        };
    }

    private async ensureWorkspaceStructure(handle: FileSystemDirectoryHandle): Promise<void> {
        await handle.getDirectoryHandle(AssetCategory.Eyes, { create: true });
        await handle.getDirectoryHandle(AssetCategory.Mouth, { create: true });
        await handle.getDirectoryHandle(AssetCategory.Torso, { create: true });
        await handle.getDirectoryHandle(AssetCategory.Legs, { create: true });
        await handle.getDirectoryHandle(TEMPLATE_FOLDER, { create: true });
    }

    private async ensureTemplate(handle: FileSystemDirectoryHandle): Promise<void> {
        const folderHandle = await handle.getDirectoryHandle(TEMPLATE_FOLDER, { create: true });
        try {
            await folderHandle.getFileHandle(TEMPLATE_FILE);
        } catch {
            const placeholder = await this.createBlankTemplate();
            const fileHandle = await folderHandle.getFileHandle(TEMPLATE_FILE, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(placeholder);
            await writable.close();
        }
    }

    private async createBlankTemplate(): Promise<Blob> {
        const canvas = document.createElement('canvas');
        canvas.width = EXPORT_WIDTH;
        canvas.height = EXPORT_HEIGHT;
        const context = canvas.getContext('2d');
        if (context) {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
        return new Promise(resolve => {
            canvas.toBlob(blob => {
                resolve(blob || new Blob());
            }, 'image/png');
        });
    }

    private async toProjectManifest(manifest: WorkspaceManifestFile, handle: FileSystemDirectoryHandle): Promise<ProjectManifest> {
        const assets: Record<AssetCategory, AssetItem[]> = {
            [AssetCategory.Legs]: [],
            [AssetCategory.Torso]: [],
            [AssetCategory.Mouth]: [],
            [AssetCategory.Eyes]: []
        };

        for (const [categoryKey, items] of Object.entries(manifest.elementos || {})) {
            const category = this.toAssetCategory(categoryKey);
            if (!category) {
                continue;
            }
            for (const item of items) {
                const previewUrl = await this.readFileAsObjectUrl(handle, item.arquivo);
                assets[category].push({
                    id: item.id,
                    name: item.nome,
                    category,
                    filePath: item.arquivo,
                    transform: this.toTransform(item.transformacao),
                    createdAt: item.criadoEm,
                    previewUrl
                });
            }
        }

        const templatePreviewUrl = manifest.imagemGabarito
            ? await this.readFileAsObjectUrl(handle, manifest.imagemGabarito)
            : undefined;

        const layersFromManifest = (manifest.camadas || [])
            .map(layer => this.toAssetCategory(layer))
            .filter((layer): layer is AssetCategory => Boolean(layer));

        return {
            name: manifest.nome,
            version: manifest.versao,
            canvasWidth: manifest.larguraCanvas,
            canvasHeight: manifest.alturaCanvas,
            layers: layersFromManifest.length > 0 ? layersFromManifest : LAYER_ORDER,
            templateImage: manifest.imagemGabarito,
            templatePreviewUrl,
            assets,
            selected: this.toSelection(manifest.ultimaSelecao),
            locked: this.toLocks(manifest.bloqueios),
            hidden: this.toHidden(manifest.ocultas),
            history: this.toHistory(manifest.historico)
        };
    }

    private toManifestFile(project: ProjectManifest): WorkspaceManifestFile {
        return {
            nome: project.name,
            versao: project.version,
            larguraCanvas: project.canvasWidth,
            alturaCanvas: project.canvasHeight,
            camadas: project.layers?.length ? project.layers : LAYER_ORDER,
            imagemGabarito: project.templateImage || '',
            elementos: this.toElementos(project.assets),
            ultimaSelecao: this.fromSelection(project.selected),
            bloqueios: this.fromLocks(project.locked),
            ocultas: this.fromHidden(project.hidden),
            historico: this.fromHistory(project)
        };
    }

    private toElementos(assets: Record<AssetCategory, AssetItem[]>): Record<string, WorkspaceManifestItem[]> {
        return Object.values(AssetCategory).reduce((acc, category) => {
            acc[category] = (assets[category] || []).map(item => ({
                id: item.id,
                categoria: item.category,
                nome: item.name,
                arquivo: item.filePath,
                transformacao: this.fromTransform(item.transform),
                criadoEm: item.createdAt
            }));
            return acc;
        }, {} as Record<string, WorkspaceManifestItem[]>);
    }

    private toTransform(transform?: WorkspaceManifestTransform): AssetTransform {
        return {
            x: transform?.x ?? 0,
            y: transform?.y ?? 0,
            scale: transform?.escala ?? 1,
            rotation: transform?.rotacao ?? 0,
            opacity: transform?.opacidade ?? 1
        };
    }

    private fromTransform(transform: AssetTransform): WorkspaceManifestTransform {
        return {
            x: transform.x,
            y: transform.y,
            escala: transform.scale,
            rotacao: transform.rotation,
            opacidade: transform.opacity ?? 1
        };
    }

    private toSelection(ultimaSelecao: Record<string, string>): Partial<Record<AssetCategory, string>> {
        return {
            [AssetCategory.Eyes]: ultimaSelecao?.[AssetCategory.Eyes],
            [AssetCategory.Mouth]: ultimaSelecao?.[AssetCategory.Mouth],
            [AssetCategory.Torso]: ultimaSelecao?.[AssetCategory.Torso],
            [AssetCategory.Legs]: ultimaSelecao?.[AssetCategory.Legs]
        };
    }

    private fromSelection(selected: Partial<Record<AssetCategory, string>>): Record<string, string> {
        return {
            [AssetCategory.Eyes]: selected[AssetCategory.Eyes] ?? '',
            [AssetCategory.Mouth]: selected[AssetCategory.Mouth] ?? '',
            [AssetCategory.Torso]: selected[AssetCategory.Torso] ?? '',
            [AssetCategory.Legs]: selected[AssetCategory.Legs] ?? ''
        };
    }

    private toLocks(bloqueios: Record<string, boolean>): Partial<Record<AssetCategory, boolean>> {
        return {
            [AssetCategory.Eyes]: bloqueios?.[AssetCategory.Eyes] ?? false,
            [AssetCategory.Mouth]: bloqueios?.[AssetCategory.Mouth] ?? false,
            [AssetCategory.Torso]: bloqueios?.[AssetCategory.Torso] ?? false,
            [AssetCategory.Legs]: bloqueios?.[AssetCategory.Legs] ?? false
        };
    }

    private fromLocks(locked: Partial<Record<AssetCategory, boolean>>): Record<string, boolean> {
        return {
            [AssetCategory.Eyes]: locked[AssetCategory.Eyes] ?? false,
            [AssetCategory.Mouth]: locked[AssetCategory.Mouth] ?? false,
            [AssetCategory.Torso]: locked[AssetCategory.Torso] ?? false,
            [AssetCategory.Legs]: locked[AssetCategory.Legs] ?? false
        };
    }

    private toHidden(ocultas: Record<string, boolean> | undefined): Partial<Record<AssetCategory, boolean>> {
        if (!ocultas) return {};
        const result: Partial<Record<AssetCategory, boolean>> = {};
        for (const [key, value] of Object.entries(ocultas)) {
            const cat = this.toAssetCategory(key);
            if (cat) result[cat] = value;
        }
        return result;
    }

    private fromHidden(hidden: Partial<Record<AssetCategory, boolean>> | undefined): Record<string, boolean> {
        if (!hidden) return {};
        return Object.entries(hidden).reduce((acc, [k, v]) => {
            if (v !== undefined) acc[k] = v;
            return acc;
        }, {} as Record<string, boolean>);
    }

    private toHistory(entries: WorkspaceManifestHistory[] = []): ProjectManifest['history'] {
        return entries.map(entry => ({
            date: entry.data,
            snapshot: {
                selected: this.toSelection(entry.snapshot.ultimaSelecao),
                locked: this.toLocks(entry.snapshot.bloqueios)
            }
        }));
    }

    private fromHistory(project: ProjectManifest): WorkspaceManifestHistory[] {
        const now = new Date().toISOString();
        const base: WorkspaceManifestHistory[] = (project.history || []).map(entry => ({
            data: entry.date,
            snapshot: {
                ultimaSelecao: this.fromSelection(entry.snapshot.selected),
                bloqueios: this.fromLocks(entry.snapshot.locked)
            }
        }));

        const latest = {
            data: now,
            snapshot: {
                ultimaSelecao: this.fromSelection(project.selected),
                bloqueios: this.fromLocks(project.locked)
            }
        };

        const combined = [...base, latest];
        return combined.slice(-MAX_HISTORY);
    }

    private async getFileHandleByPath(handle: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle | null> {
        const normalized = path.replace(/\\/g, '/').replace(/^\//, '');
        const parts = normalized.split('/').filter(Boolean);
        if (parts.length === 0) {
            return null;
        }
        let current: FileSystemDirectoryHandle = handle;
        for (let i = 0; i < parts.length - 1; i += 1) {
            current = await current.getDirectoryHandle(parts[i]);
        }
        return await current.getFileHandle(parts[parts.length - 1]);
    }

    private toAssetCategory(category: string): AssetCategory | null {
        switch (category) {
            case AssetCategory.Eyes:
                return AssetCategory.Eyes;
            case AssetCategory.Mouth:
                return AssetCategory.Mouth;
            case AssetCategory.Torso:
                return AssetCategory.Torso;
            case AssetCategory.Legs:
                return AssetCategory.Legs;
            default:
                return null;
        }
    }
}
