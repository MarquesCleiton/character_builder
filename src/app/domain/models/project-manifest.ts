import { AssetCategory } from './asset-category';
import { AssetItem } from './asset-item';

export interface ProjectHistoryEntry {
    date: string;
    snapshot: {
        selected: Partial<Record<AssetCategory, string>>;
        locked: Partial<Record<AssetCategory, boolean>>;
    };
}

export interface ProjectManifest {
    name: string;
    version: string;
    canvasWidth: number;
    canvasHeight: number;
    layers: AssetCategory[];
    templateImage?: string;
    templatePreviewUrl?: string;
    assets: Record<AssetCategory, AssetItem[]>;
    selected: Partial<Record<AssetCategory, string>>;
    locked: Partial<Record<AssetCategory, boolean>>;
    hidden: Partial<Record<AssetCategory, boolean>>;
    history: ProjectHistoryEntry[];
}
