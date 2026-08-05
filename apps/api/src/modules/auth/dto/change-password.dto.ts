import { IsString, MinLength } from 'class-validator';

/**
 * Self-service password change for an authenticated user. The new password is
 * chosen by the user — nothing is ever generated randomly here.
 */
export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  // Same minimum the signup/reset flows enforce.
  @IsString()
  @MinLength(8)
  newPassword: string;
}
