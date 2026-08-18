import { validate } from 'class-validator';
import { UpdateBusinessDto } from './update-business.dto';

describe('UpdateBusinessDto', () => {
  it('permite actualizar la vertical real de Business', async () => {
    const dto = Object.assign(new UpdateBusinessDto(), { vertical: 'dental' });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('mantiene el límite de 80 caracteres para vertical', async () => {
    const dto = Object.assign(new UpdateBusinessDto(), {
      vertical: 'x'.repeat(81),
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'vertical')).toBe(true);
  });
});
