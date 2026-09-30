import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { DashboardModule } from './dashboard.module';
import { DashboardOverviewService } from './dashboard-overview.service';

/**
 * Smoke test del grafo de DI: `DashboardModule` importa `RetentionV2Module`
 * directamente (no depende de que algún otro módulo lo "preste" en
 * `AppModule`) — si algún provider necesario no estuviera exportado, esto
 * falla al compilar el módulo, no en producción.
 */
describe('DashboardModule — DI wiring', () => {
  it('compiles and resolves DashboardOverviewService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        // `PublicController` usa `@UseGuards(ThrottlerGuard)`. En la app real
        // `ThrottlerModule` es @Global() desde `AppModule`; un spec que compila
        // un módulo suelto tiene que traerlo, igual que lo hace la raíz.
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
        DashboardModule,
      ],
    }).compile();

    const service = moduleRef.get(DashboardOverviewService);
    expect(service).toBeInstanceOf(DashboardOverviewService);

    await moduleRef.close();
  });
});
