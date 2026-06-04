import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Layer } from '../../../domain/models/layer';
import { Template } from '../../../domain/models/template';

@Component({
    selector: 'app-layers-panel',
    templateUrl: './layers-panel.component.html',
    styleUrls: ['./layers-panel.component.scss']
})
export class LayersPanelComponent {
    @Input() template?: Template;

    @Output() reorder = new EventEmitter<Layer[]>();
    @Output() toggleVisibility = new EventEmitter<string>();
    @Output() toggleLock = new EventEmitter<string>();
    @Output() renameLayer = new EventEmitter<{ id: string; name: string }>();
    @Output() removeLayer = new EventEmitter<string>();
    @Output() addLayerAbove = new EventEmitter<string>();
    @Output() addLayerBelow = new EventEmitter<string | null>();

    private draggedLayer: Layer | null = null;
    editingLayerId: string | null = null;
    editingName = '';

    /** Visual order: top of list = topmost layer (rendered last), so we reverse render order */
    get displayLayers(): Layer[] {
        return this.template ? [...this.template.layers].reverse() : [];
    }

    isHidden(layerId: string): boolean {
        return this.template?.hidden?.[layerId] ?? false;
    }

    isLocked(layerId: string): boolean {
        return this.template?.locked?.[layerId] ?? false;
    }

    getSelectedName(layerId: string): string {
        if (!this.template) return '-';
        const selectedId = this.template.selected[layerId];
        const asset = (this.template.assets[layerId] ?? []).find(a => a.id === selectedId);
        return asset?.name ?? 'Sem seleção';
    }

    startEdit(layer: Layer): void {
        this.editingLayerId = layer.id;
        this.editingName = layer.name;
    }

    commitEdit(layerId: string): void {
        const name = this.editingName.trim();
        if (name) this.renameLayer.emit({ id: layerId, name });
        this.editingLayerId = null;
        this.editingName = '';
    }

    cancelEdit(): void {
        this.editingLayerId = null;
        this.editingName = '';
    }

    onDragStart(layer: Layer): void {
        this.draggedLayer = layer;
    }

    onDragOver(event: DragEvent, target: Layer): void {
        event.preventDefault();
        if (!this.draggedLayer || this.draggedLayer.id === target.id) return;
        const display = [...this.displayLayers];
        const fromIdx = display.findIndex(l => l.id === this.draggedLayer!.id);
        const toIdx = display.findIndex(l => l.id === target.id);
        if (fromIdx < 0 || toIdx < 0) return;
        display.splice(fromIdx, 1);
        display.splice(toIdx, 0, this.draggedLayer);
        this.reorder.emit([...display].reverse());
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        this.draggedLayer = null;
    }

    onDragEnd(): void {
        this.draggedLayer = null;
    }

    onToggleVisibility(layerId: string): void {
        this.toggleVisibility.emit(layerId);
    }

    onToggleLock(layerId: string): void {
        this.toggleLock.emit(layerId);
    }

    onAddLayerAbove(layerId: string): void {
        this.addLayerAbove.emit(layerId);
    }

    onAddLayerBelow(layerId: string): void {
        this.addLayerBelow.emit(layerId);
    }

    onAddLayerAtEnd(): void {
        this.addLayerBelow.emit(null);
    }

    onRemoveLayer(layerId: string): void {
        this.removeLayer.emit(layerId);
    }
}
