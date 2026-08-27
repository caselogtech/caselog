import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { BrandMark } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-auth-shell',
  imports: [BrandMark, RouterLink, RouterOutlet, TranslocoPipe],
  templateUrl: './auth-shell.html',
  styleUrl: './auth-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShell {}
