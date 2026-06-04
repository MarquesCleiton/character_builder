import { AssetTransform } from './asset-transform';

export interface AssetItem {
    id: string;
    name: string;
    layerId: string;
    filePath: string;
    transform: AssetTransform;
    createdAt: string;
    previewUrl?: string;
}
