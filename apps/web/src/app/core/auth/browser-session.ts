import { Injectable, signal } from '@angular/core';
import type { AuthUser, SessionResponse } from '@caselog/schemas';

@Injectable({ providedIn: 'root' })
export class BrowserSession {
  readonly accessToken = signal<string | null>(null);
  readonly user = signal<AuthUser | null>(null);

  start(session: SessionResponse): void {
    this.accessToken.set(session.accessToken);
    this.user.set(session.user);
  }

  clear(): void {
    this.accessToken.set(null);
    this.user.set(null);
  }
}
