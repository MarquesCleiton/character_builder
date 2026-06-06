import { AfterViewInit, Component, ElementRef, HostListener, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
    scaleX = 1;
    scaleY = 1;
    opacity = 1;
    templateOpacity = 0.25;
    templateViewZoom = 1;
    templateViewOffset = { x: 0, y: 0 };

    private interaction: 'none' | 'move' | 'rotate' | 'scale-uniform' | 'scale-x' | 'scale-y' = 'none';
    private dragStart = { x: 0, y: 0 };
    private dragStartLocal = { x: 0, y: 0 };
    private posSnapshot = { x: 0, y: 0 };
    private rotSnapshot = 0;
    private scaleXSnapshot = 1;
    private scaleYSnapshot = 1;

    canvasCursor = 'default';
    isSaving = false;

    cropMode = false;
    cropTarget: 'element' | 'template' = 'element';
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
    private readonly rotateHandleRadius = 12;
    private readonly cornerHandleSize = 14;
    private readonly edgeHandleSize = 12;
    private readonly interactionThreshold = 26;

    constructor(
        @Inject(WorkspaceStore) private readonly store: WorkspaceStore,
        private readonly router: Router,
        private readonly loader: ImageLoaderService,
        private readonly importState: AssetImportStateService
    ) { }

    private get canvasW(): number { return this.store.activeTemplate?.canvasWidth ?? EXPORT_WIDTH; }
    private get canvasH(): number { return this.store.activeTemplate?.canvasHeight ?? EXPORT_HEIGHT; }
    private get workspacePadding(): number { return Math.max(this.canvasW, this.canvasH); }
    private get renderCanvasW(): number { return this.cropMode ? this.canvasW : this.canvasW + this.workspacePadding * 2; }
    private get renderCanvasH(): number { return this.cropMode ? this.canvasH : this.canvasH + this.workspacePadding * 2; }
    private get logicalOrigin(): { x: number; y: number } {
        return this.cropMode ? { x: 0, y: 0 } : { x: this.workspacePadding, y: this.workspacePadding };
    }
    private get activeCropImage(): HTMLImageElement | null {
        return this.cropTarget === 'template' ? this.templateImage : this.elementImage;
    }

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
                this.scaleX = t.scaleX ?? t.scale ?? 1;
                this.scaleY = t.scaleY ?? t.scale ?? 1;
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
            try {
                this.templateImage = await this.loader.load(templateUrl);
            } catch { /* no template */ }
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

        canvas.width = this.renderCanvasW;
        canvas.height = this.renderCanvasH;
        ctx.clearRect(0, 0, this.renderCanvasW, this.renderCanvasH);

        if (this.cropMode) {
            this.drawCropMode(ctx);
            return;
        }

        ctx.save();
        ctx.translate(this.templateViewOffset.x, this.templateViewOffset.y);
        ctx.scale(this.templateViewZoom, this.templateViewZoom);
        const origin = this.logicalOrigin;

        if (this.templateImage) {
            ctx.save();
            ctx.globalAlpha = this.templateOpacity;
            ctx.drawImage(this.templateImage, origin.x, origin.y, this.canvasW, this.canvasH);
            ctx.restore();
        }

        ctx.save();
        ctx.translate(origin.x + this.pos.x, origin.y + this.pos.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.scale(this.scaleX, this.scaleY);
        ctx.globalAlpha = this.opacity;
        const hw = this.elementImage.naturalWidth / 2;
        const hh = this.elementImage.naturalHeight / 2;
        ctx.drawImage(this.elementImage, -hw, -hh);
        ctx.restore();

        this.drawHandles(ctx, origin);
        ctx.restore();
    }

    private drawHandles(ctx: CanvasRenderingContext2D, origin: { x: number; y: number }): void {
        if (!this.elementImage) return;
        const hw = (this.elementImage.naturalWidth / 2) * this.scaleX;
        const hh = (this.elementImage.naturalHeight / 2) * this.scaleY;
        const cx = origin.x + this.pos.x;
        const cy = origin.y + this.pos.y;
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
        const mids = [
            { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 },
            { x: (corners[2].x + corners[3].x) / 2, y: (corners[2].y + corners[3].y) / 2 },
            { x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 },
            { x: (corners[1].x + corners[3].x) / 2, y: (corners[1].y + corners[3].y) / 2 }
        ];

        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        const minScale = Math.max(0.05, Math.min(this.scaleX, this.scaleY));
        ctx.lineWidth = 1.5 / (minScale * this.templateViewZoom);
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
        ctx.arc(corners[0].x, corners[0].y, this.rotateHandleRadius / this.templateViewZoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        for (const pt of [corners[1], corners[2], corners[3]]) {
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1.5 / this.templateViewZoom;
            const halfCorner = this.cornerHandleSize / 2;
            ctx.fillRect(
                pt.x - halfCorner / this.templateViewZoom,
                pt.y - halfCorner / this.templateViewZoom,
                this.cornerHandleSize / this.templateViewZoom,
                this.cornerHandleSize / this.templateViewZoom
            );
            ctx.strokeRect(
                pt.x - halfCorner / this.templateViewZoom,
                pt.y - halfCorner / this.templateViewZoom,
                this.cornerHandleSize / this.templateViewZoom,
                this.cornerHandleSize / this.templateViewZoom
            );
            ctx.restore();
        }

        for (const pt of mids) {
            ctx.save();
            ctx.fillStyle = '#f8fbff';
            ctx.strokeStyle = '#1a7abf';
            ctx.lineWidth = 1.5 / this.templateViewZoom;
            const halfEdge = this.edgeHandleSize / 2;
            ctx.fillRect(
                pt.x - halfEdge / this.templateViewZoom,
                pt.y - halfEdge / this.templateViewZoom,
                this.edgeHandleSize / this.templateViewZoom,
                this.edgeHandleSize / this.templateViewZoom
            );
            ctx.strokeRect(
                pt.x - halfEdge / this.templateViewZoom,
                pt.y - halfEdge / this.templateViewZoom,
                this.edgeHandleSize / this.templateViewZoom,
                this.edgeHandleSize / this.templateViewZoom
            );
            ctx.restore();
        }
    }

    private canvasToTemplateViewCoords(cx: number, cy: number): { x: number; y: number } {
        const origin = this.logicalOrigin;
        return {
            x: (cx - this.templateViewOffset.x) / this.templateViewZoom - origin.x,
            y: (cy - this.templateViewOffset.y) / this.templateViewZoom - origin.y
        };
    }

    private getCropFitTransform(): { fitScale: number; ox: number; oy: number } {
        const image = this.activeCropImage;
        if (!image) return { fitScale: 1, ox: 0, oy: 0 };
        const fitScale = Math.min(
            (this.canvasW * 0.9) / image.naturalWidth,
            (this.canvasH * 0.9) / image.naturalHeight
        );
        const iw = image.naturalWidth * fitScale;
        const ih = image.naturalHeight * fitScale;
        return { fitScale, ox: (this.canvasW - iw) / 2, oy: (this.canvasH - ih) / 2 };
    }

    private getCropDisplayTransform(): { fitScale: number; ox: number; oy: number } {
        const image = this.activeCropImage;
        if (!image) return { fitScale: 1, ox: 0, oy: 0 };
        const fitScale = Math.min(
            (this.canvasW * 0.9) / image.naturalWidth,
            (this.canvasH * 0.9) / image.naturalHeight
        ) * this.cropViewZoom;
        const iw = image.naturalWidth * fitScale;
        const ih = image.naturalHeight * fitScale;
        return { fitScale, ox: (this.canvasW - iw) / 2 + this.cropPanOffset.x, oy: (this.canvasH - ih) / 2 + this.cropPanOffset.y };
    }

    private canvasToCropImageCoords(cx: number, cy: number): { x: number; y: number } {
        const { fitScale, ox, oy } = this.getCropDisplayTransform();
        return { x: (cx - ox) / fitScale, y: (cy - oy) / fitScale };
    }

    private canvasToCropImageCoordsWithState(cx: number, cy: number, viewZoom: number, panOffset: { x: number; y: number }): { x: number; y: number } {
        const image = this.activeCropImage;
        if (!image) return { x: 0, y: 0 };
        const fitScale = Math.min(
            (this.canvasW * 0.9) / image.naturalWidth,
            (this.canvasH * 0.9) / image.naturalHeight
        ) * viewZoom;
        const iw = image.naturalWidth * fitScale;
        const ih = image.naturalHeight * fitScale;
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
        const image = this.activeCropImage;
        if (!image) return;
        const { fitScale, ox, oy } = this.getCropDisplayTransform();
        const iw = image.naturalWidth * fitScale;
        const ih = image.naturalHeight * fitScale;

        ctx.drawImage(image, ox, oy, iw, ih);
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
        ctx.drawImage(image, ox, oy, iw, ih);
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
        const image = this.activeCropImage;
        if (!image) return;
        if (this.freehandPath.length < 2) return;
        const pts = this.freehandPath.map(p => ({ x: p.x * fitScale + ox, y: p.y * fitScale + oy }));

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const pt of pts.slice(1)) ctx.lineTo(pt.x, pt.y);
        if (!this.cropDragging) ctx.closePath();
        ctx.clip();
        ctx.drawImage(image, ox, oy, iw, ih);
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

    private getInteractionAt(mx: number, my: number): 'rotate' | 'scale-uniform' | 'scale-x' | 'scale-y' | 'move' | 'none' {
        if (!this.elementImage) return 'none';
        const hw = (this.elementImage.naturalWidth / 2) * this.scaleX;
        const hh = (this.elementImage.naturalHeight / 2) * this.scaleY;
        const cos = Math.cos((this.rotation * Math.PI) / 180);
        const sin = Math.sin((this.rotation * Math.PI) / 180);
        const rotPt = (lx: number, ly: number) => ({
            x: this.pos.x + lx * cos - ly * sin,
            y: this.pos.y + lx * sin + ly * cos
        });
        const THRESH = this.interactionThreshold;
        const nw = rotPt(-hw, -hh);
        if (Math.hypot(mx - nw.x, my - nw.y) <= THRESH) return 'rotate';
        for (const c of [rotPt(hw, -hh), rotPt(-hw, hh), rotPt(hw, hh)]) {
            if (Math.hypot(mx - c.x, my - c.y) <= THRESH) return 'scale-uniform';
        }
        const topMid = rotPt(0, -hh);
        const bottomMid = rotPt(0, hh);
        const leftMid = rotPt(-hw, 0);
        const rightMid = rotPt(hw, 0);
        for (const c of [leftMid, rightMid]) {
            if (Math.hypot(mx - c.x, my - c.y) <= THRESH) return 'scale-x';
        }
        for (const c of [topMid, bottomMid]) {
            if (Math.hypot(mx - c.x, my - c.y) <= THRESH) return 'scale-y';
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
            const cropImage = this.activeCropImage;
            const before = this.canvasToCropImageCoords(pt.x, pt.y);
            const nextZoom = Math.max(1, Math.min(5, this.cropViewZoom * zoomFactor));
            if (nextZoom === this.cropViewZoom || !cropImage) return;

            const nextFitScale = Math.min(
                (this.canvasW * 0.9) / cropImage.naturalWidth,
                (this.canvasH * 0.9) / cropImage.naturalHeight
            ) * nextZoom;
            const baseOx = (this.canvasW - cropImage.naturalWidth * nextFitScale) / 2;
            const baseOy = (this.canvasH - cropImage.naturalHeight * nextFitScale) / 2;

            this.cropViewZoom = nextZoom;
            this.cropPanOffset.x = pt.x - baseOx - before.x * nextFitScale;
            this.cropPanOffset.y = pt.y - baseOy - before.y * nextFitScale;
            this.draw();
        } else {
            const before = this.canvasToTemplateViewCoords(pt.x, pt.y);
            const origin = this.logicalOrigin;
            const nextZoom = Math.max(0.25, Math.min(8, this.templateViewZoom * zoomFactor));
            if (nextZoom === this.templateViewZoom) return;

            this.templateViewZoom = nextZoom;
            this.templateViewOffset.x = pt.x - (before.x + origin.x) * nextZoom;
            this.templateViewOffset.y = pt.y - (before.y + origin.y) * nextZoom;
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
            if (!pt || !this.activeCropImage) return;

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
        this.dragStartLocal = this.toLocalCoords(pt.x, pt.y);
        this.posSnapshot = { ...this.pos };
        this.rotSnapshot = this.rotation;
        this.scaleXSnapshot = this.scaleX;
        this.scaleYSnapshot = this.scaleY;
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
            this.canvasCursor =
                hit === 'rotate' ? 'crosshair'
                    : hit === 'scale-uniform' ? 'nwse-resize'
                        : hit === 'scale-x' ? 'ew-resize'
                            : hit === 'scale-y' ? 'ns-resize'
                                : hit === 'move' ? 'move' : 'default';
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
        } else if (this.interaction === 'scale-uniform' || this.interaction === 'scale-x' || this.interaction === 'scale-y') {
            const local = this.toLocalCoords(mx, my);
            if (this.interaction === 'scale-uniform') {
                const startDist = Math.hypot(this.dragStartLocal.x, this.dragStartLocal.y);
                const dist = Math.hypot(local.x, local.y);
                if (startDist > 0) {
                    const k = Math.max(0.05, dist / startDist);
                    this.scaleX = Math.max(0.05, this.scaleXSnapshot * k);
                    this.scaleY = Math.max(0.05, this.scaleYSnapshot * k);
                }
            } else if (this.interaction === 'scale-x') {
                const startAbsX = Math.abs(this.dragStartLocal.x);
                if (startAbsX > 0) {
                    const kx = Math.max(0.05, Math.abs(local.x) / startAbsX);
                    this.scaleX = Math.max(0.05, this.scaleXSnapshot * kx);
                }
            } else {
                const startAbsY = Math.abs(this.dragStartLocal.y);
                if (startAbsY > 0) {
                    const ky = Math.max(0.05, Math.abs(local.y) / startAbsY);
                    this.scaleY = Math.max(0.05, this.scaleYSnapshot * ky);
                }
            }
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
                this.touchPinchImagePoint = this.canvasToTemplateViewCoords(mid.x, mid.y);
            }
            return;
        }

        if (event.touches.length !== 1) return;
        event.preventDefault();
        const touch = event.touches[0];
        const pt = this.toCanvasCoordsFromClient(touch.clientX, touch.clientY);
        if (!pt) return;

        if (this.cropMode) {
            if (!this.activeCropImage) return;

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
        this.dragStartLocal = this.toLocalCoords(p.x, p.y);
        this.posSnapshot = { ...this.pos };
        this.rotSnapshot = this.rotation;
        this.scaleXSnapshot = this.scaleX;
        this.scaleYSnapshot = this.scaleY;
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

                if (this.activeCropImage) {
                    const cropImage = this.activeCropImage;
                    const fitScale = Math.min(
                        (this.canvasW * 0.9) / cropImage.naturalWidth,
                        (this.canvasH * 0.9) / cropImage.naturalHeight
                    ) * newZoom;
                    const baseOx = (this.canvasW - cropImage.naturalWidth * fitScale) / 2;
                    const baseOy = (this.canvasH - cropImage.naturalHeight * fitScale) / 2;
                    this.cropPanOffset.x = mid.x - baseOx - this.touchPinchImagePoint.x * fitScale;
                    this.cropPanOffset.y = mid.y - baseOy - this.touchPinchImagePoint.y * fitScale;
                }
            } else {
                const newZoom = Math.max(0.25, Math.min(8, this.touchPinchStartZoom * ratio));
                const origin = this.logicalOrigin;
                this.templateViewZoom = newZoom;
                this.templateViewOffset.x = mid.x - (this.touchPinchImagePoint.x + origin.x) * newZoom;
                this.templateViewOffset.y = mid.y - (this.touchPinchImagePoint.y + origin.y) * newZoom;
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
        } else if (this.interaction === 'scale-uniform' || this.interaction === 'scale-x' || this.interaction === 'scale-y') {
            const local = this.toLocalCoords(p.x, p.y);
            if (this.interaction === 'scale-uniform') {
                const startDist = Math.hypot(this.dragStartLocal.x, this.dragStartLocal.y);
                const dist = Math.hypot(local.x, local.y);
                if (startDist > 0) {
                    const k = Math.max(0.05, dist / startDist);
                    this.scaleX = Math.max(0.05, this.scaleXSnapshot * k);
                    this.scaleY = Math.max(0.05, this.scaleYSnapshot * k);
                }
            } else if (this.interaction === 'scale-x') {
                const startAbsX = Math.abs(this.dragStartLocal.x);
                if (startAbsX > 0) {
                    const kx = Math.max(0.05, Math.abs(local.x) / startAbsX);
                    this.scaleX = Math.max(0.05, this.scaleXSnapshot * kx);
                }
            } else {
                const startAbsY = Math.abs(this.dragStartLocal.y);
                if (startAbsY > 0) {
                    const ky = Math.max(0.05, Math.abs(local.y) / startAbsY);
                    this.scaleY = Math.max(0.05, this.scaleYSnapshot * ky);
                }
            }
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

    private toLocalCoords(mx: number, my: number): { x: number; y: number } {
        const cos = Math.cos((this.rotation * Math.PI) / 180);
        const sin = Math.sin((this.rotation * Math.PI) / 180);
        const dx = mx - this.pos.x;
        const dy = my - this.pos.y;
        return {
            x: dx * cos + dy * sin,
            y: -dx * sin + dy * cos
        };
    }

    center(): void {
        this.pos = { x: this.canvasW / 2, y: this.canvasH / 2 };
        this.draw();
    }

    resetTransform(): void {
        this.pos = { x: this.canvasW / 2, y: this.canvasH / 2 };
        this.rotation = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.opacity = 1;
        this.templateViewZoom = 1;
        this.templateViewOffset = { x: 0, y: 0 };
        this.draw();
    }

    enterCropMode(target: 'element' | 'template' = 'element'): void {
        this.cropTarget = target;
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
        this.cropTarget = 'element';
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
        const image = this.activeCropImage;
        if (!image) return;

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

        ctx.drawImage(image, -Math.round(x), -Math.round(y));
        this.commitCropCanvas(cropCanvas, this.cropTarget).catch(() => undefined);
    }

    private applyFreehandCrop(): void {
        const image = this.activeCropImage;
        if (!image || this.freehandPath.length < 3) return;
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
        ctx.drawImage(image, -Math.round(minX), -Math.round(minY));
        this.commitCropCanvas(cropCanvas, this.cropTarget).catch(() => undefined);
    }

    private async commitCropCanvas(cropCanvas: HTMLCanvasElement, target: 'element' | 'template'): Promise<void> {
        const dataUrl = cropCanvas.toDataURL('image/png');
        const byteString = atob(dataUrl.split(',')[1]);
        const ab = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) ab[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: 'image/png' });

        if (target === 'element') {
            this.importState.pendingBlob = blob;
            if (this.elementUrl) URL.revokeObjectURL(this.elementUrl);
            this.elementUrl = URL.createObjectURL(this.importState.pendingBlob);
            const newImg = new Image();
            newImg.onload = () => {
                this.elementImage = newImg;
                this.cropMode = false;
                this.cropTarget = 'element';
                this.cropRect = null;
                this.freehandPath = [];
                this.draw();
            };
            newImg.src = dataUrl;
            return;
        }

        const templateId = this.store.activeTemplate?.id;
        if (!templateId) return;
        const file = new File([blob], `template_${templateId}_editado.png`, { type: 'image/png' });
        await this.store.updateTemplateImage(templateId, file);
        const templateUrl = this.store.activeTemplate?.previewUrl;
        if (templateUrl) {
            try {
                this.templateImage = await this.loader.load(templateUrl);
            } catch {
                // ignore
            }
        }
        this.cropMode = false;
        this.cropTarget = 'element';
        this.cropRect = null;
        this.freehandPath = [];
        this.draw();
    }

    setOpacity(event: Event): void {
        const v = parseFloat((event.target as HTMLInputElement).value);
        if (!isNaN(v)) { this.opacity = Math.max(0, Math.min(1, v / 100)); this.draw(); }
    }

    setScale(event: Event): void {
        const v = parseFloat((event.target as HTMLInputElement).value);
        if (!isNaN(v) && v > 0) {
            const s = Math.max(0.05, Math.min(4, v / 100));
            this.scaleX = s;
            this.scaleY = s;
            this.draw();
        }
    }

    setScaleX(event: Event): void {
        const v = parseFloat((event.target as HTMLInputElement).value);
        if (!isNaN(v) && v > 0) { this.scaleX = Math.max(0.05, Math.min(4, v / 100)); this.draw(); }
    }

    setScaleY(event: Event): void {
        const v = parseFloat((event.target as HTMLInputElement).value);
        if (!isNaN(v) && v > 0) { this.scaleY = Math.max(0.05, Math.min(4, v / 100)); this.draw(); }
    }

    setTemplateOpacity(event: Event): void {
        const v = parseFloat((event.target as HTMLInputElement).value);
        if (!isNaN(v)) { this.templateOpacity = Math.max(0, Math.min(1, v / 100)); this.draw(); }
    }

    @HostListener('window:keydown', ['$event'])
    onWindowKeyDown(event: KeyboardEvent): void {
        if (this.cropMode || this.isSaving) return;
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return;
        }
        const step = event.shiftKey ? 10 : (event.repeat ? 3 : 1);
        let moved = false;
        switch (event.key) {
            case 'ArrowUp':
                this.pos.y -= step;
                moved = true;
                break;
            case 'ArrowDown':
                this.pos.y += step;
                moved = true;
                break;
            case 'ArrowLeft':
                this.pos.x -= step;
                moved = true;
                break;
            case 'ArrowRight':
                this.pos.x += step;
                moved = true;
                break;
            default:
                break;
        }
        if (moved) {
            event.preventDefault();
            this.draw();
        }
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
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            scale: (this.scaleX + this.scaleY) / 2,
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
