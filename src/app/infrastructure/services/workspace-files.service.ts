import { Injectable } from '@angular/core';
import { AssetItem } from '../../domain/models/asset-item';
import { AssetTransform } from '../../domain/models/asset-transform';
import { Layer } from '../../domain/models/layer';
import { ProjectManifest } from '../../domain/models/project-manifest';
import { Template } from '../../domain/models/template';
import { EXPORT_HEIGHT, EXPORT_WIDTH } from '../../shared/constants/export.constants';

// ─── Manifest file interfaces ─────────────────────────────────────────────────

export interface WorkspaceCamada {
    id: string;
    nome: string;
}

export interface WorkspaceManifestTransform {
    x: number;
    y: number;
    escala: number;
    rotacao: number;
    opacidade: number;
}

export interface WorkspaceManifestItem {
    id: string;
    layerId: string;
    nome: string;
    arquivo: string;
    transformacao: WorkspaceManifestTransform;
    criadoEm: string;
}

export interface WorkspaceTemplateFile {
    id: string;
    nome: string;
    imagemGabarito: string;
    larguraCanvas: number;
    alturaCanvas: number;
    camadas: WorkspaceCamada[];
    elementos: Record<string, WorkspaceManifestItem[]>;
    ultimaSelecao: Record<string, string>;
    bloqueios: Record<string, boolean>;
    ocultas: Record<string, boolean>;
}

export interface WorkspaceHistorySnapshot {
    data: string;
    templateAtivo: string;
    snapshots: Record<string, {
        ultimaSelecao: Record<string, string>;
        bloqueios: Record<string, boolean>;
    }>;
}

export interface WorkspaceManifestFile {
    nome: string;
    versao: string;
    templateAtivo: string;
    templates: WorkspaceTemplateFile[];
    historico: WorkspaceHistorySnapshot[];
}

export interface WorkspaceSelection {
    handle: FileSystemDirectoryHandle;
    manifestFile: WorkspaceManifestFile | null;
    project: ProjectManifest | null;
}

const MANIFEST_FILE_NAME = 'manifesto.json';
const TEMPLATE_FOLDER = 'templat';
const MAX_HISTORY = 30;
const RECENT_WORKSPACE_NAME_KEY = 'cb.recentWorkspace.name';
const RECENT_WORKSPACE_AT_KEY = 'cb.recentWorkspace.at';
const DB_NAME = 'character-builder';
const DB_VERSION = 1;
const HANDLE_STORE = 'workspace-handles';
const HANDLE_KEY = 'last';

@Injectable({ providedIn: 'root' })
export class WorkspaceFilesService {
    async rememberWorkspace(handle: FileSystemDirectoryHandle): Promise<void> {
        try {
            localStorage.setItem(RECENT_WORKSPACE_NAME_KEY, handle.name);
            localStorage.setItem(RECENT_WORKSPACE_AT_KEY, new Date().toISOString());
            await this.saveHandle(handle);
        } catch {
            // Ignore storage failures.
        }
    }

    async restoreRecentWorkspace(): Promise<WorkspaceSelection | null> {
        const handle = await this.loadHandle();
        if (!handle) return null;

        try {
            const maybePermHandle = handle as FileSystemDirectoryHandle & {
                queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
                requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
            };

            // Try to verify existing permission
            let permission: PermissionState | undefined;
            if (maybePermHandle.queryPermission) {
                permission = await maybePermHandle.queryPermission({ mode: 'readwrite' });
            }

            // If permission denied, try requesting it
            if (permission === 'denied' && maybePermHandle.requestPermission) {
                permission = await maybePermHandle.requestPermission({ mode: 'readwrite' });
            }

            // If still not granted, bail out
            if (permission && permission !== 'granted') return null;

            const raw = await this.readRawManifest(handle);
            if (!raw) return null;
            const manifestFile = this.ensureNewFormat(raw);
            const project = await this.toProjectManifest(manifestFile, handle);
            return { handle, manifestFile, project };
        } catch {
            return null;
        }
    }

    getRecentWorkspaceName(): string {
        return localStorage.getItem(RECENT_WORKSPACE_NAME_KEY) ?? '';
    }

    hasRecentWorkspace(): boolean {
        return !!localStorage.getItem(RECENT_WORKSPACE_NAME_KEY);
    }

    getRecentWorkspaceDate(): string {
        return localStorage.getItem(RECENT_WORKSPACE_AT_KEY) ?? '';
    }

    async selectWorkspace(): Promise<WorkspaceSelection | null> {
        if (!('showDirectoryPicker' in window)) {
            window.alert('Seu navegador nao suporta selecao de pasta.');
            return null;
        }
        try {
            const handle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
            const raw = await this.readRawManifest(handle);
            if (!raw) return { handle, manifestFile: null, project: null };
            const manifestFile = this.ensureNewFormat(raw);
            const project = await this.toProjectManifest(manifestFile, handle);
            return { handle, manifestFile, project };
        } catch {
            return null;
        }
    }

    async revealWorkspaceFolder(handle: FileSystemDirectoryHandle): Promise<boolean> {
        if (!('showDirectoryPicker' in window)) return false;
        try {
            await (window as unknown as {
                showDirectoryPicker: (options?: { startIn?: FileSystemHandle }) => Promise<FileSystemDirectoryHandle>
            }).showDirectoryPicker({ startIn: handle });
            return true;
        } catch {
            return false;
        }
    }

    async createWorkspace(handle: FileSystemDirectoryHandle, name: string): Promise<ProjectManifest> {
        await handle.getDirectoryHandle(TEMPLATE_FOLDER, { create: true });

        const templateId = this.createId();
        const defaultCamadas: WorkspaceCamada[] = [
            { id: this.createId(), nome: 'Pernas' },
            { id: this.createId(), nome: 'Torso' },
            { id: this.createId(), nome: 'Boca' },
            { id: this.createId(), nome: 'Olhos' }
        ];

        for (const c of defaultCamadas) {
            await handle.getDirectoryHandle(c.id, { create: true });
        }

        const blankBlob = await this.createBlankImage(EXPORT_WIDTH, EXPORT_HEIGHT);
        const templateImagePath = `${TEMPLATE_FOLDER}/template_${templateId}.png`;
        await this.saveFile(handle, templateImagePath, blankBlob);

        const now = new Date().toISOString();
        const templateFile: WorkspaceTemplateFile = {
            id: templateId,
            nome: 'Template 1',
            imagemGabarito: templateImagePath,
            larguraCanvas: EXPORT_WIDTH,
            alturaCanvas: EXPORT_HEIGHT,
            camadas: defaultCamadas,
            elementos: Object.fromEntries(defaultCamadas.map(c => [c.id, []])),
            ultimaSelecao: {},
            bloqueios: {},
            ocultas: {}
        };

        const manifest: WorkspaceManifestFile = {
            nome: name,
            versao: '2.0.0',
            templateAtivo: templateId,
            templates: [templateFile],
            historico: [{ data: now, templateAtivo: templateId, snapshots: {} }]
        };

        await this.writeManifest(handle, manifest);
        return this.toProjectManifest(manifest, handle);
    }

    async saveManifestFromProject(handle: FileSystemDirectoryHandle, manifest: ProjectManifest): Promise<void> {
        const file = this.toManifestFile(manifest);
        await this.writeManifest(handle, file);
    }

    async saveTemplateImage(handle: FileSystemDirectoryHandle, templateId: string, file: File): Promise<string> {
        const path = `${TEMPLATE_FOLDER}/template_${templateId}.png`;
        await this.saveFile(handle, path, file);
        return path;
    }

    async saveAssetBlob(handle: FileSystemDirectoryHandle, layerId: string, fileName: string, blob: Blob): Promise<string> {
        const normalized = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
        await handle.getDirectoryHandle(layerId, { create: true });
        const path = `${layerId}/${normalized}`;
        await this.saveFile(handle, path, blob);
        return path;
    }

    async readFileAsObjectUrl(handle: FileSystemDirectoryHandle, path: string): Promise<string> {
        try {
            const fileHandle = await this.getFileHandleByPath(handle, path);
            if (!fileHandle) return '';
            const file = await fileHandle.getFile();
            return URL.createObjectURL(file);
        } catch {
            return '';
        }
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private async readRawManifest(handle: FileSystemDirectoryHandle): Promise<unknown | null> {
        try {
            const fileHandle = await handle.getFileHandle(MANIFEST_FILE_NAME);
            const file = await fileHandle.getFile();
            const text = await file.text();
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    private ensureNewFormat(raw: unknown): WorkspaceManifestFile {
        const obj = raw as Record<string, unknown>;
        if (Array.isArray(obj['templates'])) {
            return obj as unknown as WorkspaceManifestFile;
        }
        return this.migrateFromLegacy(obj);
    }

    private migrateFromLegacy(old: Record<string, unknown>): WorkspaceManifestFile {
        const now = new Date().toISOString();
        const templateId = this.createId();
        const oldCamadas = (old['camadas'] as string[] | undefined) ?? ['pernas', 'torso', 'boca', 'olhos'];
        const oldElementos = (old['elementos'] as Record<string, unknown[]> | undefined) ?? {};
        const oldSelecao = (old['ultimaSelecao'] as Record<string, string> | undefined) ?? {};
        const oldBloqueios = (old['bloqueios'] as Record<string, boolean> | undefined) ?? {};
        const oldOcultas = (old['ocultas'] as Record<string, boolean> | undefined) ?? {};

        // Re-use the category string as layer id so existing file paths remain valid
        const camadas: WorkspaceCamada[] = oldCamadas.map(c => ({
            id: c,
            nome: c.charAt(0).toUpperCase() + c.slice(1)
        }));

        const elementos: Record<string, WorkspaceManifestItem[]> = {};
        for (const [catKey, items] of Object.entries(oldElementos)) {
            elementos[catKey] = (items as Record<string, unknown>[]).map(item => ({
                id: (item['id'] as string | undefined) ?? this.createId(),
                layerId: catKey,
                nome: (item['nome'] as string | undefined) ?? (item['name'] as string | undefined) ?? '',
                arquivo: (item['arquivo'] as string | undefined) ?? (item['filePath'] as string | undefined) ?? '',
                transformacao: (item['transformacao'] as WorkspaceManifestTransform | undefined) ?? {
                    x: EXPORT_WIDTH / 2, y: EXPORT_HEIGHT / 2, escala: 1, rotacao: 0, opacidade: 1
                },
                criadoEm: (item['criadoEm'] as string | undefined) ?? (item['createdAt'] as string | undefined) ?? now
            }));
        }

        const templateFile: WorkspaceTemplateFile = {
            id: templateId,
            nome: 'Template 1',
            imagemGabarito: (old['imagemGabarito'] as string | undefined) ?? '',
            larguraCanvas: (old['larguraCanvas'] as number | undefined) ?? EXPORT_WIDTH,
            alturaCanvas: (old['alturaCanvas'] as number | undefined) ?? EXPORT_HEIGHT,
            camadas,
            elementos,
            ultimaSelecao: oldSelecao,
            bloqueios: oldBloqueios,
            ocultas: oldOcultas
        };

        return {
            nome: (old['nome'] as string | undefined) ?? 'Projeto Migrado',
            versao: '2.0.0',
            templateAtivo: templateId,
            templates: [templateFile],
            historico: [{ data: now, templateAtivo: templateId, snapshots: {} }]
        };
    }

    private async toProjectManifest(manifest: WorkspaceManifestFile, handle: FileSystemDirectoryHandle): Promise<ProjectManifest> {
        const templates: Template[] = [];

        for (const tpl of manifest.templates) {
            const layers: Layer[] = (tpl.camadas ?? []).map(c => ({ id: c.id, name: c.nome }));
            const assets: Record<string, AssetItem[]> = {};

            for (const [layerId, items] of Object.entries(tpl.elementos ?? {})) {
                assets[layerId] = [];
                for (const item of items) {
                    const previewUrl = await this.readFileAsObjectUrl(handle, item.arquivo);
                    assets[layerId].push({
                        id: item.id,
                        name: item.nome,
                        layerId: item.layerId ?? layerId,
                        filePath: item.arquivo,
                        transform: this.toTransform(item.transformacao),
                        createdAt: item.criadoEm,
                        previewUrl
                    });
                }
            }

            for (const layer of layers) {
                if (!assets[layer.id]) assets[layer.id] = [];
            }

            const previewUrl = tpl.imagemGabarito
                ? await this.readFileAsObjectUrl(handle, tpl.imagemGabarito)
                : undefined;

            templates.push({
                id: tpl.id,
                name: tpl.nome,
                imagePath: tpl.imagemGabarito,
                previewUrl,
                canvasWidth: tpl.larguraCanvas ?? EXPORT_WIDTH,
                canvasHeight: tpl.alturaCanvas ?? EXPORT_HEIGHT,
                layers,
                assets,
                selected: tpl.ultimaSelecao ?? {},
                locked: tpl.bloqueios ?? {},
                hidden: tpl.ocultas ?? {}
            });
        }

        return {
            name: manifest.nome,
            version: manifest.versao,
            templates,
            activeTemplateId: manifest.templateAtivo ?? templates[0]?.id ?? '',
            history: this.toHistory(manifest.historico ?? [])
        };
    }

    private openDb(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(HANDLE_STORE)) {
                    db.createObjectStore(HANDLE_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    private async saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
        const db = await this.openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(HANDLE_STORE, 'readwrite');
            tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
        db.close();
    }

    private async loadHandle(): Promise<FileSystemDirectoryHandle | null> {
        const db = await this.openDb();
        const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
            const tx = db.transaction(HANDLE_STORE, 'readonly');
            const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
            req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return handle;
    }

    private toManifestFile(project: ProjectManifest): WorkspaceManifestFile {
        const templates: WorkspaceTemplateFile[] = project.templates.map(tpl => ({
            id: tpl.id,
            nome: tpl.name,
            imagemGabarito: tpl.imagePath,
            larguraCanvas: tpl.canvasWidth,
            alturaCanvas: tpl.canvasHeight,
            camadas: tpl.layers.map(l => ({ id: l.id, nome: l.name })),
            elementos: this.toElementos(tpl.assets),
            ultimaSelecao: tpl.selected,
            bloqueios: tpl.locked,
            ocultas: tpl.hidden
        }));

        const now = new Date().toISOString();
        const snapshot: WorkspaceHistorySnapshot = {
            data: now,
            templateAtivo: project.activeTemplateId,
            snapshots: Object.fromEntries(
                project.templates.map(t => [t.id, {
                    ultimaSelecao: t.selected,
                    bloqueios: t.locked
                }])
            )
        };

        const historico = [
            ...project.history.map(h => ({
                data: h.date,
                templateAtivo: h.activeTemplateId,
                snapshots: Object.fromEntries(
                    Object.entries(h.templateSnapshots).map(([tid, s]) => [tid, {
                        ultimaSelecao: s.selected,
                        bloqueios: s.locked
                    }])
                )
            })),
            snapshot
        ].slice(-MAX_HISTORY);

        return {
            nome: project.name,
            versao: project.version,
            templateAtivo: project.activeTemplateId,
            templates,
            historico
        };
    }

    private toElementos(assets: Record<string, AssetItem[]>): Record<string, WorkspaceManifestItem[]> {
        return Object.fromEntries(
            Object.entries(assets).map(([layerId, items]) => [
                layerId,
                items.map(item => ({
                    id: item.id,
                    layerId: item.layerId,
                    nome: item.name,
                    arquivo: item.filePath,
                    transformacao: this.fromTransform(item.transform),
                    criadoEm: item.createdAt
                }))
            ])
        );
    }

    private toTransform(t?: WorkspaceManifestTransform): AssetTransform {
        return {
            x: t?.x ?? 0,
            y: t?.y ?? 0,
            scale: t?.escala ?? 1,
            rotation: t?.rotacao ?? 0,
            opacity: t?.opacidade ?? 1
        };
    }

    private fromTransform(t: AssetTransform): WorkspaceManifestTransform {
        return { x: t.x, y: t.y, escala: t.scale, rotacao: t.rotation, opacidade: t.opacity ?? 1 };
    }

    private toHistory(entries: WorkspaceHistorySnapshot[]): ProjectManifest['history'] {
        return entries.map(e => ({
            date: e.data,
            activeTemplateId: e.templateAtivo,
            templateSnapshots: Object.fromEntries(
                Object.entries(e.snapshots ?? {}).map(([tid, s]) => [tid, {
                    selected: s.ultimaSelecao,
                    locked: s.bloqueios
                }])
            )
        }));
    }

    private async writeManifest(handle: FileSystemDirectoryHandle, manifest: WorkspaceManifestFile): Promise<void> {
        const fileHandle = await handle.getFileHandle(MANIFEST_FILE_NAME, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(manifest, null, 2));
        await writable.close();
    }

    private async saveFile(handle: FileSystemDirectoryHandle, path: string, data: Blob | File): Promise<void> {
        const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
        let dir: FileSystemDirectoryHandle = handle;
        for (let i = 0; i < parts.length - 1; i++) {
            dir = await dir.getDirectoryHandle(parts[i], { create: true });
        }
        const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
    }

    private async getFileHandleByPath(handle: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle | null> {
        const normalized = path.replace(/\\/g, '/').replace(/^\//, '');
        const parts = normalized.split('/').filter(Boolean);
        if (!parts.length) return null;
        let current: FileSystemDirectoryHandle = handle;
        for (let i = 0; i < parts.length - 1; i++) {
            current = await current.getDirectoryHandle(parts[i]);
        }
        return await current.getFileHandle(parts[parts.length - 1]);
    }

    private async createBlankImage(width: number, height: number): Promise<Blob> {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.clearRect(0, 0, width, height);
        return new Promise(resolve => {
            canvas.toBlob(blob => resolve(blob ?? new Blob()), 'image/png');
        });
    }

    private createId(): string {
        if ('randomUUID' in crypto) return (crypto as unknown as { randomUUID: () => string }).randomUUID();
        return `id-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }
}
