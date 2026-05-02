import { BranchesRepository } from './branches.repository';

describe('BranchesRepository', () => {
  it('returns count 0 without throwing when update uses the wrong businessId', async () => {
    const prisma = {
      branch: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const repository = new BranchesRepository(prisma as never);

    const result = await repository.update('wrong-business', 'branch-1', {
      name: 'Blocked',
    });

    expect(result).toEqual({ count: 0 });
    expect(prisma.branch.updateMany).toHaveBeenCalledWith({
      where: { id: 'branch-1', businessId: 'wrong-business' },
      data: { name: 'Blocked' },
    });
  });
});
