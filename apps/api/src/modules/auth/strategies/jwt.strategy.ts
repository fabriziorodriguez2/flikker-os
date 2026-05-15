import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  businessId?: string;
  isImpersonating?: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        isPlatformAdmin: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return {
      ...user,
      isImpersonating: payload.isImpersonating === true,
      impersonatedBusinessId:
        payload.isImpersonating === true  payload.businessId : undefined,
    };
  }
}
