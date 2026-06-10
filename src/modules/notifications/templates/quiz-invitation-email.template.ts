import { SendQuizInvitationEmailDto } from '../dto/send-quiz-invitation-email.dto';
import { escapeHtml, formatUtcDate } from './template.helpers';
import { RenderedEmailTemplate } from './template.types';

export function renderQuizInvitationEmailTemplate(
  input: SendQuizInvitationEmailDto,
): RenderedEmailTemplate {
  const recipientName = input.recipientName
    ? `Hi ${escapeHtml(input.recipientName)},`
    : 'Hi,';
  const invitedBy = input.invitedByName
    ? `You have been invited by ${escapeHtml(input.invitedByName)}`
    : 'You have been invited';
  const availabilityCopy = input.availableUntil
    ? `Please join before ${formatUtcDate(input.availableUntil)}.`
    : 'Use the link below to join the quiz.';
  const safeQuizTitle = escapeHtml(input.quizTitle);
  const safeUrl = escapeHtml(input.invitationUrl);

  return {
    subject: `Quiz invitation: ${input.quizTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>${recipientName}</p>
        <p>${invitedBy} to take the quiz <strong>${safeQuizTitle}</strong>.</p>
        <p>${escapeHtml(availabilityCopy)}</p>
        <p>
          <a href="${safeUrl}">Open quiz invitation</a>
        </p>
      </div>
    `.trim(),
    text: [
      input.recipientName ? `Hi ${input.recipientName},` : 'Hi,',
      `${input.invitedByName ? `You have been invited by ${input.invitedByName}` : 'You have been invited'} to take the quiz "${input.quizTitle}".`,
      availabilityCopy,
      `Open quiz invitation: ${input.invitationUrl}`,
    ].join('\n\n'),
  };
}
