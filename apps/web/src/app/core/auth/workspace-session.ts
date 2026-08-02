import { Injectable, signal } from '@angular/core';
import type { OrganizationTokenResponse } from '@caselog/schemas';

@Injectable({ providedIn: 'root' })
export class WorkspaceSession {
  readonly accessToken = signal<string | null>(null);
  readonly organization = signal<OrganizationTokenResponse['organization'] | null>(null);
  readonly role = signal<OrganizationTokenResponse['role'] | null>(null);
  readonly expiresAt = signal<string | null>(null);

  start(session: OrganizationTokenResponse): void {
    this.accessToken.set(session.accessToken);
    this.organization.set(session.organization);
    this.role.set(session.role);
    this.expiresAt.set(session.expiresAt);
  }

  current(): OrganizationTokenResponse | null {
    const accessToken = this.accessToken();
    const organization = this.organization();
    const role = this.role();
    const expiresAt = this.expiresAt();
    return accessToken && organization && role && expiresAt
      ? { accessToken, organization, role, expiresAt }
      : null;
  }

  isActiveFor(slug: string): boolean {
    const session = this.current();
    return Boolean(
      session &&
        session.organization.slug === slug &&
        Date.parse(session.expiresAt) > Date.now() + 10_000,
    );
  }

  clear(): void {
    this.accessToken.set(null);
    this.organization.set(null);
    this.role.set(null);
    this.expiresAt.set(null);
  }
}
