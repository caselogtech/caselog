import {
  createReadinessPolicyVersionRequestSchema,
  type ReadinessPolicy,
  type UpdateReadinessPolicyRequest,
} from '@caselog/schemas/readiness';

export function planPolicyEdit(
  current: ReadinessPolicy,
  request: UpdateReadinessPolicyRequest,
): 'unchanged' | 'stale' | 'save' {
  const draft = current.versions.find((version) => version.state === 'draft');
  const source = draft ?? current.versions.find((version) => version.state === 'published');
  if (!source) return 'stale';
  const existing = createReadinessPolicyVersionRequestSchema.parse({
    gates: source.gates.map(({ id: _id, position: _position, ...gate }) => gate),
  });
  if (
    current.name === request.name &&
    current.description === request.description &&
    JSON.stringify(existing.gates) === JSON.stringify(request.gates)
  )
    return 'unchanged';
  if (
    (draft?.id ?? null) !== request.expectedDraftId ||
    current.updatedAt !== new Date(request.expectedUpdatedAt).toISOString()
  )
    return 'stale';
  return 'save';
}
