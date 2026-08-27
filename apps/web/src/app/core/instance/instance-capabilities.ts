import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import {
  instanceCapabilitiesSchema,
  type InstanceCapabilities as InstanceCapabilitiesResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class InstanceCapabilities {
  private readonly http = inject(HttpClient);
  private readonly state = signal<InstanceCapabilitiesResponse | null>(null);

  readonly value = this.state.asReadonly();
  readonly loaded = computed(() => this.state() !== null);
  readonly deployment = computed(() => this.state()?.deployment ?? 'self_hosted');
  readonly instanceName = computed(() => this.state()?.instanceName ?? 'Caselog');
  readonly publicRegistrationEnabled = computed(() => this.state()?.registrationMode === 'public');
  readonly workspaceCreationEnabled = computed(
    () => this.state()?.workspaceCreationEnabled === true,
  );
  readonly managedTermsRequired = computed(() => this.state()?.deployment === 'managed');

  async load(): Promise<void> {
    const response = await lastValueFrom(this.http.get<unknown>('/api/v1/instance/capabilities'));
    this.state.set(instanceCapabilitiesSchema.parse(response));
  }
}
