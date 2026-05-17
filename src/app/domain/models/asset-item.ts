import { AssetCategory } from './asset-category';
import { AssetTransform } from './asset-transform';

export interface AssetItem {
    id: string;
    name: string;
    category: AssetCategory;
    filePath: string;
    transform: AssetTransform;
    createdAt: string;
    previewUrl?: string;
}
