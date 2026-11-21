import { planPolicyEdit } from '../../domain/policies/policy-edit.policy';
import { Inject, Injectable } from '@nestjs/common';
import type { UpdateReadinessPolicyRequest } from '@caselog/schemas/readiness';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  READINESS_POLICY_SELECTION,
  readinessGateData,
  toReadinessPolicyResponse,
} from '../persistence/readiness-policy.persistence';
import type { ReadinessPolicyWriteResult } from './readiness-policy.repository';

@Injectable()
export class ReadinessPolicyEditRepository {
  constructor(@Inject(TenantDatabaseService) private readonly database: TenantDatabaseService) {}
  update(
    organizationId: string,
    projectSlug: string,
    policyId: string,
    actorId: string,
    request: UpdateReadinessPolicyRequest,
  ): Promise<ReadinessPolicyWriteResult> {
    return this.database.run(organizationId, async (transaction) => {
      const projects = await transaction.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM projects WHERE organization_id = ${organizationId}::uuid AND slug = ${projectSlug} AND deleted_at IS NULL FOR SHARE`;
      const projectId = projects[0]?.id;
      if (!projectId) return { kind: 'project_not_found' };
      const policies = await transaction.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM release_policies WHERE organization_id = ${organizationId}::uuid AND project_id = ${projectId}::uuid AND id = ${policyId}::uuid FOR UPDATE`;
      if (!policies[0]) return { kind: 'policy_not_found' };
      const policy = await transaction.releasePolicy.findFirstOrThrow({
        where: { organizationId, projectId, id: policyId },
        select: READINESS_POLICY_SELECTION,
      });
      const current = toReadinessPolicyResponse(policy);
      const draft = current.policy.versions.find((item) => item.state === 'draft');
      const plan = planPolicyEdit(current.policy, request);
      if (plan === 'stale') return { kind: 'draft_changed' };
      if (plan === 'unchanged') return { kind: 'found', value: current };
      const versionId =
        draft?.id ??
        (
          await transaction.releasePolicyVersion.create({
            data: {
              organizationId,
              projectId,
              policyId,
              version: Math.max(...current.policy.versions.map((item) => item.version)) + 1,
              createdById: actorId,
            },
            select: { id: true },
          })
        ).id;
      if (draft)
        await transaction.readinessGate.deleteMany({
          where: { organizationId, projectId, policyVersionId: draft.id },
        });
      await transaction.readinessGate.createMany({
        data: request.gates.map((gate, position) =>
          readinessGateData({
            organizationId,
            projectId,
            policyVersionId: versionId,
            gate,
            position,
          }),
        ),
      });
      await transaction.releasePolicy.update({
        where: { organizationId_id: { organizationId, id: policyId }, projectId },
        data: {
          name: request.name,
          description: request.description,
          updatedAt: new Date(Math.max(Date.now(), policy.updatedAt.getTime() + 1)),
        },
      });
      await appendAuditLog(transaction, {
        organizationId,
        actorId,
        actorType: 'user',
        action: 'release_policy.draft_saved',
        targetType: 'release_policy_version',
        targetId: versionId,
        metadata: { projectId, policyId, gateCount: request.gates.length },
      });
      const updated = await transaction.releasePolicy.findFirstOrThrow({
        where: { organizationId, projectId, id: policyId },
        select: READINESS_POLICY_SELECTION,
      });
      return { kind: 'found', value: toReadinessPolicyResponse(updated) };
    });
  }
}
