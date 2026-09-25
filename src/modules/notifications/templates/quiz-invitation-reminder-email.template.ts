import { SendQuizReminderEmailDto } from '../dto/send-quiz-invitation-reminder-email';
import { escapeHtml, formatUtcDate } from './template.helpers';
import { RenderedEmailTemplate } from './template.types';

export function renderQuizReminderEmailTemplate(
  input: SendQuizReminderEmailDto,
): RenderedEmailTemplate {
  const recipientName = input.recipientName
    ? `Hi ${escapeHtml(input.recipientName)},`
    : 'Hi,';
  const availabilityCopy = input.availableUntil
    ? `Please complete it before ${formatUtcDate(input.availableUntil)}.`
    : 'Please complete it as soon as you can.';
  const safeQuizTitle = escapeHtml(input.quizTitle);
  const safeUrl = escapeHtml(input.invitationUrl);

  return {
    subject: `Reminder: ${input.quizTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>${recipientName}</p>
        <p>This is a reminder to complete the quiz <strong>${safeQuizTitle}</strong>.</p>
        <p>${escapeHtml(availabilityCopy)}</p>
        <p>
          <a href="${safeUrl}">Open quiz</a>
        </p>
      </div>
    `.trim(),
    text: [
      input.recipientName ? `Hi ${input.recipientName},` : 'Hi,',
      `This is a reminder to complete the quiz "${input.quizTitle}".`,
      availabilityCopy,
      `Open quiz: ${input.invitationUrl}`,
    ].join('\n\n'),
  };
}
