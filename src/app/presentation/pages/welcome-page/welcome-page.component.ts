import { Component, Inject } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceStore } from '../../../infrastructure/state/workspace.store';
import { WorkspaceFilesService } from '../../../infrastructure/services/workspace-files.service';
import { NewProjectConfig } from '../../components/project-name-modal/project-name-modal.component';

@Component({
    selector: 'app-welcome-page',
    templateUrl: './welcome-page.component.html',
    styleUrls: ['./welcome-page.component.scss']
})
export class WelcomePageComponent {
    showModal = false;
    projectName = '';
    private pendingHandle: FileSystemDirectoryHandle | null = null;

    constructor(
        @Inject(WorkspaceStore) private readonly store: WorkspaceStore,
        private readonly router: Router,
        @Inject(WorkspaceFilesService) private readonly files: WorkspaceFilesService
    ) { }

    cancelNew(): void {
        this.showModal = false;
        this.pendingHandle = null;
    }

    async openWorkspace(): Promise<void> {
        const selection = await this.files.selectWorkspace();
        if (!selection) {
            return;
        }
        if (selection.manifestFile && selection.project) {
            this.store.loadWorkspace(selection.handle, selection.project);
            this.router.navigate(['/editor']);
            return;
        }
        this.pendingHandle = selection.handle;
        this.showModal = true;
    }

    async confirmNew(config: NewProjectConfig): Promise<void> {
        if (!this.pendingHandle) {
            return;
        }
        const project = await this.files.createWorkspace(this.pendingHandle, config.name);
        this.store.loadWorkspace(this.pendingHandle, project);
        this.showModal = false;
        if (config.template) {
            await this.store.updateTemplate(config.template);
        }
        this.pendingHandle = null;
        this.router.navigate(['/editor']);
    }
}
