import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AssetItem } from '../../../domain/models/asset-item';

@Component({
    selector: 'app-category-browser',
    templateUrl: './category-browser.component.html',
    styleUrls: ['./category-browser.component.scss']
})
export class CategoryBrowserComponent {
    @Input() title = '';
    @Input() items: AssetItem[] = [];
    @Input() selectedId?: string;
    @Input() locked = false;
    @Input() showLayerControls = false;
    @Input() canMoveUp = true;
    @Input() canMoveDown = true;

    @Output() select = new EventEmitter<string>();
    @Output() prev = new EventEmitter<void>();
    @Output() next = new EventEmitter<void>();
    @Output() openGallery = new EventEmitter<void>();
    @Output() toggleLock = new EventEmitter<void>();
    @Output() importFile = new EventEmitter<File>();
    @Output() deleteAsset = new EventEmitter<string>();
    @Output() editAsset = new EventEmitter<string>();
    @Output() moveUp = new EventEmitter<void>();
    @Output() moveDown = new EventEmitter<void>();
    @Output() deleteLayer = new EventEmitter<void>();
    @Output() renameLayer = new EventEmitter<string>();

    isEditingTitle = false;
    editingName = '';

    startEdit(): void {
        this.editingName = this.title;
        this.isEditingTitle = true;
    }

    commitEdit(): void {
        const name = this.editingName.trim();
        if (name) this.renameLayer.emit(name);
        this.isEditingTitle = false;
        this.editingName = '';
    }

    cancelEdit(): void {
        this.isEditingTitle = false;
        this.editingName = '';
    }

    onFileChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        this.importFile.emit(file);
        input.value = '';
    }

    get selectedIndex(): number {
        if (!this.items.length) return 0;
        const idx = this.items.findIndex(i => i.id === this.selectedId);
        return idx >= 0 ? idx : 0;
    }

    get visibleItems(): AssetItem[] {
        if (!this.items.length) return [];
        const idx = this.selectedIndex;
        const start = Math.max(0, Math.min(idx - 1, this.items.length - 4));
        return this.items.slice(start, start + 4);
    }

    get emptySlots(): null[] {
        const count = Math.max(0, 4 - this.visibleItems.length);
        return Array(count).fill(null);
    }
}
