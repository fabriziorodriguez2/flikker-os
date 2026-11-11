import { isOptOutKeyword } from './consent.service';

describe('isOptOutKeyword', () => {
  it.each([
    'BAJA',
    'baja',
    ' Baja. ',
    'STOP',
    'Stop!',
    'cancelar',
    'darme de baja',
    'No quiero recibir más mensajes',
    'no mas',
  ])('"%s" es un pedido de baja', (text) =>
    expect(isOptOutKeyword(text)).toBe(true),
  );

  it.each([
    'bajá el precio',
    'hola',
    'quiero la promo',
    'no puedo ir mañana',
    'baja 2x1',
    '',
  ])('"%s" no lo es', (text) => expect(isOptOutKeyword(text)).toBe(false));
});
