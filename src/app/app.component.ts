import { Component } from '@angular/core';
import { ThemeService } from './infrastructure/services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'character-builder';

  constructor(private readonly theme: ThemeService) {
    this.theme.setTheme(this.theme.current);
  }
}
