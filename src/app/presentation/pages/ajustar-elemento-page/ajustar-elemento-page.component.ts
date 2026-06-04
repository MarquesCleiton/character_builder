import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AssetTransform } from '../../../domain/models/asset-transform';
import { AssetImportStateService } from '../../../infrastructure/services/asset-import-state.service';
import { ImageLoaderService } from '../../../infrastructure/services/image-loader.service';
import { WorkspaceStore } from '../../../infrastructure/state/workspace.store';
import { EXPORT_HEIGHT, EXPORT_WIDTH } from '../../../shared/constants/export.constants';

@Component({
    selector: 'app-ajustar-elemento-page',
    templateUrl: './ajustar-elemento-page.component.html',
    styleUrls: ['./ajustar-elemento-page.component.scss']
})
export class AjustarElementoPageComponent implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild('adjustCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

    layerId = '';
    layerName = '';
    assetName = '';

    elementImage: HTMLImageElement | null = null;
    templateImage: HTMLImageElement | null = null;
    elementUrl = '';

    pos = { x: 0, y: 0 };
    rotation = 0;
    scale = 1;
    opacity = 1;
    templateOpacity = 0.25;
    templateViewZoom = 1;
    templateViewOffset = { x: 0, y: 0 };

    private interaction: 'none' | 'move' | 'rotate' | 'scale' = 'none';
    private dragStart = { x: 0, y: 0 };
    private posSnapshot = { x: 0, y: 0 };
    private rotSnapshot = 0;
    private scaleSnapshot = 1;

    canvasCursor = 'default';
    isSaving = false;

    cropMode = false;
    cropRect: { x: number; y: number; w: number; h: number } | null = null;
    cropType: 'rect' | 'oval' | 'freehand' = 'rect';
    cropViewZoom = 1;
    freehandPath: { x: number; y: number }[] = [];
    private cropDragging = false;
    private cropDragStart = { x: 0, y: 0 };
    private cropDragHandle: 'none' | 'new' | 'move' | 'tl' | 'tr' | 'bl' | 'br' = 'none';
    private cropRectSnapshot: { x: number; y: number; w: number; h: number } | null = null;
    cropPanMode = false;
    cropPanOffset = { x: 0, y: 0 };
    private cropPanStart: { mx: number; my: number; ox: number; oy: number } | null = null;
    private midPanStart: { mx: number; my: number; ox: number; oy: number } | null = null;
    private touchPinchStartDistance = 0;
    private touchPinchStartZoom = 1;
    private touchPinchStartTemplateOffset = { x: 0, y: 0 };
    private touchPinchStartCropOffset = { x: 0, y: 0 };
    private touchPinchImagePoint = { x: 0, y: 0 };

    constructor(
        @Inject(WorkspaceStore) private readonly store: WorkspaceStore,
        private readonly router: Router,
        private readonly loader: ImageLoaderService,
        private readonly importState: AssetImportStateService
    ) { }

    private get canvasW(): number { return this.store.activeTemplate?.canvasWidth ?? EXPORT_WIDTH; }
    private get canvasH(): number { return this.store.activeTemplate?.canvasHeight ?? EXPORT_HEIGHT; }

    ngOnInit(): void {
        if (!this.importState.pendingBlob) {
            this.router.navigate(['/editor']);
            return;
        }
        this.layerId = this.importState.pendingLayerId ?? '';
        const tpl = this.store.activeTemplate;
        this.layerName = tpl?.layers.find(l => l.id === this.layerId)?.name ?? this.layerId;
        this.assetName = this.importState.pendingName;
        this.elementUrl = URL.createObjectURL(this.importState.pendingBlob);

        const editingId = this.importState.editingId;
        if (editingId) {
            const existing = (tpl?.assets[this.layerId] ?? []).find(a => a.id === editingId);
            if (existing?.transform) {
                const t = existing.transform;
                this.pos = { x: t.x, y: t.y };
                this.scale = t.scale;
                this.rotation = t.rotation;
            } else {
                this.pos = { x: this.canvasW / 2, y: this.canvasH / 2 };
            }
        } else {
            this.pos = { x: this.canvasW / 2, y: this.canvasH / 2 };
        }
    }

    private wheelHandler = (e: WheelEvent) => this.onCanvasWheel(e);

    async ngAfterViewInit(): Promise<void> {
        if (!this.elementUrl) return;

        this.elementImage = await this.loader.load(this.elementUrl);

        const templateUrl = this.store.activeTemplate?.previewUrl;
        if (templateUrl) {
            try { this.templateImage = await this.loader.load(templateUrl); } catch { /* no template */ }
        }

        this.canvas?.addEventListener('wheel', this.wheelHandler, { passive: false });

        this.draw();
    }

    ngOnDestroy(): void {
        if (this.elementUrl) URL.revokeObjectURL(this.elementUrl);
        this.canvas?.removeEventListener('wheel', this.wheelHandler);
    }

    private get canvas(): HTMLCanvasElement | undefined {
        return this.canvasRef?.nativeElement;
    }

    draw(): void {
        const canvas = this.canvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx || !this.elementImage) return;

        canvas.width = this.canvasW;
        canvas.height = this.canvasH;
        ctx.clearRect(0, 0, this.canvasW, this.canvasH);

        if (this.cropMode) {
            this.drawCropMode(ctx);
            return;
        }

        ctx.save();
        ctx.translate(this.templateViewOffset.x, this.templateViewOffset.y);
        ctx.scale(this.templateViewZoom, this.templateViewZoom);

        if (this.templateImage) {
            ctx.save();
            ctx.globalAlpha = this.templateOpacity;
            ctx.drawImage(this.templateImage, 0, 0, this.canvasW, this.canvasH);
            ctx.restore();
        }

        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.scale(this.scale, this.scale);
        ctx.globalAlpha = this.opacity;
        const hw = this.elementImage.naturalWidth / 2;
        const hh = this.elementImage.naturalHeight / 2;
        ctx.drawImage(this.elementImage, -hw, -hh);
        ctx.restore();

        this.drawHandles(ctx);
        ctx.restore();
    }

    private drawHandles(ctx: CanvasRenderingContext2D): void {
        if (!this.elementImage) return;
        const hw = (this.elementImage.naturalWidth / 2) * this.scale;
        const hh = (this.elementImage.naturalHeight / 2) * this.scale;
        const cx = this.pos.x;
        const cy = this.pos.y;
        const cos = Math.cos((this.rotation * Math.PI) / 180);
        const sin = Math.sin((this.rotation * Math.PI) / 180);
        const rotPoint = (lx: number, ly: number) => ({
            x: cx + lx * cos - ly * sin,
            y: cy + lx * sin + ly * cos
        });
        const corners = [
            rotPoint(-hw, -hh),
            rotPoint(hw, -hh),
            rotPoint(-hw, hh),
            rotPoint(hw, hh)
        ];

        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5 / (this.scale * this.templateViewZoom);
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'var(--cb-accent, #1f6feb)';
        ctx.lineWidth = 2 / this.templateViewZoom;
        ctx.beginPath();
        ctx.arc(corners[0].x, corners[0].y, 8 / this.templateViewZoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        for (const pt of [corners[1], corners[2], corners[3]]) {
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1.5 / this.templateViewZoom;
            ctx.fillRect(pt.x - 5 / this.templateViewZoom, pt.y - 5 / this.templateViewZoom, 10 / this.templateViewZoom, 10 / this.templateViewZoom);
            ctx.strokeRect(pt.x - 5 / this.templateViewZoom, pt.y - 5 / this.templateViewZoom, 10 / this.templateViewZoom, 10 / this.templateViewZoom);
            ctx.restore();
        }
    }

    private canvasToTemplateViewCoords(cx: number, cy: number): { x: number; y: number } {
        return {
            x: (cx - this.templateViewOffset.x) / this.templateViewZoom,
            y: (cy - this.templateViewOffset.y) / this.templateViewZoom
        };
    }

    private getCropFitTransform(): { fitScale: number; ox: number; oy: number } {
        if (!this.elementImage) return { fitScale: 1, ox: 0, oy: 0 };
        const fitScale = Math.min(
            (this.canvasW * 0.9) / this.elementImage.naturalWidth,
            (this.canvasH * 0.9) / this.elementImage.naturalHeight
        );
        const iw = this.elementImage.naturalWidth * fitScale;
        const ih = this.elementImage.naturalHeight * fitScale;
        return { fitScale, ox: (this.canvasW - iw) / 2, oy: (this.canvasH - ih) / 2 };
    }

    private getCropDisplayTransform(): { fitScale: number; ox: number; oy: number } {
        if (!this.elementImage) return { fitScale: 1, ox: 0, oy: 0 };
        const fitScale = Math.min(
            (this.canvasW * 0.9) / this.elementImage.naturalWidth,
            (this.canvasH * 0.9) / this.elementImage.naturalHeight
        ) * this.cropViewZoom;
        const iw = this.elementImage.naturalWidth * fitScale;
        const ih = this.elementImage.naturalHeight * fitScale;
        return { fitScale, ox: (this.canvasW - iw) / 2 + this.cropPanOffset.x, oy: (this.canvasH - ih) / 2 + this.cropPanOffset.y };
    }

    private canvasToCropImageCoords(cx: number, cy: number): { x: number; y: number } {
        const { fitScale, ox, oy } = this.getCropDisplayTransform();
        return { x: (cx - ox) / fitScale, y: (cy - oy) / fitScale };
    }

    private canvasToCropImageCoordsWithState(cx: number, cy: number, viewZoom: number, panOffset: { x: number; y: number }): { x: number; y: number } {
        if (!this.elementImage) return { x: 0, y: 0 };
        const fitScale = Math.min(
            (this.canvasW * 0.9) / this.elementImage.naturalWidth,
            (this.canvasH * 0.9) / this.elementImage.naturalHeight
        ) * viewZoom;
        const iw = this.elementImage.naturalWidth * fitScale;
        const ih = this.elementImage.naturalHeight * fitScale;
        const ox = (this.canvasW - iw) / 2 + panOffset.x;
        const oy = (this.canvasH - ih) / 2 + panOffset.y;
        return { x: (cx - ox) / fitScale, y: (cy - oy) / fitScale };
    }

    private getCropHandleAt(mx: number, my: number): 'tl' | 'tr' | 'bl' | 'br' | 'move' | 'none' {
        if (!this.cropRect) return 'none';
        const { fitScale, ox, oy } = this.getCropDisplayTransform();
        const rx = ox + this.cropRect.x * fitScale;
        const ry = oy + this.cropRect.y * fitScale;
        const rw = this.cropRect.w * fitScale;
        const rh = this.cropRect.h * fitScale;
        const T = 12;
        if (Math.abs(mx - rx) <= T && Math.abs(my - ry) <= T) return 'tl';
        if (Math.abs(mx - (rx + rw)) <= T && Math.abs(my - ry) <= T) return 'tr';
        if (Math.abs(mx - rx) <= T && Math.abs(my - (ry + rh)) <= T) return 'bl';
        if (Math.abs(mx - (rx + rw)) <= T && Math.abs(my - (ry + rh)) <= T) return 'br';
        if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) return 'move';
        return 'none';
    }

    private drawCropMode(ctx: CanvasRenderingContext2D): void {
        if (!this.elementImage) return;
        const { fitScale, ox, oy } = this.getCropDisplayTransform();
        const iw = this.elementImage.naturalWidth * fitScale;
        const ih = this.elementImage.naturalHeight * fitScale;

        ctx.drawImage(this.elementImage, ox, oy, iw, ih);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, this.canvasW, this.canvasH);

        if (this.cropType === 'freehand') {
            this.drawFreehandSelection(ctx, fitScale, ox, oy, iw, ih);
            return;
        }

        if (!this.cropRect || this.cropRect.w < 2 || this.cropRect.h < 2) return;

        const rx = ox + this.cropRect.x * fitScale;
        const ry = oy + this.cropRect.y * fitScale;
        const rw = this.cropRect.w * fitScale;
        const rh = this.cropRect.h * fitScale;

        // Reveal selected area
        ctx.save();
        ctx.beginPath();
        if (this.cropType === 'oval') {
            ctx.ellipse(rx + rw / 2, ry + rh / 2, Math.abs(rw / 2), Math.abs(rh / 2), 0, 0, Math.PI * 2);
        } else {
            ctx.rect(rx, ry, rw, rh);
        }
        ctx.clip();
        ctx.drawImage(this.elementImage, ox, oy, iw, ih);
        ctx.restore();

        // Selection border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        if (this.cropType === 'oval') {
            ctx.beginPath();
            ctx.ellipse(rx + rw / 2, ry + rh / 2, Math.abs(rw / 2), Math.abs(rh / 2), 0, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1;
            for (let i = 1; i < 3; i++) {
                ctx.beginPath(); ctx.moveTo(rx + rw * i / 3, ry); ctx.lineTo(rx + rw * i / 3, ry + rh); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(rx, ry + rh * i / 3); ctx.lineTo(rx + rw, ry + rh * i / 3); ctx.stroke();
            }
        }

        // Corner handles (draggable)
        const handles = [
            { x: rx, y: ry }, { x: rx + rw, y: ry },
            { x: rx, y: ry + rh }, { x: rx + rw, y: ry + rh }
        ];
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        for (const h of handles) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#1a7abf';
            ctx.fillRect(h.x - 6, h.y - 6, 12, 12);
            ctx.strokeRect(h.x - 6, h.y - 6, 12, 12);
        }
    }

    private drawFreehandSelection(ctx: CanvasRenderingContext2D, fitScale: number, ox: number, oy: number, iw: number, ih: number): void {
        if (this.freehandPath.length < 2) return;
        const pts = this.freehandPath.map(p => ({ x: p.x * fitScale + ox, y: p.y * fitScale + oy }));

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const pt of pts.slice(1)) ctx.lineTo(pt.x, pt.y);
        if (!this.cropDragging) ctx.closePath();
        ctx.clip();
        ctx.drawImage(this.elementImage!, ox, oy, iw, ih);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const pt of pts.slice(1)) ctx.lineTo(pt.x, pt.y);
        if (!this.cropDragging) ctx.closePath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.restore();
    }

    private toCanvasCoords(event: MouseEvent | WheelEvent): { x: number; y: number } | null {
        if (!this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width / rect.width;
        const sy = this.canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * sx,
            y: (event.clientY - rect.top) * sy
        };
    }

    private toCanvasCoordsFromClient(clientX: number, clientY: number): { x: number; y: number } | null {
        if (!this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width / rect.width;
        const sy = this.canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * sx,
            y: (clientY - rect.top) * sy
        };
    }

    private touchDistance(a: Touch, b: Touch): number {
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    private getInteractionAt(mx: number, my: number): 'rotate' | 'scale' | 'move' | 'none' {
        if (!this.elementImage) return 'none';
        const hw = (this.elementImage.naturalWidth / 2) * this.scale;
        const hh = (this.elementImage.naturalHeight / 2) * this.scale;
        const cos = Math.cos((this.rotation * Math.PI) / 180);
        const sin = Math.sin((this.rotation * Math.PI) / 180);
        const rotPt = (lx: number, ly: number) => ({
            x: this.pos.x + lx * cos - ly * sin,
            y: this.pos.y + lx * sin + ly * cos
        });
        const THRESH = 18;
        const nw = rotPt(-hw, -hh);
        if (Math.hypot(mx - nw.x, my - nw.y) <= THRESH) return 'rotate';
        for (const c of [rotPt(hw, -hh), rotPt(-hw, hh), rotPt(hw, hh)]) {
            if (Math.hypot(mx - c.x, my - c.y) <= THRESH) return 'scale';
        }
        const dx = mx - this.pos.x;
        const dy = my - this.pos.y;
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return 'move';
        return 'none';
    }

    onCanvasWheel(event: WheelEvent): void {
        event.preventDefault();
        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
        const pt = this.toCanvasCoords(event);
        if (!pt) return;

        if (this.cropMode) {
            const before = this.canvasToCropImageCoords(pt.x, pt.y);
            const nextZoom = Math.max(1, Math.min(5, this.cropViewZoom * zoomFactor));
            if (nextZoom === this.cropViewZoom || !this.elementImage) return;

            const nextFitScale = Math.min(
                (this.canvasW * 0.9) / this.elementImage.naturalWidth,
                (this.canvasH * 0.9) / this.elementImage.naturalHeight
            ) * nextZoom;
            const baseOx = (this.canvasW - this.elementImage.naturalWidth * nextFitScale) / 2;
            const baseOy = (this.canvasH - this.elementImage.naturalHeight * nextFitScale) / 2;

            this.cropViewZoom = nextZoom;
            this.cropPanOffset.x = pt.x - baseOx - before.x * nextFitScale;
            this.cropPanOffset.y = pt.y - baseOy - before.y * nextFitScale;
            this.draw();
        } else {
            const before = this.canvasToTemplateViewCoords(pt.x, pt.y);
            const nextZoom = Math.max(0.25, Math.min(8, this.templateViewZoom * zoomFactor));
            if (nextZoom === this.templateViewZoom) return;

            this.templateViewZoom = nextZoom;
            this.templateViewOffset.x = pt.x - before.x * nextZoom;
            this.templateViewOffset.y = pt.y - before.y * nextZoom;
            this.draw();
        }
    }

    onCanvasMouseDown(event: MouseEvent): void {
        if (event.button === 1) {
            event.preventDefault();
            if (this.cropMode) {
                const pt = this.toCanvasCoords(event);
                if (!pt) return;
                this.cropPanStart = { mx: pt.x, my: pt.y, ox: this.cropPanOffset.x, oy: this.cropPanOffset.y };
            } else {
                const pt = this.toCanvasCoords(event);
                if (!pt) return;
                this.midPanStart = { mx: pt.x, my: pt.y, ox: this.templateViewOffset.x, oy: this.templateViewOffset.y };
            }
            return;
        }
        if (this.cropMode) {
            const pt = this.toCanvasCoords(event);
            if (!pt || !this.elementImage) return;

            if (this.cropPanMode) {
                this.cropPanStart = { mx: pt.x, my: pt.y, ox: this.cropPanOffset.x, oy: this.cropPanOffset.y };
                return;
            }

            if (this.cropType === 'freehand') {
                this.cropDragging = true;
                this.freehandPath = [this.canvasToCropImageCoords(pt.x, pt.y)];
                return;
            }

            if (this.cropRect) {
                const handle = this.getCropHandleAt(pt.x, pt.y);
                if (handle !== 'none') {
                    this.cropDragHandle = handle;
                    this.cropDragging = true;
                    this.cropDragStart = this.canvasToCropImageCoords(pt.x, pt.y);
                    this.cropRectSnapshot = { ...this.cropRect };
                    return;
                }
            }

            this.cropDragHandle = 'new';
            this.cropDragging = true;
            const imgPt = this.canvasToCropImageCoords(pt.x, pt.y);
            this.cropDragStart = imgPt;
            this.cropRect = { x: imgPt.x, y: imgPt.y, w: 0, h: 0 };
            return;
        }
        if (!this.elementImage || !this.canvas) return;
        const canvasPt = this.toCanvasCoords(event);
        if (!canvasPt) return;
        const pt = this.canvasToTemplateViewCoords(canvasPt.x, canvasPt.y);
        this.dragStart = pt;
        this.posSnapshot = { ...this.pos };
        this.rotSnapshot = this.rotation;
        this.scaleSnapshot = this.scale;
        this.interaction = this.getInteractionAt(pt.x, pt.y);
    }

    onCanvasMouseMove(event: MouseEvent): void {
        if (this.cropMode) {
            const pt = this.toCanvasCoords(event);
            if (!pt) return;

            // Middle-mouse pan (button 1 held)
            if (event.buttons === 4) {
                this.canvasCursor = 'grabbing';
                if (this.cropPanStart) {
                    this.cropPanOffset.x = this.cropPanStart.ox + (pt.x - this.cropPanStart.mx);
                    this.cropPanOffset.y = this.cropPanStart.oy + (pt.y - this.cropPanStart.my);
                    this.draw();
                }
                return;
            }

            if (this.cropPanMode) {
                this.canvasCursor = this.cropPanStart ? 'grabbing' : 'grab';
                if (this.cropPanStart) {
                    this.cropPanOffset.x = this.cropPanStart.ox + (pt.x - this.cropPanStart.mx);
                    this.cropPanOffset.y = this.cropPanStart.oy + (pt.y - this.cropPanStart.my);
                    this.draw();
                }
                return;
            }

            if (this.cropType === 'freehand') {
                this.canvasCursor = 'crosshair';
                if (this.cropDragging) {
                    this.freehandPath.push(this.canvasToCropImageCoords(pt.x, pt.y));
                    this.draw();
                }
                return;
            }

            if (!this.cropDragging) {
                if (this.cropRect) {
                    const cursorMap: Record<string, string> = {
                        tl: 'nwse-resize', br: 'nwse-resize',
                        tr: 'nesw-resize', bl: 'nesw-resize',
                        move: 'move', none: 'crosshair'
                    };
                    this.canvasCursor = cursorMap[this.getCropHandleAt(pt.x, pt.y)];
                } else {
                    this.canvasCursor = 'crosshair';
                }
                return;
            }

            this.canvasCursor = 'crosshair';
            const imgPt = this.canvasToCropImageCoords(pt.x, pt.y);
            const snap = this.cropRectSnapshot;
            const dx = imgPt.x - this.cropDragStart.x;
            const dy = imgPt.y - this.cropDragStart.y;

            if (this.cropDragHandle === 'new') {
                this.cropRect = {
                    x: Math.min(this.cropDragStart.x, imgPt.x),
                    y: Math.min(this.cropDragStart.y, imgPt.y),
                    w: Math.abs(imgPt.x - this.cropDragStart.x),
                    h: Math.abs(imgPt.y - this.cropDragStart.y)
                };
            } else if (snap) {
                switch (this.cropDragHandle) {
                    case 'move': this.cropRect = { x: snap.x + dx, y: snap.y + dy, w: snap.w, h: snap.h }; break;
                    case 'tl': this.cropRect = { x: snap.x + dx, y: snap.y + dy, w: Math.max(2, snap.w - dx), h: Math.max(2, snap.h - dy) }; break;
                    case 'tr': this.cropRect = { x: snap.x, y: snap.y + dy, w: Math.max(2, snap.w + dx), h: Math.max(2, snap.h - dy) }; break;
                    case 'bl': this.cropRect = { x: snap.x + dx, y: snap.y, w: Math.max(2, snap.w - dx), h: Math.max(2, snap.h + dy) }; break;
                    case 'br': this.cropRect = { x: snap.x, y: snap.y, w: Math.max(2, snap.w + dx), h: Math.max(2, snap.h + dy) }; break;
                }
            }
            this.draw();
            return;
        }
        const canvasPt = this.toCanvasCoords(event);
        if (!canvasPt) return;

        // Middle-mouse pan in normal mode
        if (event.buttons === 4 && this.midPanStart) {
            this.canvasCursor = 'grabbing';
            this.templateViewOffset.x = this.midPanStart.ox + (canvasPt.x - this.midPanStart.mx);
            this.templateViewOffset.y = this.midPanStart.oy + (canvasPt.y - this.midPanStart.my);
            this.draw();
            return;
        }

        const pt = this.canvasToTemplateViewCoords(canvasPt.x, canvasPt.y);

        if (this.interaction === 'none') {
            const hit = this.getInteractionAt(pt.x, pt.y);
            this.canvasCursor = hit === 'rotate' ? 'crosshair' : hit === 'scale' ? 'nwse-resize' : hit === 'move' ? 'move' : 'default';
            return;
        }

        const mx = pt.x;
        const my = pt.y;

        if (this.interaction === 'move') {
            this.pos.x = this.posSnapshot.x + (mx - this.dragStart.x);
            this.pos.y = this.posSnapshot.y + (my - this.dragStart.y);
        } else if (this.interaction === 'rotate') {
            const angle = Math.atan2(my - this.pos.y, mx - this.pos.x);
            const startAngle = Math.atan2(this.dragStart.y - this.posSnapshot.y, this.dragStart.x - this.posSnapshot.x);
            this.rotation = this.rotSnapshot + ((angle - startAngle) * 180) / Math.PI;
        } else if (this.interaction === 'scale') {
            const dist = Math.hypot(mx - this.pos.x, my - this.pos.y);
            const startDist = Math.hypot(this.dragStart.x - this.posSnapshot.x, this.dragStart.y - this.posSnapshot.y);
            if (startDist > 0) this.scale = Math.max(0.05, this.scaleSnapshot * (dist / startDist));
        }

        this.draw();
    }

    onCanvasMouseUp(event?: MouseEvent): void {
        if (event?.button === 1) {
            this.cropPanStart = null;
            this.midPanStart = null;
            return;
        }
        if (this.cropMode) {
            this.cropPanStart = null;
            if (this.cropType === 'freehand' && this.cropDragging && this.freehandPath.length > 2) {
                this.cropDragging = false;
                this.draw();
                return;
            }
            this.cropDragging = false;
            this.cropDragHandle = 'none';
            this.cropRectSnapshot = null;
            return;
        }
        this.interaction = 'none';
    }

    onCanvasTouchStart(event: TouchEvent): void {
        if (!this.canvas) return;

        if (event.touches.length === 2) {
            event.preventDefault();
            const a = event.touches[0];
            const b = event.touches[1];
            const pa = this.toCanvasCoordsFromClient(a.clientX, a.clientY);
            const pb = this.toCanvasCoordsFromClient(b.clientX, b.clientY);
            if (!pa || !pb) return;

            const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
            this.touchPinchStartDistance = this.touchDistance(a, b);

            if (this.cropMode) {
                this.touchPinchStartZoom = this.cropViewZoom;
                this.touchPinchStartCropOffset = { ...this.cropPanOffset };
                this.touchPinchImagePoint = this.canvasToCropImageCoordsWithState(
                    mid.x,
                    mid.y,
                    this.touchPinchStartZoom,
                    this.touchPinchStartCropOffset
                );
            } else {
                this.touchPinchStartZoom = this.templateViewZoom;
                this.touchPinchStartTemplateOffset = { ...this.templateViewOffset };
                this.touchPinchImagePoint = {
                    x: (mid.x - this.touchPinchStartTemplateOffset.x) / this.touchPinchStartZoom,
                    y: (mid.y - this.touchPinchStartTemplateOffset.y) / this.touchPinchStartZoom
                };
            }
            return;
        }

        if (event.touches.length !== 1) return;
        event.preventDefault();
        const touch = event.touches[0];
        const pt = this.toCanvasCoordsFromClient(touch.clientX, touch.clientY);
        if (!pt) return;

        if (this.cropMode) {
            if (!this.elementImage) return;

            if (this.cropPanMode) {
                this.cropPanStart = { mx: pt.x, my: pt.y, ox: this.cropPanOffset.x, oy: this.cropPanOffset.y };
                return;
            }

            if (this.cropType === 'freehand') {
                this.cropDragging = true;
                this.freehandPath = [this.canvasToCropImageCoords(pt.x, pt.y)];
                return;
            }

            if (this.cropRect) {
                const handle = this.getCropHandleAt(pt.x, pt.y);
                if (handle !== 'none') {
                    this.cropDragHandle = handle;
                    this.cropDragging = true;
                    this.cropDragStart = this.canvasToCropImageCoords(pt.x, pt.y);
                    this.cropRectSnapshot = { ...this.cropRect };
                    return;
                }
            }

            this.cropDragHandle = 'new';
            this.cropDragging = true;
            const imgPt = this.canvasToCropImageCoords(pt.x, pt.y);
            this.cropDragStart = imgPt;
            this.cropRect = { x: imgPt.x, y: imgPt.y, w: 0, h: 0 };
            return;
        }

        if (!this.elementImage) return;
        const p = this.canvasToTemplateViewCoords(pt.x, pt.y);
        this.dragStart = p;
        this.posSnapshot = { ...this.pos };
        this.rotSnapshot = this.rotation;
        this.scaleSnapshot = this.scale;
        this.interaction = this.getInteractionAt(p.x, p.y);
    }

    onCanvasTouchMove(event: TouchEvent): void {
        if (!this.canvas) return;

        if (event.touches.length === 2 && this.touchPinchStartDistance > 0) {
            event.preventDefault();
            const a = event.touches[0];
            const b = event.touches[1];
            const pa = this.toCanvasCoordsFromClient(a.clientX, a.clientY);
            const pb = this.toCanvasCoordsFromClient(b.clientX, b.clientY);
            if (!pa || !pb) return;

            const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
            const ratio = this.touchDistance(a, b) / this.touchPinchStartDistance;

            if (this.cropMode) {
                const newZoom = Math.max(1, Math.min(5, this.touchPinchStartZoom * ratio));
                this.cropViewZoom = newZoom;

                if (this.elementImage) {
                    const fitScale = Math.min(
                        (this.canvasW * 0.9) / this.elementImage.naturalWidth,
                        (this.canvasH * 0.9) / this.elementImage.naturalHeight
                    ) * newZoom;
                    const baseOx = (this.canvasW - this.elementImage.naturalWidth * fitScale) / 2;
                    const baseOy = (this.canvasH - this.elementImage.naturalHeight * fitScale) / 2;
                    this.cropPanOffset.x = mid.x - baseOx - this.touchPinchImagePoint.x * fitScale;
                    this.cropPanOffset.y = mid.y - baseOy - this.touchPinchImagePoint.y * fitScale;
                }
            } else {
                const newZoom = Math.max(0.25, Math.min(8, this.touchPinchStartZoom * ratio));
                this.templateViewZoom = newZoom;
                this.templateViewOffset.x = mid.x - this.touchPinchImagePoint.x * newZoom;
                this.templateViewOffset.y = mid.y - this.touchPinchImagePoint.y * newZoom;
            }

            this.draw();
            return;
        }

        if (event.touches.length !== 1) return;
        event.preventDefault();
        const touch = event.touches[0];
        const pt = this.toCanvasCoordsFromClient(touch.clientX, touch.clientY);
        if (!pt) return;

        if (this.cropMode) {
            if (this.cropPanMode && this.cropPanStart) {
                this.cropPanOffset.x = this.cropPanStart.ox + (pt.x - this.cropPanStart.mx);
                this.cropPanOffset.y = this.cropPanStart.oy + (pt.y - this.cropPanStart.my);
                this.draw();
                return;
            }

            if (this.cropType === 'freehand') {
                if (this.cropDragging) {
                    this.freehandPath.push(this.canvasToCropImageCoords(pt.x, pt.y));
                    this.draw();
                }
                return;
            }

            if (!this.cropDragging) return;

            const imgPt = this.canvasToCropImageCoords(pt.x, pt.y);
            const snap = this.cropRectSnapshot;
            const dx = imgPt.x - this.cropDragStart.x;
            const dy = imgPt.y - this.cropDragStart.y;

            if (this.cropDragHandle === 'new') {
                this.cropRect = {
                    x: Math.min(this.cropDragStart.x, imgPt.x),
                    y: Math.min(this.cropDragStart.y, imgPt.y),
                    w: Math.abs(imgPt.x - this.cropDragStart.x),
                    h: Math.abs(imgPt.y - this.cropDragStart.y)
                };
            } else if (snap) {
                switch (this.cropDragHandle) {
                    case 'move': this.cropRect = { x: snap.x + dx, y: snap.y + dy, w: snap.w, h: snap.h }; break;
                    case 'tl': this.cropRect = { x: snap.x + dx, y: snap.y + dy, w: Math.max(2, snap.w - dx), h: Math.max(2, snap.h - dy) }; break;
                    case 'tr': this.cropRect = { x: snap.x, y: snap.y + dy, w: Math.max(2, snap.w + dx), h: Math.max(2, snap.h - dy) }; break;
                    case 'bl': this.cropRect = { x: snap.x + dx, y: snap.y, w: Math.max(2, snap.w - dx), h: Math.max(2, snap.h + dy) }; break;
                    case 'br': this.cropRect = { x: snap.x, y: snap.y, w: Math.max(2, snap.w + dx), h: Math.max(2, snap.h + dy) }; break;
                }
            }

            this.draw();
            return;
        }

        if (this.interaction === 'none') return;
        const p = this.canvasToTemplateViewCoords(pt.x, pt.y);

        if (this.interaction === 'move') {
            this.pos.x = this.posSnapshot.x + (p.x - this.dragStart.x);
            this.pos.y = this.posSnapshot.y + (p.y - this.dragStart.y);
        } else if (this.interaction === 'rotate') {
            const angle = Math.atan2(p.y - this.pos.y, p.x - this.pos.x);
            const startAngle = Math.atan2(this.dragStart.y - this.posSnapshot.y, this.dragStart.x - this.posSnapshot.x);
            this.rotation = this.rotSnapshot + ((angle - startAngle) * 180) / Math.PI;
        } else if (this.interaction === 'scale') {
            const dist = Math.hypot(p.x - this.pos.x, p.y - this.pos.y);
            const startDist = Math.hypot(this.dragStart.x - this.posSnapshot.x, this.dragStart.y - this.posSnapshot.y);
            if (startDist > 0) this.scale = Math.max(0.05, this.scaleSnapshot * (dist / startDist));
        }

        this.draw();
    }

    onCanvasTouchEnd(_event: TouchEvent): void {
        this.touchPinchStartDistance = 0;
        this.cropPanStart = null;

        if (this.cropMode) {
            if (this.cropType === 'freehand' && this.cropDragging && this.freehandPath.length > 2) {
                this.cropDragging = false;
                this.draw();
                return;
            }
            this.cropDragging = false;
            this.cropDragHandle = 'none';
            this.cropRectSnapshot = null;
            return;
        }

        this.interaction = 'none';
    }

    center(): void {
        this.pos = { x: this.canvasW / 2, y: this.canvasH / 2 };
        this.draw();
    }

    resetTransform(): void {
        this.pos = { x: this.canvasW / 2, y: this.canvasH / 2 };
        this.rotation = 0;
        this.scale = 1;
        this.opacity = 1;
        this.templateViewZoom = 1;
        this.templateViewOffset = { x: 0, y: 0 };
        this.draw();
    }

    enterCropMode(): void {
        this.cropMode = true;
        this.cropRect = null;
        this.freehandPath = [];
        this.cropViewZoom = 1;
        this.cropType = 'rect';
        this.cropPanMode = false;
        this.cropPanOffset = { x: 0, y: 0 };
        this.cropPanStart = null;
        this.draw();
    }

    cancelCrop(): void {
        this.cropMode = false;
        this.cropRect = null;
        this.freehandPath = [];
        this.draw();
    }

    resetCropSelection(): void {
        this.cropRect = null;
        this.freehandPath = [];
        this.draw();
    }

    setCropViewZoom(value: number): void {
        this.cropViewZoom = Math.max(1, Math.min(5, value));
        this.draw();
    }

    applyCrop(): void {
        if (!this.elementImage) return;

        if (this.cropType === 'freehand') {
            if (this.freehandPath.length < 3) return;
            this.applyFreehandCrop();
            return;
        }

        if (!this.cropRect || this.cropRect.w < 2 || this.cropRect.h < 2) return;
        const { x, y, w, h } = this.cropRect;
        const cw = Math.round(Math.abs(w));
        const ch = Math.round(Math.abs(h));

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cw;
        cropCanvas.height = ch;
        const ctx = cropCanvas.getContext('2d')!;

        if (this.cropType === 'oval') {
            ctx.beginPath();
            ctx.ellipse(cw / 2, ch / 2, cw / 2, ch / 2, 0, 0, Math.PI * 2);
            ctx.clip();
        }

        ctx.drawImage(this.elementImage, -Math.round(x), -Math.round(y));
        this.commitCropCanvas(cropCanvas);
    }

    private applyFreehandCrop(): void {
        if (!this.elementImage || this.freehandPath.length < 3) return;
        const xs = this.freehandPath.map(p => p.x);
        const ys = this.freehandPath.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        const cw = Math.ceil(maxX - minX);
        const ch = Math.ceil(maxY - minY);
        if (cw < 2 || ch < 2) return;

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cw;
        cropCanvas.height = ch;
        const ctx = cropCanvas.getContext('2d')!;
        ctx.beginPath();
        ctx.moveTo(this.freehandPath[0].x - minX, this.freehandPath[0].y - minY);
        for (const pt of this.freehandPath.slice(1)) ctx.lineTo(pt.x - minX, pt.y - minY);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(this.elementImage, -Math.round(minX), -Math.round(minY));
        this.commitCropCanvas(cropCanvas);
    }

    private commitCropCanvas(cropCanvas: HTMLCanvasElement): void {
        const dataUrl = cropCanvas.toDataURL('image/png');
        const byteString = atob(dataUrl.split(',')[1]);
        const ab = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) ab[i] = byteString.charCodeAt(i);
        this.importState.pendingBlob = new Blob([ab], { type: 'image/png' });
        if (this.elementUrl) URL.revokeObjectURL(this.elementUrl);
        this.elementUrl = URL.createObjectURL(this.importState.pendingBlob);
        const newImg = new Image();
        newImg.onload = () => {
            this.elementImage = newImg;
            this.cropMode = false;
            this.cropRect = null;
            this.freehandPath = [];
            this.draw();
        };
        newImg.src = dataUrl;
    }

    setOpacity(event: Event): void {
        const v = parseFloat((event.target as HTMLInputElement).value);
        if (!isNaN(v)) { this.opacity = Math.max(0, Math.min(1, v / 100)); this.draw(); }
    }

    setScale(event: Event): void {
        const v = parseFloat((event.target as HTMLInputElement).value);
        if (!isNaN(v) && v > 0) { this.scale = Math.max(0.05, Math.min(4, v / 100)); this.draw(); }
    }

    setRotation(event: Event): void {
        const v = parseFloat((event.target as HTMLInputElement).value);
        if (!isNaN(v)) { this.rotation = v; this.draw(); }
    }

    async save(): Promise<void> {
        if (!this.importState.pendingBlob || !this.assetName.trim() || this.isSaving) return;
        this.isSaving = true;

        const transform: AssetTransform = {
            x: this.pos.x,
            y: this.pos.y,
            scale: this.scale,
            rotation: this.rotation,
            opacity: 1
        };

        const editingId = this.importState.editingId;
        if (editingId) {
            await this.store.updateAssetFromBlob(
                this.layerId,
                editingId,
                this.assetName.trim(),
                this.importState.pendingBlob,
                transform
            );
        } else {
            await this.store.addAssetFromBlob(
                this.layerId,
                this.assetName.trim(),
                this.importState.pendingBlob,
                transform
            );
        }

        this.importState.clear();
        this.isSaving = false;
        this.router.navigate(['/editor']);
    }

    goBack(): void {
        this.importState.clear();
        this.router.navigate(['/editor']);
    }
}
