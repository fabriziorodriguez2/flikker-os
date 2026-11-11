import { redactContactData, sanitizeCustomerComment } from './customer-text';

describe('customer text — datos de contacto', () => {
  it.each([
    [
      'Llamame al 099 123 456 cuando abran',
      'Llamame al [teléfono] cuando abran',
    ],
    ['mi cel +598 91 624 988', 'mi cel [teléfono]'],
    ['tel (02) 2400-1234', 'tel [teléfono]'],
    ['escribime a ana.perez@gmail.com', 'escribime a [email]'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(redactContactData(input)).toBe(expected);
  });

  it('no toca números que no son teléfonos (puntajes, precios, fechas)', () => {
    const text = 'Le pongo 5 estrellas, el café a $120 y volví el 10/11.';
    expect(redactContactData(text)).toBe(text);
  });

  it('se aplica al comentario que viaja al modelo', () => {
    expect(
      sanitizeCustomerComment('Excelente, avisame al 099123456', 500),
    ).toEqual({ comment: 'Excelente, avisame al [teléfono]', omitted: false });
  });
});
