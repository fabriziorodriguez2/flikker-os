import { Injectable, Logger } from '@nestjs/common';
import { CheckinPresenceMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  currentPresenceChallenge,
  verifyPresenceCode,
  PRESENCE_WINDOW_SECONDS,
  type PresenceChallenge,
} from './presence-challenge';

/**
 * El lado con estado de la prueba de presencia: de dónde sale el secreto, qué
 * negocio la exige, y qué se le muestra al mostrador. Las reglas puras
 * (derivación y verificación del código) viven en `presence-challenge.ts`.
 */
@Injectable()
export class PresenceChallengeService {
  private readonly logger = new Logger('checkin-presence');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * El secreto NO tiene default en producción a propósito: un fallback
   * hardcodeado convertiría el código rotativo en algo que cualquiera puede
   * derivar conociendo el businessId, que es exactamente el agujero que este
   * mecanismo cierra. Si falta, la prueba de presencia no se puede exigir y
   * el negocio queda como estaba (`off`) — degradado y ruidoso en los logs,
   * nunca "verde" mintiendo que hay una protección que no existe.
   */
  private secret(): string | null {
    const value = process.env.CHECKIN_PRESENCE_SECRET?.trim();
    if (value && value.length >= 32) return value;
    // El JWT secret ya es un secreto de servidor de fuerza equivalente y ya
    // está desplegado; se usa como fuente derivada para no exigir una
    // variable nueva antes de poder probar esto. Se namespacea para que un
    // código de presencia nunca coincida con nada firmado con el JWT.
    const fallback = process.env.JWT_SECRET?.trim();
    if (fallback && fallback.length >= 32)
      return `checkin-presence:${fallback}`;
    return null;
  }

  /** ¿Este negocio exige prueba de presencia AHORA? */
  isRequired(business: { checkinPresenceMode: CheckinPresenceMode }): boolean {
    if (business.checkinPresenceMode !== CheckinPresenceMode.rotating_code) {
      return false;
    }
    if (!this.secret()) {
      this.logger.error(
        'checkinPresenceMode=rotating_code pero no hay CHECKIN_PRESENCE_SECRET ni JWT_SECRET utilizable — el check-in sigue SIN prueba de presencia.',
      );
      return false;
    }
    return true;
  }

  /**
   * El código vigente, para que el panel lo muestre en el mostrador. Solo lo
   * llama una ruta autenticada y scopeada al negocio activo — nunca la API
   * pública, que lo entregaría a quien tenga el link.
   */
  currentForPanel(
    businessId: string,
    now: Date = new Date(),
  ): {
    code: string;
    expiresAt: Date;
    secondsRemaining: number;
    windowSeconds: number;
  } | null {
    const secret = this.secret();
    if (!secret) return null;

    const challenge = currentPresenceChallenge(secret, businessId, now);
    return {
      code: challenge.code,
      expiresAt: challenge.windowEnd,
      secondsRemaining: Math.max(
        0,
        Math.round((challenge.windowEnd.getTime() - now.getTime()) / 1000),
      ),
      windowSeconds: PRESENCE_WINDOW_SECONDS,
    };
  }

  /**
   * Verifica el código que mandó el cliente. Devuelve el desafío (para
   * anclar la `Visit` y bloquear el replay) o `null` si no es válido —
   * nunca dice si el código era viejo o directamente inventado.
   */
  verify(
    businessId: string,
    rawCode: string | undefined,
    now: Date = new Date(),
  ): PresenceChallenge | null {
    const secret = this.secret();
    if (!secret || !rawCode) return null;

    const result = verifyPresenceCode(secret, businessId, rawCode, now);
    return result.valid ? result.challenge : null;
  }
}
