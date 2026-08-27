import { invitationTokenSchema } from '@caselog/schemas';

const INVITATION_PATH_PREFIX = '/auth/invite/';

export function safeInvitationReturnUrl(value: string | null): string | null {
  if (!value?.startsWith(INVITATION_PATH_PREFIX)) return null;

  const token = value.slice(INVITATION_PATH_PREFIX.length);
  return invitationTokenSchema.safeParse(token).success
    ? `${INVITATION_PATH_PREFIX}${token}`
    : null;
}
