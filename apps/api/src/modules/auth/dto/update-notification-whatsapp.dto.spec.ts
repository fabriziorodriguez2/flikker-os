import { validate } from 'class-validator';
import { UpdateNotificationWhatsAppDto } from './update-notification-whatsapp.dto';

describe('UpdateNotificationWhatsAppDto', () => {
  it('un teléfono como string: válido a nivel DTO (el formato real lo valida normalizeToE164 en el servicio)', async () => {
    const dto = Object.assign(new UpdateNotificationWhatsAppDto(), {
      phone: '099123456',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('vacío: inválido', async () => {
    const dto = Object.assign(new UpdateNotificationWhatsAppDto(), {
      phone: '',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'phone')).toBe(true);
  });

  it('un número de tipo, no string (ej. body malformado): inválido', async () => {
    const dto = Object.assign(new UpdateNotificationWhatsAppDto(), {
      phone: 99123456,
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'phone')).toBe(true);
  });
});
