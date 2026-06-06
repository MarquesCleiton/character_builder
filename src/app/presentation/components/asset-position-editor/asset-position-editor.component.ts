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

    transform: AssetTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, scale: 1, rotation: 0, opacity: 1 };

    ngOnChanges(): void {
        if (this.asset) {
            const t = this.asset.transform;
            this.transform = {
                ...t,
                scaleX: t.scaleX ?? t.scale ?? 1,
                scaleY: t.scaleY ?? t.scale ?? 1,
                scale: t.scale ?? ((t.scaleX ?? 1) + (t.scaleY ?? 1)) / 2
            };
        }
    }

    apply(): void {
        this.update.emit({ ...this.transform });
    }
}
