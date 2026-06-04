import { Injectable } from '@angular/core';
import { ImageLoaderService } from './image-loader.service';
import { ProjectManifest } from '../../domain/models/project-manifest';
import { EXPORT_HEIGHT, EXPORT_MIME, EXPORT_WIDTH } from '../../shared/constants/export.constants';

@Injectable({ providedIn: 'root' })
export class ExportService {
    constructor(private readonly loader: ImageLoaderService) { }

    async exportPng(manifest: ProjectManifest): Promise<Blob> {
        const template = manifest.templates.find(t => t.id === manifest.activeTemplateId) ?? manifest.templates[0];
        if (!template) throw new Error('No active template.');

        const canvas = document.createElement('canvas');
        canvas.width = template.canvasWidth || EXPORT_WIDTH;
        canvas.height = template.canvasHeight || EXPORT_HEIGHT;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas context unavailable.');
        context.clearRect(0, 0, canvas.width, canvas.height);

        for (const layer of template.layers) {
            if (template.hidden?.[layer.id]) continue;
            const selectedId = template.selected[layer.id];
            const asset = (template.assets[layer.id] ?? []).find(item => item.id === selectedId);
            if (!asset?.previewUrl) continue;
            const image = await this.loader.load(asset.previewUrl);
            context.save();
            context.translate(asset.transform.x, asset.transform.y);
            context.rotate((asset.transform.rotation * Math.PI) / 180);
            context.scale(asset.transform.scale, asset.transform.scale);
            context.globalAlpha = asset.transform.opacity ?? 1;
            context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
            context.restore();
        }

        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) { reject(new Error('Export failed.')); return; }
                resolve(blob);
            }, EXPORT_MIME, 1);
        });
    }
}
