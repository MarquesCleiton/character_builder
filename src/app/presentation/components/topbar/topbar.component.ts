import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ThemeService } from '../../../infrastructure/services/theme.service';
import { APP_VERSION } from '../../../shared/constants/ui.constants';

@Component({
    selector: 'app-topbar',
    templateUrl: './topbar.component.html',
    styleUrls: ['./topbar.component.scss']
})
export class TopbarComponent {
    @Input() projectName = 'Novo Projeto';
    @Output() openProject = new EventEmitter<void>();
    @Output() openOrCreateProject = new EventEmitter<void>();
    @Output() openProjectFolder = new EventEmitter<void>();
    @Output() randomize = new EventEmitter<void>();
    @Output() exportPng = new EventEmitter<void>();
    @Output() help = new EventEmitter<void>();
    @Output() renameProject = new EventEmitter<string>();
    @Output() changeTemplate = new EventEmitter<File>();

    readonly version = APP_VERSION;

    settingsOpen = false;
    editingName = '';

    constructor(private readonly theme: ThemeService) { }

    get isDark(): boolean {
        return this.theme.current === 'dark';
    }

    toggleTheme(): void {
        this.theme.toggle();
    }

    toggleSettings(): void {
        this.settingsOpen = !this.settingsOpen;
        if (this.settingsOpen) {
            this.editingName = this.projectName;
        }
    }

    closeSettings(): void {
        this.settingsOpen = false;
    }

    confirmRename(): void {
        const trimmed = this.editingName.trim();
        if (trimmed && trimmed !== this.projectName) {
            this.renameProject.emit(trimmed);
        }
        this.settingsOpen = false;
    }

    onTemplateFile(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files?.[0]) {
            this.changeTemplate.emit(input.files[0]);
            input.value = '';
        }
        this.settingsOpen = false;
    }
}
