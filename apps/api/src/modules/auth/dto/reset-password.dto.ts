import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  token: string;

  /**
   * Optional. The recovery link no longer carries the email — it is PII that
   * ends up in browser history, logs and referrers, and the token alone already
   * identifies the account. Still accepted so links already sitting in inboxes
   * keep working: when present it must match the token's owner.
   */
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
