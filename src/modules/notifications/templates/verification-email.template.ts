import { SendVerificationEmailDto } from '../dto/send-verification-email.dto';
import { RenderedEmailTemplate } from './template.types';
import { escapeHtml } from './template.helpers';

export function renderVerificationEmailTemplate(
  input: SendVerificationEmailDto,
): RenderedEmailTemplate {
  const recipientName = input.recipientName
    ? `Hi ${escapeHtml(input.recipientName)},`
    : 'Hi,';
  const expiresCopy = input.expiresInHours
    ? `This link expires in ${input.expiresInHours} hours.`
    : 'Use the link below to verify your email address.';
  const safeUrl = escapeHtml(input.verificationUrl);

  return {
    subject: 'Verify your email address',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>${recipientName}</p>
        <p>Welcome to the Quiz Service platform.</p>
        <p>${escapeHtml(expiresCopy)}</p>
        <p>
          <a href="${safeUrl}">Verify your email</a>
        </p>
        <p>If you did not request this email, you can ignore it.</p>
      </div>
    `.trim(),
    text: [
      input.recipientName ? `Hi ${input.recipientName},` : 'Hi,',
      'Welcome to the Quiz Service platform.',
      expiresCopy,
      `Verify your email: ${input.verificationUrl}`,
      'If you did not request this email, you can ignore it.',
    ].join('\n\n'),
  };
}
