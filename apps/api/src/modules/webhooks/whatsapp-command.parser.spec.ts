import { parseWhatsAppCommand } from './whatsapp-command.parser';

describe('parseWhatsAppCommand', () => {
  it.each([
    ['Atendido: María García 099887766', 'María García', '099887766'],
    ['atendi Juan Perez 98123456', 'Juan Perez', '98123456'],
    ['Atendí a 099 123 456', undefined, '099 123 456'],
  ])('parses attended command: %s', (input, name, phone) => {
    expect(parseWhatsAppCommand(input)).toMatchObject({
      type: 'attended',
      name,
      phone,
    });
  });

  it.each(['', 'hola', 'atendido maria', 'atendi'])(
    'returns unknown for malformed input: %s',
    (input) => {
      expect(parseWhatsAppCommand(input)).toMatchObject({ type: 'unknown' });
    },
  );

  it.each([
    ['Stats', 'stats'],
    ['Pausar', 'pause'],
    ['Ayuda', 'help'],
  ])('parses command: %s', (input, type) => {
    expect(parseWhatsAppCommand(input)).toMatchObject({ type });
  });
});
