import { Injectable } from '@angular/core';
import { AssetCategory } from '../../domain/models/asset-category';

@Injectable({ providedIn: 'root' })
export class AssetImportStateService {
    pendingBlob: Blob | null = null;
    pendingCategory: AssetCategory | null = null;
    pendingName = '';
    editingId: string | null = null;

    clear(): void {
        this.pendingBlob = null;
        this.pendingCategory = null;
        this.pendingName = '';
        this.editingId = null;
    }
}
