import { inject, Injectable } from '@angular/core';
import type { OrganizationTokenResponse } from '@caselog/schemas';
import { WorkspaceSession } from '../../../core/auth/workspace-session';
import { AuthApi } from '../../auth/public-api';

@Injectable({ providedIn: 'root' })
export class WorkspaceAccess {
  private readonly authApi = inject(AuthApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private opening: { slug: string; promise: Promise<OrganizationTokenResponse> } | null = null;

  async open(slug: string): Promise<OrganizationTokenResponse> {
    if (this.workspaceSession.isActiveFor(slug)) {
      const current = this.workspaceSession.current();
      if (current) return current;
    }

    if (this.opening?.slug === slug) return this.opening.promise;

    this.workspaceSession.clear();
    const promise = this.authApi.organizationToken(slug).then((session) => {
      this.workspaceSession.start(session);
      return session;
    });
    this.opening = { slug, promise };

    try {
      return await promise;
    } finally {
      if (this.opening?.promise === promise) this.opening = null;
    }
  }
}
