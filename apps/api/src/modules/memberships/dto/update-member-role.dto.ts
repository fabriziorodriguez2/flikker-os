import { IsEnum } from 'class-validator';
import { MembershipRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @IsEnum(MembershipRole)
  role: MembershipRole;
}
