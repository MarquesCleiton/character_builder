import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AssetCategory } from '../../../domain/models/asset-category';
import { CATEGORY_LABELS } from '../../../shared/constants/layer.constants';
import { ProjectManifest } from '../../../domain/models/project-manifest';

@Component({
    selector: 'app-layers-panel',
    templateUrl: './layers-panel.component.html',
    styleUrls: ['./layers-panel.component.scss']
})
export class LayersPanelComponent {
    @Input() manifest?: ProjectManifest;
    @Output() reorder = new EventEmitter<AssetCategory[]>();
    @Output() toggleVisibility = new EventEmitter<AssetCategory>();

    readonly labels = CATEGORY_LABELS;

    private draggedCategory: AssetCategory | null = null;

    get order(): AssetCategory[] {
        return this.manifest?.layers ?? [];
    }

    /** Visual order: top of list = topmost layer (rendered last) */
    get displayOrder(): AssetCategory[] {
        return [...this.order].reverse();
    }

    isHidden(category: AssetCategory): boolean {
        return this.manifest?.hidden?.[category] ?? false;
    }

    onDragStart(category: AssetCategory): void {
        this.draggedCategory = category;
    }

    onDragOver(event: DragEvent, target: AssetCategory): void {
        event.preventDefault();
        if (!this.draggedCategory || this.draggedCategory === target) return;
        const display = [...this.displayOrder];
        const fromIdx = display.indexOf(this.draggedCategory);
        const toIdx = display.indexOf(target);
        if (fromIdx < 0 || toIdx < 0) return;
        display.splice(fromIdx, 1);
        display.splice(toIdx, 0, this.draggedCategory);
        this.reorder.emit([...display].reverse());
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        this.draggedCategory = null;
    }

    onDragEnd(): void {
        this.draggedCategory = null;
    }

    onToggleVisibility(category: AssetCategory): void {
        this.toggleVisibility.emit(category);
    }

    getSelectedLabel(category: AssetCategory): string {
        if (!this.manifest) return '-';
        const selectedId = this.manifest.selected[category];
        const asset = this.manifest.assets[category].find(item => item.id === selectedId);
        return asset?.name ?? 'Sem selecao';
    }
}
