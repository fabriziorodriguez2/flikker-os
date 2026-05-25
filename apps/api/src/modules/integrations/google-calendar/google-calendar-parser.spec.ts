import { GoogleCalendarParserService } from './google-calendar-parser.service';

const parser = new GoogleCalendarParserService();

function parse(title: string) {
  return parser.parse(title);
}

describe('GoogleCalendarParserService', () => {
  it('parses name and mobile phone with dash separator', () => {
    const r = parse('Juan Pérez - 091234567');
    expect(r.customerName).toBe('Juan Pérez');
    expect(r.customerPhone).toBe('091234567');
  });

  it('parses phone-first format', () => {
    const r = parse('091234567 - Juan Pérez');
    expect(r.customerName).toBe('Juan Pérez');
    expect(r.customerPhone).toBe('091234567');
  });

  it('parses international +598 format', () => {
    const r = parse('María García +598912345678');
    expect(r.customerName).toBe('María García');
    expect(r.customerPhone).toBe('+598912345678');
  });

  it('parses phone with spaces', () => {
    const r = parse('Pedro Rodríguez 092 345 678');
    expect(r.customerName).toBe('Pedro Rodríguez');
    expect(r.customerPhone).toBe('092345678');
  });

  it('parses phone in parentheses', () => {
    const r = parse('Ana López (093456789)');
    expect(r.customerName).toBe('Ana López');
    expect(r.customerPhone).toBe('093456789');
  });

  it('returns only name when no phone', () => {
    const r = parse('José Rodríguez');
    expect(r.customerName).toBe('José Rodríguez');
    expect(r.customerPhone).toBeNull();
  });

  it('returns only phone when no name', () => {
    const r = parse('091234567');
    expect(r.customerName).toBeNull();
    expect(r.customerPhone).toBe('091234567');
  });

  it('handles title with colon separator', () => {
    const r = parse('Consulta: María García - 092111222');
    expect(r.customerName).toBeTruthy();
    expect(r.customerPhone).toBe('092111222');
  });

  it('handles empty title', () => {
    const r = parse('');
    expect(r.customerName).toBeNull();
    expect(r.customerPhone).toBeNull();
  });

  it('handles title with only separators', () => {
    const r = parse('---');
    expect(r.customerName).toBeNull();
    expect(r.customerPhone).toBeNull();
  });

  it('parses landline Montevideo format', () => {
    const r = parse('Carlos Méndez 29001234');
    expect(r.customerName).toBe('Carlos Méndez');
    expect(r.customerPhone).toBe('29001234');
  });

  it('parses mobile with dot separators', () => {
    const r = parse('Laura Sosa 092.345.678');
    expect(r.customerName).toBe('Laura Sosa');
    expect(r.customerPhone).toBe('092345678');
  });

  it('strips leading/trailing separators from name', () => {
    const r = parse('- Sofía Torres - 091111222');
    expect(r.customerName).toBe('Sofía Torres');
    expect(r.customerPhone).toBe('091111222');
  });

  it('handles +598 9X XXX XXX format with spaces', () => {
    const r = parse('Nicolás Peña +598 92 123 456');
    expect(r.customerName).toBe('Nicolás Peña');
    expect(r.customerPhone).toMatch(/\+?598/);
  });

  it('does not misidentify years as phones', () => {
    // "2025" is only 4 digits - too short to be a phone
    const r = parse('Reunión 2025 equipo');
    expect(r.customerPhone).toBeNull();
  });
});
