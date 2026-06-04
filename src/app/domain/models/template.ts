import { AssetItem } from './asset-item';
import { Layer } from './layer';

export interface Template {
    id: string;
    name: string;
    imagePath: string;
    previewUrl?: string;
    canvasWidth: number;
    canvasHeight: number;
    /** Render order: index 0 = bottom layer, last index = topmost layer */
    layers: Layer[];
    assets: Record<string, AssetItem[]>;
    selected: Record<string, string>;
    locked: Record<string, boolean>;
    hidden: Record<string, boolean>;
}
