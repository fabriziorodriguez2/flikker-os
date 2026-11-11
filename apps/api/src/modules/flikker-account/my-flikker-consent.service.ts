import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsentChannel, ConsentSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsentService } from '../policy/consent.service';
import { consentText } from '../policy/consent-texts';

/**
 * Mi Flikker → preferencias de comunicación, por comercio y canal. El scope
 * es la CUENTA: solo los `Customer` vinculados a la sesión, nunca un id que
 * venga del cliente. Cambiar de opinión es tan fácil como aceptar.
 */
@Injectable()
export class MyFlikkerConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
  ) {}

  async list(flikkerAccountId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { flikkerAccountId, isActive: true },
      select: {
        id: true,
        email: true,
        business: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      customers.map(async (c) => ({
        businessId: c.business.id,
        businessName: c.business.name,
        whatsapp: {
          status: await this.consent.channelStatus(
            c.business.id,
            c.id,
            ConsentChannel.WHATSAPP,
          ),
          text: consentText(ConsentChannel.WHATSAPP, c.business.name),
        },
        email: {
          // Sin email cargado no hay a dónde escribir: no se ofrece.
          available: Boolean(c.email?.trim()),
          status: await this.consent.channelStatus(
            c.business.id,
            c.id,
            ConsentChannel.EMAIL,
          ),
          text: consentText(ConsentChannel.EMAIL, c.business.name),
        },
      })),
    );
  }

  async set(
    flikkerAccountId: string,
    businessId: string,
    channel: ConsentChannel,
    granted: boolean,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { flikkerAccountId, businessId, isActive: true },
      select: { id: true, business: { select: { name: true } } },
    });
    // Mismo 404 para "no existe" y "es de otra cuenta".
    if (!customer) throw new NotFoundException('Comercio no encontrado');
    const status = await this.consent.setByCustomer({
      businessId,
      customerId: customer.id,
      channel,
      granted,
      source: ConsentSource.MI_FLIKKER,
    });
    return {
      businessId,
      channel,
      status,
      text: consentText(channel, customer.business.name),
    };
  }
}
