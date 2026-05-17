import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { AssetItem } from '../../../domain/models/asset-item';
import { AssetTransform } from '../../../domain/models/asset-transform';

@Component({
    selector: 'app-asset-position-editor',
    templateUrl: './asset-position-editor.component.html',
    styleUrls: ['./asset-position-editor.component.scss']
})
export class AssetPositionEditorComponent implements OnChanges {
    @Input() asset?: AssetItem;
    @Output() update = new EventEmitter<AssetTransform>();

    transform: AssetTransform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };

    ngOnChanges(): void {
        if (this.asset) {
            this.transform = { ...this.asset.transform };
        }
    }

    apply(): void {
        this.update.emit({ ...this.transform });
    }
}
