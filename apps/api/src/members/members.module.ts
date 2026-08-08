import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MemberService } from './application/services/member.service';
import { InvitationService } from './application/services/invitation.service';
import {
  createInvitationConfig,
  INVITATION_CONFIG,
} from './infrastructure/config/invitation.config';
import { InvitationRepository } from './infrastructure/repositories/invitation.repository';
import { MemberRepository } from './infrastructure/repositories/member.repository';
import { MemberController } from './presentation/controllers/member.controller';
import { InvitationController } from './presentation/controllers/invitation.controller';
import { InvitationManagementController } from './presentation/controllers/invitation-management.controller';

@Module({
  imports: [AuthModule],
  controllers: [InvitationController, InvitationManagementController, MemberController],
  providers: [
    { provide: INVITATION_CONFIG, useFactory: createInvitationConfig },
    InvitationRepository,
    InvitationService,
    MemberRepository,
    MemberService,
  ],
})
export class MembersModule {}
