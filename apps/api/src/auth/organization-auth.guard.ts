import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OrganizationAuthGuard extends AuthGuard('organization-jwt') {}
