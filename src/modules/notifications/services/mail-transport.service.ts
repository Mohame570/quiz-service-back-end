import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendMailResult {
  messageId: string;
}

@Injectable()
export class MailTransportService {
  private readonly transporter: Transporter;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('mail.host') ?? 'localhost';
    const port = this.configService.get<number>('mail.port') ?? 1025;
    const username = this.configService.get<string>('mail.username') ?? '';
    const password = this.configService.get<string>('mail.password') ?? '';
    this.fromEmail =
      this.configService.get<string>('mail.fromEmail') ?? 'no-reply@example.com';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(username
        ? { auth: { user: username, pass: password } }
        : {}),
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    const info = await this.transporter.sendMail({
      from: this.fromEmail,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    return {
      messageId: info.messageId ?? 'unknown',
    };
  }
}
