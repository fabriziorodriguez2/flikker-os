import {
  CampaignChannel,
  CampaignStatus,
  CampaignTemplateKind,
  DestinationType,
} from '@prisma/client';

export const REPEAT_TEMPLATES = [
  {
    slug: 'repeat-post-service',
    name: 'Repeat: post-servicio',
    description: 'Mensaje automatico luego de la ultima atencion.',
    templateKind: CampaignTemplateKind.post_service,
    triggerOffsetDays: 30,
    messageBody:
      'Hola {nombre}, soy {clinica}. Ya pasaron unos dias desde tu ultima visita. {oferta}',
    offerText: '',
  },
  {
    slug: 'repeat-reactivation',
    name: 'Repeat: reactivacion',
    description: 'Mensaje para pacientes sin contacto reciente.',
    templateKind: CampaignTemplateKind.reactivation,
    triggerOffsetDays: 180,
    messageBody:
      'Hola {nombre}, te escribe {clinica}. Hace tiempo que no te vemos. {oferta}',
    offerText: '',
  },
  {
    slug: 'repeat-birthday',
    name: 'Repeat: cumpleanos',
    description: 'Saludo automatico de cumpleanos.',
    templateKind: CampaignTemplateKind.birthday,
    triggerOffsetDays: 0,
    messageBody: 'Feliz cumple, {nombre}! Te saluda {clinica}. {oferta}',
    offerText: '',
  },
] as const;

export const REPEAT_TEMPLATE_DEFAULTS = {
  channel: CampaignChannel.WHATSAPP,
  destinationType: DestinationType.LANDING_ONLY,
  status: CampaignStatus.ACTIVE,
  enableLanding: false,
} as const;
