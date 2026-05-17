import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'cb.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
    private readonly themeSubject = new BehaviorSubject<ThemeMode>(this.readStoredTheme());
    readonly theme$ = this.themeSubject.asObservable();

    get current(): ThemeMode {
        return this.themeSubject.value;
    }

    toggle(): void {
        this.setTheme(this.current === 'light' ? 'dark' : 'light');
    }

    setTheme(theme: ThemeMode): void {
        this.themeSubject.next(theme);
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // Ignore storage errors.
        }
        document.body.dataset['theme'] = theme;
    }

    private readStoredTheme(): ThemeMode {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'light' || stored === 'dark') {
                return stored;
            }
        } catch {
            // Ignore storage errors.
        }
        return 'light';
    }
}
