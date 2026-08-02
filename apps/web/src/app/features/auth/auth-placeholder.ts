import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-placeholder',
  imports: [RouterLink],
  template: `
    <main class="placeholder">
      <h1>Account ready</h1>
      <p>Workspace onboarding is the next implementation slice.</p>
      <a href="/auth/login" routerLink="/auth/login">Back to sign in</a>
    </main>
  `,
  styles: `
    .placeholder { margin: 64px auto; max-width: 560px; padding: 24px; }
    p { color: var(--text-2); }
    a { color: var(--accent); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPlaceholder {}
