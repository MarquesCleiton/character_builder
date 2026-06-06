import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { ImageLoaderService } from '../../../infrastructure/services/image-loader.service';
import { ProjectManifest } from '../../../domain/models/project-manifest';
import { Template } from '../../../domain/models/template';
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
    private touchPanStart = { x: 0, y: 0 };
    private touchPanOrigin = { x: 0, y: 0 };
    private pinchStartDistance = 0;
    private pinchStartZoom = 1;
    private pinchStartPan = { x: 0, y: 0 };
    private _wheelHandler?: (e: WheelEvent) => void;

    templateOpacity = 0.5;
    showTemplate = true;

    private get activeTemplate(): Template | undefined {
        if (!this.manifest) return undefined;
        return this.manifest.templates.find(t => t.id === this.manifest!.activeTemplateId) ?? this.manifest.templates[0];
    }

    get canvasWidth(): number { return this.activeTemplate?.canvasWidth ?? EXPORT_WIDTH; }
    get canvasHeight(): number { return this.activeTemplate?.canvasHeight ?? EXPORT_HEIGHT; }
    get activeTemplatePreviewUrl(): string | undefined { return this.activeTemplate?.previewUrl; }

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
            const prevTpl = prev?.templates.find(t => t.id === prev.activeTemplateId) ?? prev?.templates[0];
            const currTpl = curr?.templates.find(t => t.id === curr.activeTemplateId) ?? curr?.templates[0];
            if (this.isReady && (prevTpl?.canvasWidth !== currTpl?.canvasWidth || prevTpl?.canvasHeight !== currTpl?.canvasHeight)) {
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

    onTouchStart(event: TouchEvent): void {
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            this.touchPanStart = { x: touch.clientX, y: touch.clientY };
            this.touchPanOrigin = { ...this.pan };
            this.isPanning = true;
            return;
        }

        if (event.touches.length === 2) {
            const [a, b] = [event.touches[0], event.touches[1]];
            this.pinchStartDistance = this.touchDistance(a, b);
            this.pinchStartZoom = this.zoom;
            this.pinchStartPan = { ...this.pan };
            this.isPanning = false;
        }
    }

    onTouchMove(event: TouchEvent): void {
        if (event.touches.length === 1 && this.isPanning) {
            event.preventDefault();
            const touch = event.touches[0];
            const dx = touch.clientX - this.touchPanStart.x;
            const dy = touch.clientY - this.touchPanStart.y;
            this.pan = { x: this.touchPanOrigin.x + dx, y: this.touchPanOrigin.y + dy };
            return;
        }

        if (event.touches.length === 2) {
            event.preventDefault();
            const [a, b] = [event.touches[0], event.touches[1]];
            const distance = this.touchDistance(a, b);
            if (!this.pinchStartDistance) return;

            const ratio = distance / this.pinchStartDistance;
            const newZoom = Math.min(4, Math.max(0.05, this.pinchStartZoom * ratio));
            const rect = this.viewportRef.nativeElement.getBoundingClientRect();
            const centerX = (a.clientX + b.clientX) / 2 - rect.left;
            const centerY = (a.clientY + b.clientY) / 2 - rect.top;

            const imgX = (centerX - this.pinchStartPan.x) / this.pinchStartZoom;
            const imgY = (centerY - this.pinchStartPan.y) / this.pinchStartZoom;

            this.zoom = newZoom;
            this.pan = {
                x: centerX - imgX * newZoom,
                y: centerY - imgY * newZoom
            };
        }
    }

    onTouchEnd(): void {
        this.isPanning = false;
        this.pinchStartDistance = 0;
    }

    onWheel(event: WheelEvent): void {
        event.preventDefault();
        const rect = this.viewportRef.nativeElement.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        this._applyZoom(delta, mouseX, mouseY);
    }

    private touchDistance(a: Touch, b: Touch): number {
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        return Math.hypot(dx, dy);
    }

    private async draw(): Promise<void> {
        if (!this.isReady || !this.manifest) return;
        const template = this.activeTemplate;
        if (!template) return;

        const canvas = this.canvasRef.nativeElement;
        canvas.width = template.canvasWidth || EXPORT_WIDTH;
        canvas.height = template.canvasHeight || EXPORT_HEIGHT;
        const context = canvas.getContext('2d');
        if (!context) return;

        context.clearRect(0, 0, canvas.width, canvas.height);

        for (const layer of template.layers) {
            if (template.hidden?.[layer.id]) continue;
            const selectedId = template.selected[layer.id];
            const asset = (template.assets[layer.id] ?? []).find(item => item.id === selectedId);
            if (!asset?.previewUrl) continue;
            const image = await this.loader.load(asset.previewUrl);
            const scaleX = asset.transform.scaleX ?? asset.transform.scale ?? 1;
            const scaleY = asset.transform.scaleY ?? asset.transform.scale ?? 1;
            context.save();
            context.translate(asset.transform.x, asset.transform.y);
            context.rotate((asset.transform.rotation * Math.PI) / 180);
            context.scale(scaleX, scaleY);
            context.globalAlpha = asset.transform.opacity ?? 1;
            context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
            context.restore();
        }
    }
}
