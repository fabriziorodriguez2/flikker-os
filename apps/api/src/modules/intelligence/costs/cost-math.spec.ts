import { aiCost, messagingCost, monthlyProjection } from './cost-math';

const AGENT = 'INTELLIGENCE_AGENT_TURN';
const PRICES = { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 };

describe('cost math', () => {
  it('separa los turnos del agente de otros usos de IA y recalcula con precios configurables', () => {
    const cost = aiCost(
      [
        {
          useCase: AGENT,
          success: true,
          inputTokens: 10_000,
          outputTokens: 500,
          estimatedCostUsd: 0.0018,
        },
        {
          useCase: AGENT,
          success: false,
          inputTokens: 2_000,
          outputTokens: 0,
          estimatedCostUsd: 0.0003,
        },
        {
          useCase: 'RETENTION_COPY',
          success: true,
          inputTokens: 300,
          outputTokens: 80,
          estimatedCostUsd: 0.0001,
        },
      ],
      2,
      PRICES,
      AGENT,
    );
    expect(cost).toMatchObject({
      turns: 2,
      failedTurns: 1,
      conversations: 2,
      inputTokens: 12_000,
      outputTokens: 500,
      recordedUsd: 0.0021,
      // 12.000 × 0,15/1M + 500 × 0,6/1M = 0,0018 + 0,0003
      atCurrentPricesUsd: 0.0021,
      perTurnUsd: 0.00105,
      perConversationUsd: 0.00105,
      otherUseCasesUsd: 0.0001,
    });
    // Si cambia el precio, se recalcula sin tocar lo registrado.
    expect(
      aiCost(
        [
          {
            useCase: AGENT,
            success: true,
            inputTokens: 1_000_000,
            outputTokens: 0,
            estimatedCostUsd: 0.15,
          },
        ],
        1,
        { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 },
        AGENT,
      ),
    ).toMatchObject({ recordedUsd: 0.15, atCurrentPricesUsd: 2.5 });
  });

  it('sin turnos: sin promedios inventados', () => {
    expect(aiCost([], 0, PRICES, AGENT)).toMatchObject({
      turns: 0,
      perTurnUsd: null,
      perConversationUsd: null,
    });
  });

  it('mensajería sin costo por mensaje cargado: costo desconocido, no cero', () => {
    expect(messagingCost(10, null, 'UYU')).toEqual({
      marketingMessagesSent: 10,
      unitCost: null,
      currency: 'UYU',
      cost: null,
    });
    expect(messagingCost(10, 2.5, 'UYU').cost).toBe(25);
  });

  it('proyección: lo observado por día × 30, solo con datos', () => {
    expect(monthlyProjection(1, 10)).toBe(3);
    expect(monthlyProjection(null, 10)).toBeNull();
    expect(monthlyProjection(5, 0)).toBeNull();
  });
});
