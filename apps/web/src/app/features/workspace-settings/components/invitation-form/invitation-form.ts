import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { CreateWorkspaceInvitationsRequest, WorkspaceMember } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { workspaceRoleTranslationKey } from '../../../../shared/models/workspace-role';
import { Button, FormControlStyle, FormField } from '../../../../shared/ui/public-api';
import { assignableWorkspaceRoles } from '../../domain/member-management';

@Component({
  selector: 'app-invitation-form',
  imports: [Button, FormControlStyle, FormField, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './invitation-form.html',
  styleUrl: './invitation-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvitationForm {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly actorRole = input<WorkspaceMember['role'] | null>(null);
  readonly pending = input(false);
  readonly submitted = output<CreateWorkspaceInvitationsRequest>();
  readonly cancelled = output<void>();
  readonly roleTranslationKey = workspaceRoleTranslationKey;
  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    role: this.formBuilder.control<'admin' | 'lead' | 'tester' | 'contributor' | 'read_only'>(
      'tester',
      Validators.required,
    ),
  });

  roles() {
    return assignableWorkspaceRoles(this.actorRole());
  }

  submit(): void {
    if (this.pending() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (!this.roles().includes(value.role)) return;
    this.submitted.emit({
      invitations: [{ email: value.email.trim().toLowerCase(), role: value.role }],
    });
  }
}
