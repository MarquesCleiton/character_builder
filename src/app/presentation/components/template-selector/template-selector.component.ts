import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Template } from '../../../domain/models/template';

@Component({
    selector: 'app-template-selector',
    templateUrl: './template-selector.component.html',
    styleUrls: ['./template-selector.component.scss']
})
export class TemplateSelectorComponent {
    @Input() templates: Template[] = [];
    @Input() activeTemplateId = '';

    @Output() selectTemplate = new EventEmitter<string>();
    @Output() addTemplate = new EventEmitter<void>();
    @Output() addTemplateWithImage = new EventEmitter<File>();
    @Output() renameTemplate = new EventEmitter<{ id: string; name: string }>();
    @Output() deleteTemplate = new EventEmitter<string>();
    @Output() changeTemplateImage = new EventEmitter<{ id: string; file: File }>();

    isRenamingActive = false;
    editingName = '';

    get selectedIndex(): number {
        if (!this.templates.length) return 0;
        const idx = this.templates.findIndex(t => t.id === this.activeTemplateId);
        return idx >= 0 ? idx : 0;
    }

    get activeTemplate(): Template | undefined {
        return this.templates[this.selectedIndex];
    }

    get visibleTemplates(): Template[] {
        if (!this.templates.length) return [];
        const idx = this.selectedIndex;
        const start = Math.max(0, Math.min(idx - 1, this.templates.length - 4));
        return this.templates.slice(start, start + 4);
    }

    get emptySlots(): null[] {
        return Array(Math.max(0, 4 - this.visibleTemplates.length)).fill(null);
    }

    prev(): void {
        const idx = this.selectedIndex;
        if (idx > 0) this.selectTemplate.emit(this.templates[idx - 1].id);
    }

    next(): void {
        const idx = this.selectedIndex;
        if (idx < this.templates.length - 1) this.selectTemplate.emit(this.templates[idx + 1].id);
    }

    startRename(): void {
        const tpl = this.activeTemplate;
        if (!tpl) return;
        this.editingName = tpl.name;
        this.isRenamingActive = true;
    }

    commitRename(): void {
        const name = this.editingName.trim();
        const tpl = this.activeTemplate;
        if (name && tpl) this.renameTemplate.emit({ id: tpl.id, name });
        this.isRenamingActive = false;
        this.editingName = '';
    }

    cancelRename(): void {
        this.isRenamingActive = false;
        this.editingName = '';
    }

    onNewFileChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (!input.files?.length) return;
        this.addTemplateWithImage.emit(input.files[0]);
        input.value = '';
    }

    onImageChange(templateId: string, event: Event): void {
        const input = event.target as HTMLInputElement;
        if (!input.files?.length) return;
        this.changeTemplateImage.emit({ id: templateId, file: input.files[0] });
        input.value = '';
    }
}
