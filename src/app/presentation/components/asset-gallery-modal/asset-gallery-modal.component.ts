import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AssetItem } from '../../../domain/models/asset-item';

@Component({
    selector: 'app-asset-gallery-modal',
    templateUrl: './asset-gallery-modal.component.html',
    styleUrls: ['./asset-gallery-modal.component.scss']
})
export class AssetGalleryModalComponent {
    @Input() open = false;
    @Input() title = '';
    @Input() items: AssetItem[] = [];
    @Input() selectedId?: string;
    @Input() allowAdd = true;
    @Output() close = new EventEmitter<void>();
    @Output() select = new EventEmitter<string>();
    @Output() remove = new EventEmitter<string>();
    @Output() add = new EventEmitter<File>();
    @Output() editAsset = new EventEmitter<string>();

    confirmDelete(id: string): void {
        if (!window.confirm('Deseja realmente excluir este elemento? Esta ação não pode ser desfeita.')) return;
        this.remove.emit(id);
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) {
            return;
        }
        this.add.emit(input.files[0]);
        input.value = '';
    }
}
