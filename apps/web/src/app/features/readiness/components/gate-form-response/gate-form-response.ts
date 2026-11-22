import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  ElementRef,
  Injector,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  gateFormResponseDetailsSchema,
  gateFormResponseRequestSchema,
  validateGateFormAnswers,
  type GateFormAnswers,
  type GateFormDefinition,
  type GateFormField,
} from '@caselog/schemas';
import type { EvidenceObservation } from '@caselog/schemas/evidence';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { apiErrorCode, apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { IdempotencyIdentity } from '../../../../shared/api/idempotency-identity';
import {
  Button,
  Callout,
  FormControlStyle,
  FormField,
  LoadingSkeleton,
} from '../../../../shared/ui/public-api';
import { GateFormsApi } from '../../data-access/gate-forms-api';

@Component({
  selector: 'app-gate-form-response',
  imports: [
    DatePipe,
    FormsModule,
    TranslocoPipe,
    Button,
    Callout,
    FormControlStyle,
    FormField,
    LoadingSkeleton,
  ],
  templateUrl: './gate-form-response.html',
  styleUrl: './gate-form-response.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GateFormResponse {
  private readonly api = inject(GateFormsApi);
  private readonly queries = inject(QueryClient);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly identity = new IdempotencyIdentity();
  readonly workspace = input.required<string>();
  readonly project = input.required<string>();
  readonly candidate = input.required<string>();
  readonly gateId = input.required<string>();
  readonly definition = input.required<GateFormDefinition>();
  readonly canManage = input(false);
  readonly saved = output<void>();
  readonly values = signal<GateFormAnswers>({});
  readonly reportNames = signal<Record<string, string>>({});
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);
  readonly conflict = signal(false);
  readonly message = signal(false);
  readonly invalid = signal<string[]>([]);
  private expectedId: string | null = null;
  readonly current = injectQuery(() => ({
    queryKey: [
      'gate-form-current',
      this.workspace(),
      this.project(),
      this.candidate(),
      this.gateId(),
    ],
    queryFn: () =>
      this.api.list(this.workspace(), this.project(), this.candidate(), this.gateId(), true),
  }));
  readonly history = injectInfiniteQuery(() => ({
    queryKey: [
      'gate-form-history',
      this.workspace(),
      this.project(),
      this.candidate(),
      this.gateId(),
    ],
    queryFn: ({ pageParam }) =>
      this.api.list(
        this.workspace(),
        this.project(),
        this.candidate(),
        this.gateId(),
        false,
        pageParam ?? undefined,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  }));
  readonly observations = computed(
    () => this.history.data()?.pages.flatMap((page) => page.items) ?? [],
  );
  constructor() {
    effect(() => {
      const item = this.current.data()?.items[0];
      if (!this.dirty()) untracked(() => this.prefill(item));
    });
  }
  details(item: EvidenceObservation) {
    const result = gateFormResponseDetailsSchema.safeParse(item.details);
    return result.success ? result.data : null;
  }
  change(key: string, value: GateFormAnswers[string] | null): void {
    this.dirty.set(true);
    this.message.set(false);
    this.values.update((values) => {
      const next = { ...values };
      if (value === null || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  }
  fileIds(key: string): string[] {
    const value = this.values()[key];
    return Array.isArray(value) ? value : [];
  }
  async upload(fieldKey: string, event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
    const files = Array.from(input.files);
    const totalReports = new Set(
      Object.values(this.values()).flatMap((value) => (Array.isArray(value) ? value : [])),
    ).size;
    if (
      files.length + this.fileIds(fieldKey).length > 10 ||
      files.length + totalReports > 30 ||
      files.some(
        (file) =>
          !file.size || file.size > 104857600 || !/\.(pdf|json|html?|txt)$/i.test(file.name),
      )
    ) {
      this.error.set('readiness.forms.filesInvalid');
      return;
    }
    this.uploading.set(true);
    this.error.set(null);
    this.dirty.set(true);
    try {
      for (const file of files) {
        const response = await this.api.upload(
          this.workspace(),
          this.project(),
          this.candidate(),
          file,
        );
        this.reportNames.update((names) => ({
          ...names,
          [response.attachment.id]: response.attachment.fileName,
        }));
        this.change(fieldKey, [...this.fileIds(fieldKey), response.attachment.id]);
      }
      input.value = '';
    } catch {
      this.error.set('readiness.accessibility.uploadFailed');
    } finally {
      this.uploading.set(false);
    }
  }
  removeFile(key: string, id: string): void {
    this.change(
      key,
      this.fileIds(key).filter((item) => item !== id),
    );
  }
  async submit(): Promise<void> {
    if (
      this.busy() ||
      this.uploading() ||
      this.conflict() ||
      !this.canManage() ||
      this.current.isPending() ||
      this.current.isError()
    )
      return;
    const parsed = gateFormResponseRequestSchema.safeParse({
      values: this.values(),
      expectedObservationId: this.expectedId,
    });
    const invalid = validateGateFormAnswers(this.definition(), this.values());
    this.invalid.set(invalid);
    if (!parsed.success || invalid.length) {
      this.error.set('readiness.forms.invalidResponse');
      afterNextRender(
        () => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        { injector: this.injector },
      );
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await this.api.record(
        this.workspace(),
        this.project(),
        this.candidate(),
        this.gateId(),
        parsed.data,
        this.identity.keyFor(parsed.data),
      );
      this.identity.clear();
      this.queries.setQueryData(
        ['gate-form-current', this.workspace(), this.project(), this.candidate(), this.gateId()],
        {
          candidateId: this.candidate(),
          candidateRevision: response.candidateRevision,
          items: [response.observation],
          issues: [],
          nextCursor: null,
        },
      );
      this.dirty.set(false);
      this.prefill(response.observation);
      await this.history.refetch();
      this.message.set(true);
      this.saved.emit();
    } catch (error) {
      this.conflict.set(apiErrorCode(error) === 'gate_form_changed');
      this.error.set(this.conflict() ? 'readiness.forms.conflict' : apiErrorTranslationKey(error));
    } finally {
      this.busy.set(false);
    }
  }
  async reload(): Promise<void> {
    const refreshed = await this.current.refetch();
    if (refreshed.isError) return;
    // Preserve the user's values while explicitly rebasing a conflicted response.
    this.expectedId = refreshed.data?.items[0]?.id ?? null;
    this.identity.clear();
    this.conflict.set(false);
    this.error.set(null);
  }
  async download(id: string): Promise<void> {
    try {
      const result = await this.api.download(
        this.workspace(),
        this.project(),
        this.candidate(),
        id,
      );
      window.location.assign(result.download.url);
    } catch {
      this.error.set('readiness.accessibility.downloadFailed');
    }
  }
  display(field: GateFormField, values: GateFormAnswers): string {
    const value = values[field.key];
    if (field.type === 'select')
      return field.options.find(({ key }) => key === value)?.label ?? '—';
    return value === undefined
      ? '—'
      : Array.isArray(value)
        ? String(value.length)
        : typeof value === 'boolean'
          ? ''
          : String(value);
  }
  private prefill(item?: EvidenceObservation): void {
    const details = item ? this.details(item) : null;
    this.expectedId = item?.id ?? null;
    const defaults: GateFormAnswers = {};
    for (const field of this.definition().fields)
      if (field.type === 'checkbox') defaults[field.key] = false;
    this.values.set({ ...defaults, ...details?.values });
    this.reportNames.set(
      Object.fromEntries((details?.reports ?? []).map(({ id, fileName }) => [id, fileName])),
    );
  }
}
