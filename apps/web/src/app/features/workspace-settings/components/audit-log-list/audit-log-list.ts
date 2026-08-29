import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { AuditLog } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { auditActionLabel, auditMetadataEntries } from '../../domain/audit-log-presentation';

const ACTOR_LABEL_KEYS: Record<AuditLog['actor']['type'], string> = {
  user: 'workspaceSettings.audit.actorTypes.user',
  api_token: 'workspaceSettings.audit.actorTypes.api_token',
  system: 'workspaceSettings.audit.actorTypes.system',
};

@Component({
  selector: 'app-audit-log-list',
  imports: [DatePipe, TranslocoPipe],
  templateUrl: './audit-log-list.html',
  styleUrl: './audit-log-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogList {
  readonly items = input.required<AuditLog[]>();
  readonly actionLabel = auditActionLabel;
  readonly metadataEntries = auditMetadataEntries;

  actorLabelKey(type: AuditLog['actor']['type']): string {
    return ACTOR_LABEL_KEYS[type];
  }
}
