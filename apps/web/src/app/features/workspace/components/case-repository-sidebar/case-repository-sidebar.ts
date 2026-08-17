import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { WorkspaceApi } from '../../data-access/workspace-api';

@Component({
  selector: 'app-case-repository-sidebar',
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './case-repository-sidebar.html',
  styleUrl: './case-repository-sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseRepositorySidebar {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);

  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input.required<string>();
  readonly projectName = input('');
  readonly projectKey = input('');
  readonly selectedSectionId = input('');
  readonly sectionSelected = output<string>();

  readonly sectionEditor = signal<{ suiteId: string; parentId?: string } | null>(null);
  readonly renameTarget = signal<{ type: 'suite' | 'section'; id: string } | null>(null);
  readonly moveTarget = signal<{ id: string } | null>(null);
  readonly deleteTarget = signal<{ type: 'suite' | 'section'; id: string } | null>(null);
  readonly canManage = computed(() => this.workspaceSession.role() !== 'read_only');

  readonly suiteForm = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });
  readonly sectionForm = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });
  readonly renameForm = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });
  readonly moveForm = this.formBuilder.group({
    suiteId: ['', Validators.required],
    parentId: [''],
    position: [0, [Validators.required, Validators.min(0)]],
  });
  private readonly moveSuiteId = toSignal(this.moveForm.controls.suiteId.valueChanges, {
    initialValue: this.moveForm.controls.suiteId.value,
  });

  readonly structure = injectQuery(() => ({
    queryKey: ['project-structure', this.workspaceSlug(), this.projectSlug()],
    queryFn: () => this.workspaceApi.projectStructure(this.workspaceSlug(), this.projectSlug()),
  }));
  readonly moveParentOptions = computed(
    () =>
      this.structure
        .data()
        ?.suites.find((suite) => suite.id === this.moveSuiteId())
        ?.sections.filter((section) => section.id !== this.moveTarget()?.id) ?? [],
  );

  readonly createSuite = injectMutation(() => ({
    mutationFn: (name: string) =>
      this.workspaceApi.createSuite(this.workspaceSlug(), this.projectSlug(), name),
    onSuccess: async () => {
      this.suiteForm.reset();
      await this.invalidateStructure();
    },
  }));
  readonly createSection = injectMutation(() => ({
    mutationFn: (input: { suiteId: string; parentId?: string; name: string }) =>
      this.workspaceApi.createSection(
        this.workspaceSlug(),
        this.projectSlug(),
        input.suiteId,
        input.name,
        input.parentId,
      ),
    onSuccess: async () => {
      this.sectionForm.reset();
      this.sectionEditor.set(null);
      await this.invalidateStructure();
    },
  }));
  readonly renameStructureItem = injectMutation(() => ({
    mutationFn: (input: { type: 'suite' | 'section'; id: string; name: string }) =>
      input.type === 'suite'
        ? this.workspaceApi.updateSuite(
            this.workspaceSlug(),
            this.projectSlug(),
            input.id,
            input.name,
          )
        : this.workspaceApi.updateSection(
            this.workspaceSlug(),
            this.projectSlug(),
            input.id,
            input.name,
          ),
    onSuccess: async () => {
      this.renameTarget.set(null);
      await this.invalidateStructure();
    },
  }));
  readonly moveSuiteItem = injectMutation(() => ({
    mutationFn: (input: { id: string; position: number }) =>
      this.workspaceApi.moveSuite(
        this.workspaceSlug(),
        this.projectSlug(),
        input.id,
        input.position,
      ),
    onSuccess: () => this.invalidateStructure(),
  }));
  readonly moveSectionItem = injectMutation(() => ({
    mutationFn: (input: {
      id: string;
      suiteId: string;
      parentId: string | null;
      position: number;
    }) =>
      this.workspaceApi.moveSection(this.workspaceSlug(), this.projectSlug(), input.id, {
        suiteId: input.suiteId,
        parentId: input.parentId,
        position: input.position,
      }),
    onSuccess: async () => {
      this.moveTarget.set(null);
      await this.invalidateStructure();
    },
  }));
  readonly deleteStructureItem = injectMutation(() => ({
    mutationFn: (input: { type: 'suite' | 'section'; id: string }) =>
      input.type === 'suite'
        ? this.workspaceApi.deleteSuite(this.workspaceSlug(), this.projectSlug(), input.id)
        : this.workspaceApi.deleteSection(this.workspaceSlug(), this.projectSlug(), input.id),
    onSuccess: async (_result, input) => {
      this.deleteTarget.set(null);
      if (input.type === 'section' && this.selectedSectionId() === input.id) {
        this.sectionSelected.emit('');
      }
      await this.invalidateStructure();
    },
  }));

  submitSuite(): void {
    if (this.suiteForm.invalid) {
      this.suiteForm.markAllAsTouched();
      return;
    }
    this.createSuite.mutate(this.suiteForm.controls.name.value.trim());
  }

  beginSection(suiteId: string, parentId?: string): void {
    this.sectionForm.reset();
    this.sectionEditor.set({ suiteId, parentId });
  }

  submitSection(): void {
    const target = this.sectionEditor();
    if (!target || this.sectionForm.invalid) {
      this.sectionForm.markAllAsTouched();
      return;
    }
    this.createSection.mutate({ ...target, name: this.sectionForm.controls.name.value.trim() });
  }

  beginRename(type: 'suite' | 'section', id: string, name: string): void {
    this.renameForm.controls.name.setValue(name);
    this.renameTarget.set({ type, id });
  }

  submitRename(): void {
    const target = this.renameTarget();
    if (!target || this.renameForm.invalid) {
      this.renameForm.markAllAsTouched();
      return;
    }
    this.renameStructureItem.mutate({
      ...target,
      name: this.renameForm.controls.name.value.trim(),
    });
  }

  moveSuite(id: string, position: number): void {
    if (position >= 0) this.moveSuiteItem.mutate({ id, position });
  }

  beginMoveSection(id: string, suiteId: string, position: number): void {
    this.moveTarget.set({ id });
    this.moveForm.setValue({ suiteId, parentId: '', position });
  }

  submitMoveSection(): void {
    const target = this.moveTarget();
    if (!target || this.moveForm.invalid) {
      this.moveForm.markAllAsTouched();
      return;
    }
    const value = this.moveForm.getRawValue();
    this.moveSectionItem.mutate({
      id: target.id,
      suiteId: value.suiteId,
      parentId: value.parentId || null,
      position: value.position,
    });
  }

  requestDelete(type: 'suite' | 'section', id: string): void {
    this.deleteTarget.set({ type, id });
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (target) this.deleteStructureItem.mutate(target);
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.createSuite.error() ??
        this.createSection.error() ??
        this.renameStructureItem.error() ??
        this.moveSuiteItem.error() ??
        this.moveSectionItem.error() ??
        this.deleteStructureItem.error() ??
        this.structure.error(),
    );
  }

  private invalidateStructure(): Promise<void> {
    return this.queryClient.invalidateQueries({
      queryKey: ['project-structure', this.workspaceSlug(), this.projectSlug()],
    });
  }
}
