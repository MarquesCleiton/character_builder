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
    @Output() randomize = new EventEmitter<void>();
    @Output() exportPng = new EventEmitter<void>();
    @Output() help = new EventEmitter<void>();

    readonly version = APP_VERSION;

    constructor(private readonly theme: ThemeService) { }

    get isDark(): boolean {
        return this.theme.current === 'dark';
    }

    toggleTheme(): void {
        this.theme.toggle();
    }
}
