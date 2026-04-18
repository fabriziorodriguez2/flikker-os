import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  function makePair() {
    const req = { headers: {} } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();
    return { req, res, next };
  }

  it('generates a UUID v4 when no x-request-id header is present', () => {
    const { req, res, next } = makePair();

    middleware.use(req, res, next);

    const id = req.headers['x-request-id'];
    expect(id).toBeDefined();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', id);
    expect(next).toHaveBeenCalled();
  });

  it('reuses the client-provided x-request-id header', () => {
    const { req, res, next } = makePair();
    req.headers['x-request-id'] = 'client-id-123';

    middleware.use(req, res, next);

    expect(req.headers['x-request-id']).toBe('client-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'client-id-123');
    expect(next).toHaveBeenCalled();
  });

  it('generates unique IDs across multiple requests', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { req, res, next } = makePair();
      middleware.use(req, res, next);
      ids.add(req.headers['x-request-id'] as string);
    }
    expect(ids.size).toBe(50);
  });
});
