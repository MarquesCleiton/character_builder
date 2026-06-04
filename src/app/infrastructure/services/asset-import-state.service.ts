import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AssetImportStateService {
    pendingBlob: Blob | null = null;
    pendingLayerId: string | null = null;
    pendingName = '';
    editingId: string | null = null;

    clear(): void {
        this.pendingBlob = null;
        this.pendingLayerId = null;
        this.pendingName = '';
        this.editingId = null;
    }
}
