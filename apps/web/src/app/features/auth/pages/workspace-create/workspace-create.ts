import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  createWorkspaceRequestSchema,
  organizationSlugSchema,
  workspaceSlugCandidateSchema,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { AuthApi } from '../../data-access/auth-api';

const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'yi',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'yu',
  я: 'ya',
};

export function slugifyWorkspaceName(name: string): string {
  const transliterated = [...name.toLowerCase()]
    .map((character) => CYRILLIC_TO_LATIN[character] ?? character)
    .join('');

  return transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
}

function validOrganizationSlug(control: AbstractControl): ValidationErrors | null {
  return organizationSlugSchema.safeParse(control.value).success ? null : { invalidSlug: true };
}

@Component({
  selector: 'app-workspace-create',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './workspace-create.html',
  styleUrl: '../../components/workspace-onboarding.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceCreate {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authApi = inject(AuthApi);
  private readonly queryClient = inject(QueryClient);
  private readonly router = inject(Router);
  private readonly slugManuallyEdited = signal(false);

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    slug: ['', [Validators.required, validOrganizationSlug]],
  });

  private readonly checkedSlug = toSignal(
    this.form.controls.slug.valueChanges.pipe(
      startWith(this.form.controls.slug.value),
      debounceTime(350),
      distinctUntilChanged(),
    ),
    { initialValue: this.form.controls.slug.value },
  );

  readonly availability = injectQuery(() => {
    const slug = this.checkedSlug();
    return {
      queryKey: ['workspace-slug-availability', slug],
      queryFn: () => this.authApi.workspaceSlugAvailability(slug),
      enabled: workspaceSlugCandidateSchema.safeParse(slug).success,
      staleTime: 30_000,
    };
  });

  readonly createWorkspace = injectMutation(() => ({
    mutationFn: (request: ReturnType<typeof this.form.getRawValue>) =>
      this.authApi.createWorkspace(createWorkspaceRequestSchema.parse(request)),
    onSuccess: async ({ workspace }) => {
      await this.queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      await this.router.navigate(['/', workspace.slug]);
    },
  }));

  constructor() {
    this.form.controls.name.valueChanges.pipe(takeUntilDestroyed()).subscribe((name) => {
      if (!this.slugManuallyEdited()) {
        this.form.controls.slug.setValue(slugifyWorkspaceName(name));
      }
    });
  }

  markSlugAsEdited(): void {
    this.slugManuallyEdited.set(true);
  }

  submit(): void {
    if (this.form.invalid || this.availability.data()?.available !== true) {
      this.form.markAllAsTouched();
      return;
    }
    this.createWorkspace.mutate(this.form.getRawValue());
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.createWorkspace.error());
  }
}
