import { computed, inject, Injectable, signal } from '@angular/core';
import { StaffSession } from './staff-session';

@Injectable({ providedIn: 'root' })
export class StaffListHistory {
  private readonly session = inject(StaffSession);
  private readonly entries = signal(new Map<string, string>());
  private readonly operatorKey = computed(
    () => `${this.session.operator()?.userId}:${this.session.operator()?.role}`,
  );

  previous(url: string): string | undefined {
    return this.entries().get(`${this.operatorKey()}:${url}`);
  }

  rememberNext(from: string, to: string): void {
    const key = `${this.operatorKey()}:${to}`;
    this.entries.update((current) => {
      const entries = new Map(current);
      entries.delete(key);
      entries.set(key, from);
      if (entries.size > 100) {
        const oldest = entries.keys().next().value;
        if (oldest) entries.delete(oldest);
      }
      return entries;
    });
  }
}
