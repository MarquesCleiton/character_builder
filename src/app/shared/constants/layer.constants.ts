import { AssetCategory } from '../../domain/models/asset-category';

export const LAYER_ORDER: AssetCategory[] = [
    AssetCategory.Legs,
    AssetCategory.Torso,
    AssetCategory.Mouth,
    AssetCategory.Eyes
];

export const DISPLAY_ORDER: AssetCategory[] = [
    AssetCategory.Eyes,
    AssetCategory.Mouth,
    AssetCategory.Torso,
    AssetCategory.Legs
];

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
    [AssetCategory.Legs]: 'Pernas',
    [AssetCategory.Torso]: 'Torso',
    [AssetCategory.Mouth]: 'Boca',
    [AssetCategory.Eyes]: 'Olhos'
};
