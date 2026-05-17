import { Injectable } from '@angular/core';
import { ImageLoaderService } from './image-loader.service';
import { LAYER_ORDER } from '../../shared/constants/layer.constants';
import { ProjectManifest } from '../../domain/models/project-manifest';
import { EXPORT_HEIGHT, EXPORT_MIME, EXPORT_WIDTH } from '../../shared/constants/export.constants';

@Injectable({ providedIn: 'root' })
export class ExportService {
    constructor(private readonly loader: ImageLoaderService) { }

    async exportPng(manifest: ProjectManifest): Promise<Blob> {
        const canvas = document.createElement('canvas');
        canvas.width = manifest.canvasWidth || EXPORT_WIDTH;
        canvas.height = manifest.canvasHeight || EXPORT_HEIGHT;
        const context = canvas.getContext('2d');

        if (!context) {
            throw new Error('Canvas context unavailable.');
        }

        context.clearRect(0, 0, canvas.width, canvas.height);

        const layers = manifest.layers?.length ? manifest.layers : LAYER_ORDER;
        for (const category of layers) {
            if (manifest.hidden?.[category]) {
                continue;
            }
            const selectedId = manifest.selected[category];
            const asset = manifest.assets[category].find(item => item.id === selectedId);
            if (!asset) {
                continue;
            }
            const source = asset.previewUrl || '';
            if (!source) {
                continue;
            }
            const image = await this.loader.load(source);
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
                if (!blob) {
                    reject(new Error('Export failed.'));
                    return;
                }
                resolve(blob);
            }, EXPORT_MIME, 1);
        });
    }
}
