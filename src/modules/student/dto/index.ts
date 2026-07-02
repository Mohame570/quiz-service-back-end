export { StudentQuizListItemDto, StudentAttemptStatus, deriveAttemptStatus } from './student-quiz-list-item.dto';
export { StudentQuizListResponseDto } from './student-quiz-list-response.dto';
export { StudentQuizInstructionsDto } from './student-quiz-instructions.dto';
export { StudentQuizInvitationResponseDto } from './student-quiz-invitation-response.dto';
export { StudentActiveAttemptDto, StudentActiveAttemptResponseDto } from './student-active-attempt.dto';
export { StudentAttemptQuestionDto } from './student-attempt-question.dto';
export { StudentAttemptQuestionsResponseDto } from './student-attempt-questions-response.dto';
export { StudentStartAttemptDto } from './start-attempt.dto';

// Re-exports of the attempts module's DTOs under the `Student*` name so the
// student controller can keep a single import path. The runtime types are
// identical to the originals; no new classes are introduced.
export { AttemptResponseDto as StudentAttemptResponseDto, AttemptAnswerResponseDto as StudentAttemptAnswerDto } from '../../attempts/dto/attempt-response.dto';
export { SaveAnswersDto as StudentSaveAnswersDto, SaveAnswerItemDto as StudentSaveAnswerItemDto } from '../../attempts/dto/save-answers.dto';
export { SubmitAttemptDto as StudentSubmitAttemptDto } from '../../attempts/dto/submit-attempt.dto';
