import { VisitSourcesController } from './visit-sources.controller';
import type { VisitSourcesService } from './visit-sources.service';

function makeService(buffer: Buffer) {
  return {
    getQrPng: jest.fn().mockResolvedValue(buffer),
  };
}

function makeRes() {
  return {
    set: jest.fn(),
    send: jest.fn(),
  };
}

function makeReq() {
  return { currentBusinessId: 'biz-1' };
}

describe('VisitSourcesController.getQr — bug real #1 (PNG que no abre)', () => {
  it('uses res.send with the raw buffer, never res.json', async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const service = makeService(pngBuffer);
    const controller = new VisitSourcesController(
      service as unknown as VisitSourcesService,
    );
    const res = makeRes();

    await controller.getQr(makeReq() as never, 's1', res as never);

    // The actual bug (Nest calling response.json() on a Buffer returned
    // without @Res()) is exactly what this asserts against: res.send must
    // receive the Buffer itself, not a JSON-stringified wrapper.
    expect(res.send).toHaveBeenCalledWith(pngBuffer);
    expect(res.set).toHaveBeenCalledWith({
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename="checkin-qr.png"',
    });
  });

  it('scopes the lookup to the current business', async () => {
    const service = makeService(Buffer.from([1, 2, 3]));
    const controller = new VisitSourcesController(
      service as unknown as VisitSourcesService,
    );

    await controller.getQr(makeReq() as never, 'source-1', makeRes() as never);

    expect(service.getQrPng).toHaveBeenCalledWith('biz-1', 'source-1');
  });
});
