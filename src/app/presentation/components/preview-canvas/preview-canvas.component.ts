import { AfterViewInit, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { ImageLoaderService } from '../../../infrastructure/services/image-loader.service';
import { LAYER_ORDER } from '../../../shared/constants/layer.constants';
import { ProjectManifest } from '../../../domain/models/project-manifest';
import { EXPORT_HEIGHT, EXPORT_WIDTH } from '../../../shared/constants/export.constants';

@Component({
    selector: 'app-preview-canvas',
    templateUrl: './preview-canvas.component.html',
    styleUrls: ['./preview-canvas.component.scss']
})
export class PreviewCanvasComponent implements AfterViewInit, OnChanges {
    @Input() manifest?: ProjectManifest;
    @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

    constructor(private readonly loader: ImageLoaderService) { }

    private isReady = false;
    zoom = 1;
    pan = { x: 0, y: 0 };
    private isPanning = false;
    private panStart = { x: 0, y: 0 };
    private panOrigin = { x: 0, y: 0 };

    templateOpacity = 0.5;
    showTemplate = true;

    ngAfterViewInit(): void {
        const canvas = this.canvasRef.nativeElement;
        canvas.width = EXPORT_WIDTH;
        canvas.height = EXPORT_HEIGHT;
        this.isReady = true;
        this.draw();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['manifest']) {
            this.draw();
        }
    }

    get transformStyle(): string {
        return `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    }

    zoomIn(): void {
        this.zoom = Math.min(3, this.zoom + 0.1);
    }

    zoomOut(): void {
        this.zoom = Math.max(0.5, this.zoom - 0.1);
    }

    resetView(): void {
        this.zoom = 1;
        this.pan = { x: 0, y: 0 };
    }

    startPan(event: MouseEvent): void {
        this.isPanning = true;
        this.panStart = { x: event.clientX, y: event.clientY };
        this.panOrigin = { ...this.pan };
    }

    movePan(event: MouseEvent): void {
        if (!this.isPanning) {
            return;
        }
        const dx = event.clientX - this.panStart.x;
        const dy = event.clientY - this.panStart.y;
        this.pan = { x: this.panOrigin.x + dx, y: this.panOrigin.y + dy };
    }

    stopPan(): void {
        this.isPanning = false;
    }

    onWheel(event: WheelEvent): void {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        this.zoom = Math.min(3, Math.max(0.5, this.zoom + delta));
    }

    private async draw(): Promise<void> {
        if (!this.isReady || !this.manifest) {
            return;
        }

        const canvas = this.canvasRef.nativeElement;
        canvas.width = this.manifest.canvasWidth || EXPORT_WIDTH;
        canvas.height = this.manifest.canvasHeight || EXPORT_HEIGHT;
        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);

        const layers = this.manifest.layers?.length ? this.manifest.layers : LAYER_ORDER;
        for (const category of layers) {
            if (this.manifest.hidden?.[category]) {
                continue;
            }
            const selectedId = this.manifest.selected[category];
            const asset = this.manifest.assets[category].find(item => item.id === selectedId);
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
    }
}
