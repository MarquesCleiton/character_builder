import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { ImageLoaderService } from '../../../infrastructure/services/image-loader.service';
import { LAYER_ORDER } from '../../../shared/constants/layer.constants';
import { ProjectManifest } from '../../../domain/models/project-manifest';
import { EXPORT_HEIGHT, EXPORT_WIDTH } from '../../../shared/constants/export.constants';

@Component({
    selector: 'app-preview-canvas',
    templateUrl: './preview-canvas.component.html',
    styleUrls: ['./preview-canvas.component.scss']
})
export class PreviewCanvasComponent implements AfterViewInit, OnChanges, OnDestroy {
    @Input() manifest?: ProjectManifest;
    @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
    @ViewChild('viewport', { static: true }) viewportRef!: ElementRef<HTMLDivElement>;

    constructor(private readonly loader: ImageLoaderService) { }

    private isReady = false;
    zoom = 1;
    pan = { x: 0, y: 0 };
    private isPanning = false;
    private panStart = { x: 0, y: 0 };
    private panOrigin = { x: 0, y: 0 };
    private _wheelHandler?: (e: WheelEvent) => void;

    templateOpacity = 0.5;
    showTemplate = true;

    get canvasWidth(): number { return this.manifest?.canvasWidth || EXPORT_WIDTH; }
    get canvasHeight(): number { return this.manifest?.canvasHeight || EXPORT_HEIGHT; }

    get aspectRatioLabel(): string {
        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const d = gcd(w, h);
        return `${w / d}:${h / d}`;
    }

    get canvasSize(): string {
        return `${this.canvasWidth}\u00d7${this.canvasHeight}`;
    }

    ngAfterViewInit(): void {
        const canvas = this.canvasRef.nativeElement;
        canvas.width = this.canvasWidth;
        canvas.height = this.canvasHeight;
        this.isReady = true;

        this._wheelHandler = (e: WheelEvent) => this.onWheel(e);
        this.viewportRef.nativeElement.addEventListener('wheel', this._wheelHandler, { passive: false });

        this.fitView();
        this.draw();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['manifest']) {
            const prev = changes['manifest'].previousValue as ProjectManifest | undefined;
            const curr = changes['manifest'].currentValue as ProjectManifest | undefined;
            if (this.isReady && (prev?.canvasWidth !== curr?.canvasWidth || prev?.canvasHeight !== curr?.canvasHeight)) {
                const canvas = this.canvasRef.nativeElement;
                canvas.width = this.canvasWidth;
                canvas.height = this.canvasHeight;
                this.fitView();
            }
            this.draw();
        }
    }

    ngOnDestroy(): void {
        if (this._wheelHandler) {
            this.viewportRef.nativeElement.removeEventListener('wheel', this._wheelHandler);
        }
    }

    get transformStyle(): string {
        return `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    }

    fitView(): void {
        const viewport = this.viewportRef?.nativeElement;
        if (!viewport) return;
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        if (vw === 0 || vh === 0) return;
        const cw = this.canvasWidth;
        const ch = this.canvasHeight;
        this.zoom = Math.min(vw / cw, vh / ch);
        this.pan = {
            x: (vw - cw * this.zoom) / 2,
            y: (vh - ch * this.zoom) / 2
        };
    }

    private _applyZoom(delta: number, originX: number, originY: number): void {
        const newZoom = Math.min(4, Math.max(0.05, this.zoom + delta));
        const imgX = (originX - this.pan.x) / this.zoom;
        const imgY = (originY - this.pan.y) / this.zoom;
        this.pan = {
            x: originX - imgX * newZoom,
            y: originY - imgY * newZoom
        };
        this.zoom = newZoom;
    }

    zoomIn(): void {
        const vp = this.viewportRef.nativeElement;
        this._applyZoom(0.15, vp.clientWidth / 2, vp.clientHeight / 2);
    }

    zoomOut(): void {
        const vp = this.viewportRef.nativeElement;
        this._applyZoom(-0.15, vp.clientWidth / 2, vp.clientHeight / 2);
    }

    resetView(): void {
        this.fitView();
    }

    startPan(event: MouseEvent): void {
        this.isPanning = true;
        this.panStart = { x: event.clientX, y: event.clientY };
        this.panOrigin = { ...this.pan };
    }

    movePan(event: MouseEvent): void {
        if (!this.isPanning) return;
        const dx = event.clientX - this.panStart.x;
        const dy = event.clientY - this.panStart.y;
        this.pan = { x: this.panOrigin.x + dx, y: this.panOrigin.y + dy };
    }

    stopPan(): void {
        this.isPanning = false;
    }

    onWheel(event: WheelEvent): void {
        event.preventDefault();
        const rect = this.viewportRef.nativeElement.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        this._applyZoom(delta, mouseX, mouseY);
    }

    private async draw(): Promise<void> {
        if (!this.isReady || !this.manifest) return;

        const canvas = this.canvasRef.nativeElement;
        canvas.width = this.manifest.canvasWidth || EXPORT_WIDTH;
        canvas.height = this.manifest.canvasHeight || EXPORT_HEIGHT;
        const context = canvas.getContext('2d');
        if (!context) return;

        context.clearRect(0, 0, canvas.width, canvas.height);

        const layers = this.manifest.layers?.length ? this.manifest.layers : LAYER_ORDER;
        for (const category of layers) {
            if (this.manifest.hidden?.[category]) continue;
            const selectedId = this.manifest.selected[category];
            const asset = this.manifest.assets[category].find(item => item.id === selectedId);
            if (!asset) continue;
            const source = asset.previewUrl || '';
            if (!source) continue;
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
