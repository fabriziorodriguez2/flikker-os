import { MessageStatus } from '@prisma/client';
import { chance, type Rng } from './prng';

/**
 * Simulation Center §4/§11/§14 — the ONLY WhatsApp "transport" a simulation
 * may ever use. It never performs network I/O and never imports
 * `WhatsAppBspService`; the engine (a later batch) drives `Message.status`
 * itself using the outcome this returns, rather than trying to locate and
 * safely fake whatever real send/webhook worker exists in production — a
 * deliberate simplification, documented here.
 *
 * §14 — never hardcodes success=100%: every stage can fail/stall, cascading
 * queued → sent → delivered → read, so noise (undelivered/unread messages)
 * is the default, not an edge case someone has to opt into.
 */
export interface FakeWhatsappDeliveryProbabilities {
  /** Probability the send itself never leaves "sent" (blocked/opted-out/etc.). */
  failureRate: number;
  /** Probability a sent message reaches "delivered". */
  deliveredRate: number;
  /** Probability a delivered message reaches "read". */
  readRate: number;
}

export const DEFAULT_WHATSAPP_DELIVERY_PROBABILITIES: FakeWhatsappDeliveryProbabilities =
  {
    failureRate: 0.03,
    deliveredRate: 0.92,
    readRate: 0.65,
  };

export class FakeWhatsappTransport {
  constructor(
    private readonly probabilities: FakeWhatsappDeliveryProbabilities = DEFAULT_WHATSAPP_DELIVERY_PROBABILITIES,
  ) {}

  /** One seeded roll per stage — never a coin flip outside `rng`. */
  simulateSend(rng: Rng): MessageStatus {
    if (chance(rng, this.probabilities.failureRate)) {
      return MessageStatus.failed;
    }
    if (!chance(rng, this.probabilities.deliveredRate)) {
      return MessageStatus.sent;
    }
    if (!chance(rng, this.probabilities.readRate)) {
      return MessageStatus.delivered;
    }
    return MessageStatus.read;
  }
}
