import { HELP_FAQ_ENTRIES, matchHelpFaqEntryByText } from './chatbot-help-kb';

describe('matchHelpFaqEntryByText — las 12 preguntas pedidas + reseñas', () => {
  const cases: [string, string][] = [
    ['¿Cómo mando una promoción?', 'send-promotion'],
    ['¿Cómo creo un beneficio?', 'create-benefit'],
    ['¿Cómo configuro la tarjeta de sellos?', 'activate-stamps'],
    ['¿Cómo cambio la cantidad de sellos?', 'change-stamps-count'],
    ['¿Cómo conecto Google?', 'connect-google'],
    ['¿Cómo funcionan las reseñas?', 'reviews-how-it-works'],
    ['¿Cómo funciona Te extrañamos?', 'we-miss-you'],
    [
      '¿Cómo autorizo un beneficio para reactivación?',
      'authorize-benefit-reactivation',
    ],
    ['¿Cómo cambio el horario de mensajes?', 'message-schedule'],
    ['¿Cómo veo mis clientes?', 'view-customers'],
    ['¿Cómo paso a Pro?', 'upgrade-to-pro'],
    ['¿Cómo canjea un cliente un premio?', 'redeem-reward'],
  ];

  it.each(cases)('"%s" resuelve a %s', (question, id) => {
    expect(matchHelpFaqEntryByText(question)?.id).toBe(id);
  });

  it('agrega el QR también resuelve, aunque no esté en la lista de 12 pedidas', () => {
    expect(matchHelpFaqEntryByText('¿Cómo agrego el QR?')?.id).toBe('add-qr');
  });
});

describe('matchHelpFaqEntryByText — normalización', () => {
  it('sin tildes ni mayúsculas, sigue matcheando', () => {
    expect(matchHelpFaqEntryByText('como mando una promocion')?.id).toBe(
      'send-promotion',
    );
  });

  it('con la pregunta escrita en cualquier parte de una frase más larga', () => {
    expect(
      matchHelpFaqEntryByText(
        'hola, quería preguntarte cómo mando una promoción por favor',
      )?.id,
    ).toBe('send-promotion');
  });

  it('texto no relacionado no matchea nada — nunca inventa una entrada', () => {
    expect(matchHelpFaqEntryByText('contame un chiste')).toBeNull();
    expect(matchHelpFaqEntryByText('hola')).toBeNull();
  });
});

describe('matchHelpFaqEntryByText — sin ambigüedad entre entradas similares', () => {
  it('"activar sellos" no matchea change-stamps-count', () => {
    expect(matchHelpFaqEntryByText('¿cómo activo los sellos?')?.id).toBe(
      'activate-stamps',
    );
  });

  it('"cambiar la cantidad de sellos" no matchea activate-stamps', () => {
    expect(
      matchHelpFaqEntryByText('¿cómo cambio la cantidad de sellos?')?.id,
    ).toBe('change-stamps-count');
  });
});

describe('HELP_FAQ_ENTRIES — integridad', () => {
  it('cada entrada tiene al menos una keyword', () => {
    for (const entry of HELP_FAQ_ENTRIES) {
      expect(entry.keywords.length).toBeGreaterThan(0);
    }
  });

  it('ids únicos', () => {
    const ids = HELP_FAQ_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
