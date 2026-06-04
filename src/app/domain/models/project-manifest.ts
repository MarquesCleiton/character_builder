import { Template } from './template';

export interface ProjectHistoryEntry {
    date: string;
    activeTemplateId: string;
    templateSnapshots: Record<string, {
        selected: Record<string, string>;
        locked: Record<string, boolean>;
    }>;
}

export interface ProjectManifest {
    name: string;
    version: string;
    templates: Template[];
    activeTemplateId: string;
    history: ProjectHistoryEntry[];
}
