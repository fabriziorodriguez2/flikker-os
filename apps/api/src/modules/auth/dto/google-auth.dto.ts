import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { CheckoutPlan } from '@prisma/client';

/** base64url de 32+ bytes aleatorios — lo que genera la web. */
const RANDOM_TOKEN = /^[A-Za-z0-9_-]{43,128}$/;

/**
 * La web genera state/nonce/PKCE y los guarda en su cookie httpOnly; la API
 * solo arma la URL para que el client id y el redirect URI vivan en un
 * único lugar (el mismo que después hace el canje del code).
 */
export class GoogleAuthorizationUrlDto {
  @Matches(RANDOM_TOKEN)
  state: string;

  @Matches(RANDOM_TOKEN)
  nonce: string;

  @Matches(RANDOM_TOKEN)
  codeChallenge: string;
}

/**
 * Lo manda el callback de la web DESPUÉS de validar `state` contra su
 * cookie. `codeVerifier` y `nonce` también salen de esa cookie, nunca del
 * query string que trae Google.
 */
export class GoogleCallbackDto {
  @IsString()
  @Matches(/^\S{1,2048}$/)
  code: string;

  @Matches(RANDOM_TOKEN)
  codeVerifier: string;

  @Matches(RANDOM_TOKEN)
  nonce: string;

  /** Intención de `/signup?plan=PRO&billing=...`, preservada server-side. */
  @IsOptional()
  @IsEnum(CheckoutPlan)
  pendingUpgradePlan?: CheckoutPlan;
}
