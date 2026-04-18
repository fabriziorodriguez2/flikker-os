import { IsEmail, IsEnum } from 'class-validator';
import { MembershipRole } from '@prisma/client';

export class AddMemberDto {
  @IsEmail()
  email: string;

  @IsEnum(MembershipRole)
  role: MembershipRole;
}
