import { Inject, Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { MAIL_CONFIG, type MailConfig } from '../../infrastructure/config/mail.config';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;

  constructor(@Inject(MAIL_CONFIG) private readonly config: MailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async sendEmailVerification(to: string, displayName: string, link: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from,
      to,
      subject: 'Verify your Caselog email',
      text: [
        `Hello ${displayName},`,
        '',
        'Verify your email address to finish setting up Caselog:',
        link,
        '',
        'This link expires in 24 hours. If you did not create this account, ignore this email.',
      ].join('\n'),
    });
  }

  async sendPasswordReset(to: string, displayName: string, link: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from,
      to,
      subject: 'Reset your Caselog password',
      text: [
        `Hello ${displayName},`,
        '',
        'Use this link to choose a new Caselog password:',
        link,
        '',
        'This link expires in 30 minutes. If you did not request it, ignore this email.',
      ].join('\n'),
    });
  }
}
