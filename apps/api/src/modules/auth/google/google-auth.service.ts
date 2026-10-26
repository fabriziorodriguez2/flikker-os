import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CheckoutPlan, Prisma, type User } from '@prisma/client';
import { AuthRepository } from '../auth.repository';
import { AuthService } from '../auth.service';
import { normalizeEmail } from '../../../common/utils/email.util';
import { GoogleOAuthClient } from './google-oauth.client';
import {
  GoogleIdTokenVerifier,
  type GoogleIdentity,
} from './google-id-token.verifier';
import { GoogleAuthError } from './google-auth.error';

export const GOOGLE_AUTH_FAILED_MESSAGE =
  'No pudimos iniciar sesión con Google. Probá de nuevo.';

/**
 * "Continuar con Google" — Google SOLO prueba la identidad. Todo lo demás
 * (User, Session, memberships, `pendingUpgradePlan`) es el mismo auth de
 * Flikker que usa el login con password: no hay un segundo sistema de
 * usuarios ni una sesión paralela.
 *
 * Resolución del User, en este orden (nunca al revés):
 *   1. `googleSub` ya asociado → ese User, sin mirar el email.
 *   2. email verificado por Google que ya existe → se linkea ese User.
 *   3. nadie → User nuevo, ya verificado, sin Business.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly authService: AuthService,
    private readonly oauth: GoogleOAuthClient,
    private readonly verifier: GoogleIdTokenVerifier,
  ) {}

  createAuthorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }) {
    this.assertConfigured();
    return { url: this.oauth.buildAuthorizationUrl(input) };
  }

  async authenticate(
    input: {
      code: string;
      codeVerifier: string;
      nonce: string;
      pendingUpgradePlan?: CheckoutPlan;
    },
    userAgent?: string,
    ip?: string,
  ) {
    this.assertConfigured();

    let user: User;
    let isNewUser: boolean;
    try {
      const idToken = await this.oauth.exchangeCodeForIdToken(input);
      const identity = await this.verifier.verify(idToken, {
        audience: this.oauth.clientId,
        nonce: input.nonce,
      });
      // Sin esto no hay linking ni alta: un email no verificado por Google
      // no prueba que quien entra sea el dueño de ese correo.
      if (!identity.emailVerified) {
        throw new GoogleAuthError('email_not_verified');
      }
      ({ user, isNewUser } = await this.resolveUser(
        identity,
        input.pendingUpgradePlan ?? null,
      ));
    } catch (error) {
      if (error instanceof GoogleAuthError) {
        this.logger.warn(`Google sign-in rejected: ${error.reason}`);
        throw new UnauthorizedException(GOOGLE_AUTH_FAILED_MESSAGE);
      }
      throw error;
    }

    const memberships = await this.repository.findMembershipsForUser(user.id);

    // Intención Pro de la landing: solo como flujo de alta, es decir, para
    // quien todavía no tiene Business. Al User nuevo ya se le guardó al
    // crearlo; a uno existente sin Business se le guarda solo si no tenía
    // otra (nunca se pisa). Quien ya tiene Business hace upgrade desde el
    // panel, nunca por un checkout pre-onboarding.
    let pendingUpgradePlan = user.pendingUpgradePlan;
    if (
      !isNewUser &&
      input.pendingUpgradePlan &&
      memberships.length === 0 &&
      !pendingUpgradePlan
    ) {
      const { count } = await this.repository.setPendingUpgradePlanIfEmpty(
        user.id,
        input.pendingUpgradePlan,
      );
      if (count > 0) pendingUpgradePlan = input.pendingUpgradePlan;
    }

    const { accessToken, refreshToken } = await this.authService.issueSession(
      user.id,
      userAgent,
      ip,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isPlatformAdmin: user.isPlatformAdmin,
        pendingUpgradePlan,
      },
      memberships,
      isNewUser,
    };
  }

  private async resolveUser(
    identity: GoogleIdentity,
    pendingUpgradePlan: CheckoutPlan | null,
  ): Promise<{ user: User; isNewUser: boolean }> {
    const bySub = await this.repository.findUserByGoogleSub(identity.sub);
    if (bySub) {
      if (!bySub.isActive) throw new GoogleAuthError('inactive_user');
      return { user: bySub, isNewUser: false };
    }

    const email = normalizeEmail(identity.email);
    const byEmail = await this.repository.findUserByEmail(email);

    if (byEmail) {
      if (!byEmail.isActive) throw new GoogleAuthError('inactive_user');
      // El email ya está asociado a OTRA identidad Google: no se reasigna.
      if (byEmail.googleSub) throw new GoogleAuthError('identity_conflict');

      const discardUnverifiedPassword = !byEmail.emailVerifiedAt;
      const { count } = await this.repository.linkGoogleSub(
        byEmail.id,
        identity.sub,
        { discardUnverifiedPassword },
      );
      if (count === 0) throw new GoogleAuthError('identity_conflict');

      this.logger.log(`Google identity linked to existing user ${byEmail.id}`);
      return {
        user: {
          ...byEmail,
          googleSub: identity.sub,
          ...(discardUnverifiedPassword
            ? { passwordHash: null, emailVerifiedAt: new Date() }
            : {}),
        },
        isNewUser: false,
      };
    }

    const { firstName, lastName } = splitName(identity, email);
    try {
      const user = await this.repository.createGoogleUser({
        email,
        googleSub: identity.sub,
        firstName,
        lastName,
        pendingUpgradePlan,
      });
      this.logger.log(`User ${user.id} created via Google`);
      return { user, isNewUser: true };
    } catch (error) {
      // Doble callback concurrente: el índice único de email/googleSub gana.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new GoogleAuthError('concurrent_signup');
      }
      throw error;
    }
  }

  private assertConfigured() {
    if (!this.oauth.isConfigured()) {
      throw new ServiceUnavailableException(GOOGLE_AUTH_FAILED_MESSAGE);
    }
  }
}

function splitName(identity: GoogleIdentity, email: string) {
  const [nameFirst, ...nameRest] = (identity.name ?? '').split(/\s+/);
  const firstName =
    identity.givenName ?? (nameFirst || null) ?? email.split('@')[0];
  const lastName = identity.familyName ?? nameRest.join(' ');
  return { firstName, lastName };
}
