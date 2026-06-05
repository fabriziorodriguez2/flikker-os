import { BadRequestException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersRepository } from './customers.repository';

describe('CustomersService', () => {
  it('blocks Message creation when customer opted out', async () => {
    const createMessage = jest.fn().mockResolvedValue(null);
    const repository = {
      createMessage,
    } as unknown as CustomersRepository;

    const service = new CustomersService(repository, {
      sendText: jest.fn(),
    } as never);

    await expect(
      service.createMessageForCustomer('business-1', 'customer-1', 'token-1'),
    ).rejects.toThrow(BadRequestException);

    expect(createMessage).toHaveBeenCalledWith({
      businessId: 'business-1',
      customerId: 'customer-1',
      trackingToken: 'token-1',
    });
  });
});
