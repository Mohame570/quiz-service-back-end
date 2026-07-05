import { ArrayNotEmpty, IsArray, IsString, IsUrl, IsOptional } from 'class-validator';

export class SendQuizInvitationAdminDto {
  @IsString()
  quizId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  recipientEmails!: string[];

  @IsOptional()
  @IsUrl({ require_tld: false })
  invitationUrl?: string;
}
