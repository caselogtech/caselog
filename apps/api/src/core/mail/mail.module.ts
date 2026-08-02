import { Global, Module } from '@nestjs/common';
import { MAIL_CONFIG, createMailConfig } from './mail.config';
import { MailService } from './mail.service';

@Global()
@Module({
  providers: [{ provide: MAIL_CONFIG, useFactory: createMailConfig }, MailService],
  exports: [MailService],
})
export class MailModule {}
