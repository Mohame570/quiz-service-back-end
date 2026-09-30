import { SendPasswordResetEmailDto } from '../dto/send-password-reset-email.dto';
import { escapeHtml } from './template.helpers';
import { RenderedEmailTemplate } from './template.types';

export function renderPasswordResetEmailTemplate(
  input: SendPasswordResetEmailDto,
): RenderedEmailTemplate {
  const recipientName = input.recipientName
    ? `Hi ${escapeHtml(input.recipientName)},`
    : 'Hi,';
  const safeUrl = escapeHtml(input.resetUrl);
  const expirationText = input.expiresInMinutes
    ? `This password reset link will expire in ${input.expiresInMinutes} minutes.`
    : 'This password reset link will expire in 60 minutes.';

  return {
    subject: 'Reset your PitIQ password',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1e293b;">Password Reset Request</h2>
        <p>${recipientName}</p>
        <p>We received a request to reset your password for your PitIQ account.</p>
        <p>Click the button below to choose a new password:</p>
        <p style="margin: 24px 0;">
          <a href="${safeUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </p>
        <p style="color: #64748b; font-size: 14px;">${escapeHtml(expirationText)}</p>
        <p style="color: #64748b; font-size: 14px;">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">If you're having trouble clicking the button, copy and paste this URL into your web browser:<br /><a href="${safeUrl}" style="color: #2563eb;">${safeUrl}</a></p>
      </div>
    `.trim(),
    text: [
      input.recipientName ? `Hi ${input.recipientName},` : 'Hi,',
      'We received a request to reset your password for your PitIQ account.',
      `Reset your password using the link below:\n${input.resetUrl}`,
      expirationText,
      'If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.',
    ].join('\n\n'),
  };
}
