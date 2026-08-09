import { MessageStatus } from '@prisma/client';
import { createSeededRandom } from './prng';
import { FakeWhatsappTransport } from './fake-whatsapp-transport';

describe('FakeWhatsappTransport — §4/§11/§14: never a real send, never 100% success', () => {
  it('never returns "failed" when failureRate is 0', () => {
    const transport = new FakeWhatsappTransport({
      failureRate: 0,
      deliveredRate: 1,
      readRate: 1,
    });
    const rng = createSeededRandom(1);
    for (let i = 0; i < 200; i++) {
      expect(transport.simulateSend(rng)).toBe(MessageStatus.read);
    }
  });

  it('always fails when failureRate is 1', () => {
    const transport = new FakeWhatsappTransport({
      failureRate: 1,
      deliveredRate: 1,
      readRate: 1,
    });
    const rng = createSeededRandom(2);
    for (let i = 0; i < 200; i++) {
      expect(transport.simulateSend(rng)).toBe(MessageStatus.failed);
    }
  });

  it('stalls at "sent" when deliveredRate is 0', () => {
    const transport = new FakeWhatsappTransport({
      failureRate: 0,
      deliveredRate: 0,
      readRate: 1,
    });
    const rng = createSeededRandom(3);
    for (let i = 0; i < 200; i++) {
      expect(transport.simulateSend(rng)).toBe(MessageStatus.sent);
    }
  });

  it('stalls at "delivered" when readRate is 0', () => {
    const transport = new FakeWhatsappTransport({
      failureRate: 0,
      deliveredRate: 1,
      readRate: 0,
    });
    const rng = createSeededRandom(4);
    for (let i = 0; i < 200; i++) {
      expect(transport.simulateSend(rng)).toBe(MessageStatus.delivered);
    }
  });

  it('produces a realistic mix of every outcome with default probabilities', () => {
    const transport = new FakeWhatsappTransport();
    const rng = createSeededRandom(42);
    const outcomes = new Set<MessageStatus>();
    for (let i = 0; i < 500; i++) outcomes.add(transport.simulateSend(rng));
    expect(outcomes.has(MessageStatus.read)).toBe(true);
    expect(outcomes.has(MessageStatus.delivered)).toBe(true);
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('is fully reproducible for the same seed', () => {
    const transport = new FakeWhatsappTransport();
    const a = createSeededRandom(7);
    const b = createSeededRandom(7);
    const seqA = Array.from({ length: 100 }, () => transport.simulateSend(a));
    const seqB = Array.from({ length: 100 }, () => transport.simulateSend(b));
    expect(seqA).toEqual(seqB);
  });
});
