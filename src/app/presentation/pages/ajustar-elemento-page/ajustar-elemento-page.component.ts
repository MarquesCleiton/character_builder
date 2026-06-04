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

    private interaction: 'none' | 'move' | 'rotate' | 'scale' = 'none';
    private dragStart = { x: 0, y: 0 };
    private posSnapshot = { x: 0, y: 0 };
    private rotSnapshot = 0;
    private scaleSnapshot = 1;

    canvasCursor = 'default';
    isSaving = false;

    cropMode = false;
    cropRect: { x: number; y: number; w: number; h: number } | null = null;
    private cropDragging = false;
    private cropDragStart = { x: 0, y: 0 };

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

    async ngAfterViewInit(): Promise<void> {
        if (!this.elementUrl) return;

        this.elementImage = await this.loader.load(this.elementUrl);

        const templateUrl = this.store.activeTemplate?.previewUrl;
        if (templateUrl) {
            try { this.templateImage = await this.loader.load(templateUrl); } catch { /* no template */ }
        }

        this.draw();
    }

    ngOnDestroy(): void {
        if (this.elementUrl) URL.revokeObjectURL(this.elementUrl);
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
        ctx.lineWidth = 1.5 / this.scale;
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
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(corners[0].x, corners[0].y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        for (const pt of [corners[1], corners[2], corners[3]]) {
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1.5;
            ctx.fillRect(pt.x - 5, pt.y - 5, 10, 10);
            ctx.strokeRect(pt.x - 5, pt.y - 5, 10, 10);
            ctx.restore();
        }
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

    private canvasToCropImageCoords(cx: number, cy: number): { x: number; y: number } {
        const { fitScale, ox, oy } = this.getCropFitTransform();
        return {
            x: Math.max(0, Math.min((cx - ox) / fitScale, this.elementImage!.naturalWidth)),
            y: Math.max(0, Math.min((cy - oy) / fitScale, this.elementImage!.naturalHeight))
        };
    }

    private drawCropMode(ctx: CanvasRenderingContext2D): void {
        if (!this.elementImage) return;
        const { fitScale, ox, oy } = this.getCropFitTransform();
        const iw = this.elementImage.naturalWidth * fitScale;
        const ih = this.elementImage.naturalHeight * fitScale;

        ctx.drawImage(this.elementImage, ox, oy, iw, ih);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, this.canvasW, this.canvasH);

        if (this.cropRect && this.cropRect.w > 1 && this.cropRect.h > 1) {
            const rx = ox + this.cropRect.x * fitScale;
            const ry = oy + this.cropRect.y * fitScale;
            const rw = this.cropRect.w * fitScale;
            const rh = this.cropRect.h * fitScale;

            ctx.save();
            ctx.beginPath();
            ctx.rect(rx, ry, rw, rh);
            ctx.clip();
            ctx.drawImage(this.elementImage, ox, oy, iw, ih);
            ctx.restore();

            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(rx, ry, rw, rh);

            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1;
            for (let i = 1; i < 3; i++) {
                ctx.beginPath(); ctx.moveTo(rx + rw * i / 3, ry); ctx.lineTo(rx + rw * i / 3, ry + rh); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(rx, ry + rh * i / 3); ctx.lineTo(rx + rw, ry + rh * i / 3); ctx.stroke();
            }

            const handles = [
                { x: rx, y: ry }, { x: rx + rw, y: ry },
                { x: rx, y: ry + rh }, { x: rx + rw, y: ry + rh }
            ];
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = 'var(--cb-accent, #1f6feb)';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            for (const h of handles) {
                ctx.fillRect(h.x - 5, h.y - 5, 10, 10);
                ctx.strokeRect(h.x - 5, h.y - 5, 10, 10);
            }
        }
    }

    private toCanvasCoords(event: MouseEvent): { x: number; y: number } | null {
        if (!this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width / rect.width;
        const sy = this.canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * sx,
            y: (event.clientY - rect.top) * sy
        };
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

    onCanvasMouseDown(event: MouseEvent): void {
        if (this.cropMode) {
            const pt = this.toCanvasCoords(event);
            if (!pt || !this.elementImage) return;
            this.cropDragging = true;
            const imgPt = this.canvasToCropImageCoords(pt.x, pt.y);
            this.cropDragStart = imgPt;
            this.cropRect = { x: imgPt.x, y: imgPt.y, w: 0, h: 0 };
            return;
        }
        if (!this.elementImage || !this.canvas) return;
        const pt = this.toCanvasCoords(event);
        if (!pt) return;
        this.dragStart = pt;
        this.posSnapshot = { ...this.pos };
        this.rotSnapshot = this.rotation;
        this.scaleSnapshot = this.scale;
        this.interaction = this.getInteractionAt(pt.x, pt.y);
    }

    onCanvasMouseMove(event: MouseEvent): void {
        if (this.cropMode) {
            this.canvasCursor = 'crosshair';
            if (!this.cropDragging) return;
            const pt = this.toCanvasCoords(event);
            if (!pt) return;
            const imgPt = this.canvasToCropImageCoords(pt.x, pt.y);
            this.cropRect = {
                x: Math.min(this.cropDragStart.x, imgPt.x),
                y: Math.min(this.cropDragStart.y, imgPt.y),
                w: Math.abs(imgPt.x - this.cropDragStart.x),
                h: Math.abs(imgPt.y - this.cropDragStart.y)
            };
            this.draw();
            return;
        }
        const pt = this.toCanvasCoords(event);
        if (!pt) return;

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

    onCanvasMouseUp(): void {
        if (this.cropMode) { this.cropDragging = false; return; }
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
        this.draw();
    }

    enterCropMode(): void {
        this.cropMode = true;
        this.cropRect = null;
        this.draw();
    }

    cancelCrop(): void {
        this.cropMode = false;
        this.cropRect = null;
        this.draw();
    }

    applyCrop(): void {
        if (!this.elementImage || !this.cropRect || this.cropRect.w < 1 || this.cropRect.h < 1) return;
        const { x, y, w, h } = this.cropRect;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = Math.round(w);
        cropCanvas.height = Math.round(h);
        cropCanvas.getContext('2d')!.drawImage(this.elementImage, -Math.round(x), -Math.round(y));
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
