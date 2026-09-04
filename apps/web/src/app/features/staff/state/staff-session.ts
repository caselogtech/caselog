import { Injectable, signal } from '@angular/core';
import type { StaffSessionResponse } from '@caselog/schemas';

@Injectable({ providedIn: 'root' })
export class StaffSession {
  readonly operator = signal<StaffSessionResponse['operator'] | null>(null);

  start(session: StaffSessionResponse): void {
    this.operator.set(session.operator);
  }

  clear(): void {
    this.operator.set(null);
  }
}
