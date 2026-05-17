import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';

export interface NewProjectConfig {
    name: string;
    template: File | null;
}

@Component({
    selector: 'app-project-name-modal',
    templateUrl: './project-name-modal.component.html',
    styleUrls: ['./project-name-modal.component.scss']
})
export class ProjectNameModalComponent implements OnChanges {
    @Input() open = false;
    @Input() name = '';
    @Output() cancel = new EventEmitter<void>();
    @Output() confirm = new EventEmitter<NewProjectConfig>();

    localName = '';
    templateFile: File | null = null;

    ngOnChanges(): void {
        this.localName = this.name;
        this.templateFile = null;
    }

    onTemplateChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.templateFile = input.files?.[0] ?? null;
        input.value = '';
    }

    onConfirm(): void {
        const trimmed = this.localName.trim();
        if (!trimmed) {
            return;
        }
        this.confirm.emit({ name: trimmed, template: this.templateFile });
    }
}
