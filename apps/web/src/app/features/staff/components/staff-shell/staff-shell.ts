import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { BrandMark, Button } from '../../../../shared/ui/public-api';
import { AuthApi } from '../../../auth/public-api';
import { formatStaffDate, staffRoleTranslationKey } from '../../domain/staff-format';
import { StaffSession } from '../../state/staff-session';

@Component({
  selector: 'app-staff-shell',
  imports: [BrandMark, Button, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './staff-shell.html',
  styleUrl: './staff-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffShell {
  private readonly authApi = inject(AuthApi);
  private readonly browserSession = inject(BrowserSession);
  private readonly router = inject(Router);
  private readonly workspaceSession = inject(WorkspaceSession);
  readonly staffSession = inject(StaffSession);
  readonly signingOut = signal(false);
  readonly signOutErrorKey = signal<string | null>(null);
  readonly isOwner = computed(() => this.staffSession.operator()?.role === 'owner');
  readonly canViewDirectories = computed(() => {
    const role = this.staffSession.operator()?.role;
    return role === 'owner' || role === 'admin';
  });
  readonly formatDate = formatStaffDate;
  readonly roleKey = staffRoleTranslationKey;

  async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.signOutErrorKey.set(null);
    try {
      await this.authApi.logout();
      this.staffSession.clear();
      this.workspaceSession.clear();
      this.browserSession.clear();
      await this.router.navigateByUrl('/auth/login');
    } catch (error) {
      this.signOutErrorKey.set(apiErrorTranslationKey(error));
    } finally {
      this.signingOut.set(false);
    }
  }
}
