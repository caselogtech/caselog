import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  emailVerificationResponseSchema,
  messageResponseSchema,
  sessionResponseSchema,
  type EmailVerificationRequest,
  type EmailVerificationResponse,
  type ForgotPasswordRequest,
  type LoginRequest,
  type MessageResponse,
  type RegisterRequest,
  type ResetPasswordRequest,
  type SessionResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  async login(request: LoginRequest): Promise<SessionResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/login', request, { withCredentials: true }),
    );
    return sessionResponseSchema.parse(response);
  }

  async register(request: RegisterRequest): Promise<SessionResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/register', request, { withCredentials: true }),
    );
    return sessionResponseSchema.parse(response);
  }

  async refresh(): Promise<SessionResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/refresh', null, { withCredentials: true }),
    );
    return sessionResponseSchema.parse(response);
  }

  async resendEmailVerification(): Promise<MessageResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/email/verification', null),
    );
    return messageResponseSchema.parse(response);
  }

  async verifyEmail(request: EmailVerificationRequest): Promise<EmailVerificationResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/email/verify', request),
    );
    return emailVerificationResponseSchema.parse(response);
  }

  async forgotPassword(request: ForgotPasswordRequest): Promise<MessageResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/password/forgot', request),
    );
    return messageResponseSchema.parse(response);
  }

  async resetPassword(request: ResetPasswordRequest): Promise<MessageResponse> {
    const response = await lastValueFrom(
      this.http.post<unknown>('/api/v1/auth/password/reset', request),
    );
    return messageResponseSchema.parse(response);
  }
}
