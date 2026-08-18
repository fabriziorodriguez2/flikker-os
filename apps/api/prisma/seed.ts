/**
 * Seed — Flikker OS demo data
 *
 * Idempotent: usa upsert en todas las entidades.
 * Ejecutar: npm run seed (desde apps/api)
 *
 * Usuarios creados:
 *   admin@flikker.dev    / Flikker2026!  — OWNER en Clinica Dental + Centro Estetica  [PLATFORM ADMIN]
 *   admin2@flikker.dev   / Flikker2026!  — ADMIN en Clinica Dental
 *   ops@flikker.dev      / Flikker2026!  — OPERATOR en Clinica Dental
 *   viewer@flikker.dev   / Flikker2026!  — VIEWER en Centro Estetica
 *   estetica@flikker.dev / Flikker2026!  — OPERATOR en Centro Estetica
 *   dental@flikker.dev   / Flikker2026!  — OPERATOR en Clinica Dental
 *   multi@flikker.dev    / Flikker2026!  — ADMIN en Centro Estetica + OPERATOR en Dental
 *   revoked@flikker.dev  / Flikker2026!  — REVOKED en Clinica Dental
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  BusinessStatus,
  MembershipRole,
  MembershipStatus,
  SubscriptionStatus,
  CampaignStatus,
  CampaignChannel,
  CampaignTemplateKind,
  DestinationType,
  ReviewSource,
  ReviewStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'Flikker2026!';

type SeedCampaignData = {
  businessSlug: string;
  slug: string;
  name: string;
  description?: string;
  channel: CampaignChannel;
  destinationType: DestinationType;
  destinationUrl: string | null;
  enableLanding: boolean;
  status: CampaignStatus;
  branchKey: string | null;
  createdByEmail: string;
  templateKind?: CampaignTemplateKind;
  triggerOffsetDays?: number;
  messageBody?: string;
  offerText?: string;
};

async function main() {
  console.log('🌱 Seeding Flikker OS demo data...\n');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------
  const usersData = [
    {
      email: 'admin@flikker.dev',
      firstName: 'Admin',
      lastName: 'Flikker',
      isPlatformAdmin: true,
    },
    {
      email: 'admin2@flikker.dev',
      firstName: 'Segundo',
      lastName: 'Admin',
      isPlatformAdmin: false,
    },
    {
      email: 'ops@flikker.dev',
      firstName: 'Operador',
      lastName: 'Demo',
      isPlatformAdmin: false,
    },
    {
      email: 'viewer@flikker.dev',
      firstName: 'Viewer',
      lastName: 'Demo',
      isPlatformAdmin: false,
    },
    {
      email: 'estetica@flikker.dev',
      firstName: 'Laura',
      lastName: 'Mendez',
      isPlatformAdmin: false,
    },
    {
      email: 'dental@flikker.dev',
      firstName: 'Carlos',
      lastName: 'Pereira',
      isPlatformAdmin: false,
    },
    {
      email: 'multi@flikker.dev',
      firstName: 'Ana',
      lastName: 'Rodríguez',
      isPlatformAdmin: false,
    },
    {
      email: 'revoked@flikker.dev',
      firstName: 'Ex',
      lastName: 'Empleado',
      isPlatformAdmin: false,
    },
  ];

  const users: Record<
    string,
    Awaited<ReturnType<typeof prisma.user.upsert>>
  > = {};

  console.log('👤 Users');
  for (const data of usersData) {
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: { isPlatformAdmin: data.isPlatformAdmin },
      create: { ...data, passwordHash, isActive: true },
    });
    users[data.email] = user;
    console.log(`  ✓ ${user.email}`);
  }

  // ---------------------------------------------------------------------------
  // Businesses
  // ---------------------------------------------------------------------------
  const businessesData = [
    {
      slug: 'clinica-dental-ejemplo',
      name: 'Clínica Dental Ejemplo',
      legalName: 'Clínica Dental Ejemplo S.R.L.',
      industry: 'health',
      vertical: 'clinic',
      description: 'Clínica odontológica enfocada en pacientes particulares.',
      country: 'UY',
      timezone: 'America/Montevideo',
      currency: 'USD',
      status: BusinessStatus.ACTIVE,
      email: 'contacto@clinicadental.example',
      phone: '+598 99 123 456',
      website: 'https://clinicadental.example',
      logoUrl: 'https://placehold.co/200x200/0077B6/FFF?text=CD',
      primaryColor: '#0077B6',
      secondaryColor: '#FFFFFF',
      toneOfVoice: 'professional',
      whatsappUrl: 'https://wa.me/59899123456',
      shortBio: 'Odontología profesional y cercana en Montevideo.',
      signatureText: 'Equipo Clínica Dental Ejemplo',
      googleBusinessProfileUrl: 'https://g.page/clinica-dental-ejemplo',
      defaultReviewRedirectUrl: 'https://g.page/clinica-dental-ejemplo/review',
    },
    {
      slug: 'centro-estetica-ejemplo',
      name: 'Centro de Estética Ejemplo',
      legalName: 'Centro de Estética Ejemplo S.R.L.',
      industry: 'beauty',
      vertical: 'aesthetics',
      description: 'Centro de estética y tratamientos faciales en Montevideo.',
      country: 'UY',
      timezone: 'America/Montevideo',
      currency: 'USD',
      status: BusinessStatus.ACTIVE,
      email: 'hola@estetica.example',
      phone: '+598 99 555 111',
      website: 'https://estetica.example',
      logoUrl: 'https://placehold.co/200x200/C026D3/FFF?text=CE',
      primaryColor: '#C026D3',
      secondaryColor: '#FDF4FF',
      toneOfVoice: 'warm',
      whatsappUrl: 'https://wa.me/59899555111',
      shortBio: 'Tratamientos estéticos con atención personalizada.',
      signatureText: 'Equipo Centro de Estética Ejemplo',
      googleBusinessProfileUrl: 'https://g.page/centro-estetica-ejemplo',
      defaultReviewRedirectUrl: 'https://g.page/centro-estetica-ejemplo/review',
    },
  ];

  const businesses: Record<
    string,
    Awaited<ReturnType<typeof prisma.business.upsert>>
  > = {};

  console.log('\n🏢 Businesses');
  for (const data of businessesData) {
    const business = await prisma.business.upsert({
      where: { slug: data.slug },
      update: data,
      create: data,
    });
    businesses[data.slug] = business;
    console.log(`  ✓ ${business.name} (${business.slug}) [${business.status}]`);
  }

  // ---------------------------------------------------------------------------
  // Branches
  // ---------------------------------------------------------------------------
  const branchesData = [
    // Clinica Dental Ejemplo — 3 sucursales (Pro permite 10)
    {
      businessSlug: 'clinica-dental-ejemplo',
      slug: 'pocitos',
      name: 'Clinica Dental Pocitos',
      address: 'Av. Brasil 2345, Pocitos',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 99 123 457',
      email: 'pocitos@clinicadental.example',
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      slug: 'carrasco',
      name: 'Clinica Dental Carrasco',
      address: 'Av. Italia 5678, Carrasco',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 99 123 458',
      email: 'carrasco@clinicadental.example',
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      slug: 'punta-carretas',
      name: 'Clinica Dental Punta Carretas',
      address: 'Ellauri 812, Punta Carretas',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 99 123 459',
      email: 'puntacarretas@clinicadental.example',
    },
    // Clínica Centro Estetica — 2 sucursales (Starter permite 3)
    {
      businessSlug: 'centro-estetica-ejemplo',
      slug: 'centro',
      name: 'Centro Estetica Centro',
      address: '18 de Julio 1234, Centro',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 2 900 0001',
      email: 'centro@estetica.example',
    },
    {
      businessSlug: 'centro-estetica-ejemplo',
      slug: 'pocitos',
      name: 'Centro Estetica Pocitos',
      address: 'Bvar. España 2901, Pocitos',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 2 900 0002',
      email: 'pocitos@estetica.example',
    },
    // Centro Estetica — sucursal Ciudad Vieja
    {
      businessSlug: 'centro-estetica-ejemplo',
      slug: 'ciudad-vieja',
      name: 'Centro Estetica Ciudad Vieja',
      address: 'Sarandí 450, Ciudad Vieja',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 99 555 112',
      email: 'ciudadvieja@estetica.example',
    },
    // Clinica Dental Ejemplo — sede adicional
    {
      businessSlug: 'clinica-dental-ejemplo',
      slug: 'sede-principal',
      name: 'Sede Principal',
      address: 'Av. Millán 3200, La Blanqueada',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 2 600 1234',
      email: 'sede@clinicadental.example',
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      slug: 'sayago',
      name: 'Consultorio Sayago',
      address: 'Camino Castro 1560, Sayago',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 2 600 1235',
      email: 'sayago@clinicadental.example',
    },
    // Studio Nómade — sin branches (DRAFT, recién creado)
  ];

  // Key: "businessSlug/branchSlug"
  const branches: Record<
    string,
    Awaited<ReturnType<typeof prisma.branch.upsert>>
  > = {};

  console.log('\n📍 Branches');
  for (const data of branchesData) {
    const business = businesses[data.businessSlug];
    const branchFields = {
      slug: data.slug,
      name: data.name,
      address: data.address,
      city: data.city,
      state: data.state,
      phone: data.phone,
      email: data.email,
    };

    const branch = await prisma.branch.upsert({
      where: {
        businessId_slug: { businessId: business.id, slug: data.slug },
      },
      update: branchFields,
      create: { businessId: business.id, ...branchFields },
    });
    branches[`${data.businessSlug}/${data.slug}`] = branch;
    console.log(`  ✓ ${data.name} → ${business.name}`);
  }

  // ---------------------------------------------------------------------------
  // Memberships
  // ---------------------------------------------------------------------------
  const membershipsData = [
    // Clinica Dental Ejemplo — 5 miembros (Pro permite 15)
    {
      email: 'admin@flikker.dev',
      businessSlug: 'clinica-dental-ejemplo',
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'admin2@flikker.dev',
      businessSlug: 'clinica-dental-ejemplo',
      role: MembershipRole.ADMIN,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'ops@flikker.dev',
      businessSlug: 'clinica-dental-ejemplo',
      role: MembershipRole.OPERATOR,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'multi@flikker.dev',
      businessSlug: 'clinica-dental-ejemplo',
      role: MembershipRole.VIEWER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'revoked@flikker.dev',
      businessSlug: 'clinica-dental-ejemplo',
      role: MembershipRole.OPERATOR,
      status: MembershipStatus.REVOKED,
    },

    // Clínica Centro Estetica — 3 miembros (Starter permite 5)
    {
      email: 'admin@flikker.dev',
      businessSlug: 'centro-estetica-ejemplo',
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'viewer@flikker.dev',
      businessSlug: 'centro-estetica-ejemplo',
      role: MembershipRole.VIEWER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'multi@flikker.dev',
      businessSlug: 'centro-estetica-ejemplo',
      role: MembershipRole.ADMIN,
      status: MembershipStatus.ACTIVE,
    },

    // Centro Estetica — operadores demo
    {
      email: 'estetica@flikker.dev',
      businessSlug: 'centro-estetica-ejemplo',
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'ops@flikker.dev',
      businessSlug: 'centro-estetica-ejemplo',
      role: MembershipRole.OPERATOR,
      status: MembershipStatus.ACTIVE,
    },

    // Clinica Dental Ejemplo — operadores demo
    {
      email: 'dental@flikker.dev',
      businessSlug: 'clinica-dental-ejemplo',
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'multi@flikker.dev',
      businessSlug: 'clinica-dental-ejemplo',
      role: MembershipRole.OPERATOR,
      status: MembershipStatus.ACTIVE,
    },

    // Studio Nómade — 1 miembro (DRAFT, solo el creador)
    {
      email: 'admin@flikker.dev',
      businessSlug: 'centro-estetica-ejemplo',
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
  ];

  console.log('\n🔗 Memberships');
  for (const data of membershipsData) {
    const user = users[data.email];
    const business = businesses[data.businessSlug];

    await prisma.membership.upsert({
      where: {
        userId_businessId: { userId: user.id, businessId: business.id },
      },
      update: { role: data.role, status: data.status },
      create: {
        userId: user.id,
        businessId: business.id,
        role: data.role,
        status: data.status,
      },
    });
    const tag = data.status === MembershipStatus.REVOKED ? ' [REVOKED]' : '';
    console.log(
      `  ✓ ${data.email} → ${data.businessSlug} [${data.role}]${tag}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Plans
  // ---------------------------------------------------------------------------
  const plansData = [
    {
      slug: 'starter',
      name: 'Starter',
      description: 'USD 69/mes, sin setup, incluye 200 mensajes WhatsApp/mes.',
      maxBranches: 3,
      maxMembers: 5,
      maxCampaigns: 5,
      maxReviewsPerMonth: 200,
      priceMonthly: 6900,
      priceUsd: 69,
      currency: 'USD',
      priceAmount: 69,
      setupFeeUsd: 0,
      messageQuotaMonthly: 200,
      trialDays: 0,
      displayOrder: 1,
      isActive: true,
    },
    {
      slug: 'pro',
      name: 'Pro',
      description:
        'USD 129/mes + setup USD 99, incluye 600 mensajes WhatsApp/mes. Asignado a mano por Platform Admin — no lo usa el self-service de Mercado Pago (ver "pro-selfservice").',
      maxBranches: 10,
      maxMembers: 15,
      maxCampaigns: 20,
      maxReviewsPerMonth: 600,
      priceMonthly: 12900,
      priceUsd: 129,
      currency: 'USD',
      priceAmount: 129,
      setupFeeUsd: 99,
      messageQuotaMonthly: 600,
      trialDays: 0,
      displayOrder: 2,
      isActive: true,
    },
    // Self-service (signup/onboarding CHECKIN_V2) — sellos y Beneficios son
    // capacidades independientes (`RetentionSettings.rewardGoalsEnabled`/
    // `benefitsEnabled`), así que un solo plan Free alcanza para cualquier
    // combinación. `maxCustomers` solo importa si los sellos están
    // realmente prendidos (ver `PlansService#canAddParticipant`). Debe
    // existir en toda instalación limpia — ver `PlansRepository#ensureFreePlan`,
    // que hace exactamente este mismo upsert en runtime si por lo que sea no
    // llegó a correr el seed.
    {
      slug: 'free',
      name: 'Free — sellos y beneficios',
      description:
        'Gratis. Hasta 50 clientes participantes, tarjeta de sellos y QR/check-in.',
      maxBranches: 1,
      maxMembers: 2,
      maxCampaigns: 1,
      maxReviewsPerMonth: 20,
      maxCustomers: 50,
      priceMonthly: 0,
      priceUsd: 0,
      currency: 'UYU',
      priceAmount: 0,
      setupFeeUsd: 0,
      messageQuotaMonthly: 0,
      trialDays: 0,
      displayOrder: 0,
      isActive: true,
    },
    // Pro self-service — el que activa Mercado Pago
    // (https://mpago.la/1Acxajh) vía `PlatformService#confirmProSubscription`.
    // Slug DISTINTO de 'pro': ese es el histórico en USD que ya usan
    // negocios reales asignados a mano — pisarlo le cambiaría el precio a
    // Subscriptions que no tienen nada que ver con este flujo. Mismos
    // límites generosos que 'pro' (10 sucursales, sin tope de clientes);
    // la única diferencia real es moneda, precio y cómo se llega a él. Debe
    // existir en toda instalación limpia — ver
    // `PlansRepository#ensureProSelfServicePlan`, mismo upsert en runtime.
    {
      slug: 'pro-selfservice',
      name: 'Pro',
      description:
        'UYU 1.000/mes. Beneficios sin límite de trial, clientes sin tope.',
      maxBranches: 10,
      maxMembers: 15,
      maxCampaigns: 20,
      maxReviewsPerMonth: 600,
      maxCustomers: null,
      priceMonthly: 0,
      priceUsd: 0,
      currency: 'UYU',
      priceAmount: 1000,
      setupFeeUsd: 0,
      messageQuotaMonthly: 600,
      trialDays: 0,
      displayOrder: 3,
      isActive: true,
    },
  ];

  const plans: Record<
    string,
    Awaited<ReturnType<typeof prisma.plan.upsert>>
  > = {};

  console.log('\n📋 Plans');
  await prisma.plan.updateMany({
    where: { slug: { notIn: ['starter', 'pro', 'free', 'pro-selfservice'] } },
    data: { isActive: false },
  });

  for (const data of plansData) {
    const plan = await prisma.plan.upsert({
      where: { slug: data.slug },
      update: data,
      create: data,
    });
    plans[data.slug] = plan;
    console.log(
      `  ✓ ${plan.name} (${plan.slug}) - USD ${plan.priceUsd}/mo, setup USD ${plan.setupFeeUsd}, ${plan.messageQuotaMonthly} messages/mo`,
    );
  }

  // ---------------------------------------------------------------------------
  // Subscriptions (one per business — some businesses intentionally have none)
  // ---------------------------------------------------------------------------
  const now = new Date();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 14);

  const subscriptionsData = [
    {
      businessSlug: 'clinica-dental-ejemplo',
      planSlug: 'pro',
      status: SubscriptionStatus.ACTIVE,
      trialEndsAt: null,
    },
    {
      businessSlug: 'centro-estetica-ejemplo',
      planSlug: 'pro',
      status: SubscriptionStatus.ACTIVE,
      trialEndsAt: null,
    },
  ];

  console.log('\n?? Subscriptions');
  for (const data of subscriptionsData) {
    const business = businesses[data.businessSlug];
    const plan = plans[data.planSlug];

    await prisma.subscription.upsert({
      where: { businessId: business.id },
      update: {
        planId: plan.id,
        status: data.status,
        currentPeriodStart: now,
        currentPeriodEnd: oneMonthLater,
        trialEndsAt: data.trialEndsAt,
      },
      create: {
        businessId: business.id,
        planId: plan.id,
        status: data.status,
        currentPeriodStart: now,
        currentPeriodEnd: oneMonthLater,
        trialEndsAt: data.trialEndsAt,
      },
    });
    const tag = '';
    console.log(`  ✓ ${business.name} → ${plan.name}${tag}`);
  }

  // ---------------------------------------------------------------------------
  // Campaigns
  // ---------------------------------------------------------------------------
  const campaignsData: SeedCampaignData[] = [
    // Clinica Dental Ejemplo — 3 campaigns (Pro allows 20)
    {
      businessSlug: 'clinica-dental-ejemplo',
      slug: 'qr-mostrador-pocitos',
      name: 'QR Mostrador — Pocitos',
      channel: CampaignChannel.QR_COUNTER,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: 'https://g.page/clinica-dental-ejemplo/review',
      enableLanding: true,
      status: CampaignStatus.ACTIVE,
      branchKey: 'clinica-dental-ejemplo/pocitos',
      createdByEmail: 'admin@flikker.dev',
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      slug: 'qr-mesas-carrasco',
      name: 'QR Mesas — Carrasco',
      channel: CampaignChannel.QR_TABLE,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: 'https://g.page/clinica-dental-ejemplo/review',
      enableLanding: false,
      status: CampaignStatus.ACTIVE,
      branchKey: 'clinica-dental-ejemplo/carrasco',
      createdByEmail: 'admin@flikker.dev',
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      slug: 'qr-pausada-pcarretas',
      name: 'Campaña Pausada — Punta Carretas',
      channel: CampaignChannel.QR_COUNTER,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: 'https://g.page/clinica-dental-ejemplo/review',
      enableLanding: false,
      status: CampaignStatus.PAUSED,
      branchKey: 'clinica-dental-ejemplo/punta-carretas',
      createdByEmail: 'admin@flikker.dev',
    },
    // Clínica Centro Estetica — 2 campaigns (Starter allows 5)
    {
      businessSlug: 'centro-estetica-ejemplo',
      slug: 'post-consulta-google',
      name: 'Post-Consulta Google',
      channel: CampaignChannel.QR_CHECKOUT,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: 'https://g.page/centro-estetica-ejemplo/review',
      enableLanding: true,
      status: CampaignStatus.ACTIVE,
      branchKey: 'centro-estetica-ejemplo/centro',
      createdByEmail: 'admin@flikker.dev',
    },
    {
      businessSlug: 'centro-estetica-ejemplo',
      slug: 'bio-instagram',
      name: 'Bio Instagram',
      description: 'Link en bio de Instagram para captar reseñas.',
      channel: CampaignChannel.SOCIAL_BIO,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: 'https://g.page/centro-estetica-ejemplo/review',
      enableLanding: false,
      status: CampaignStatus.ACTIVE,
      branchKey: null, // no branch
      createdByEmail: 'admin@flikker.dev',
    },
    // Centro Estetica — recepcion
    {
      businessSlug: 'centro-estetica-ejemplo',
      slug: 'qr-barra',
      name: 'QR Recepcion Estetica',
      channel: CampaignChannel.QR_COUNTER,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: null, // falls back to business.googleBusinessProfileUrl
      enableLanding: false,
      status: CampaignStatus.ACTIVE,
      branchKey: 'centro-estetica-ejemplo/ciudad-vieja',
      createdByEmail: 'estetica@flikker.dev',
    },
    // Clinica Dental Ejemplo — WhatsApp post-consulta
    {
      businessSlug: 'clinica-dental-ejemplo',
      slug: 'post-consulta-whatsapp',
      name: 'Post-Consulta WhatsApp',
      channel: CampaignChannel.QR_CHECKOUT,
      destinationType: DestinationType.CUSTOM_URL,
      destinationUrl:
        'https://wa.me/59826001234?text=Hola%2C%20quiero%20dejar%20una%20rese%C3%B1a',
      enableLanding: true,
      status: CampaignStatus.ACTIVE,
      branchKey: 'clinica-dental-ejemplo/sede-principal',
      createdByEmail: 'dental@flikker.dev',
    },
    ...['clinica-dental-ejemplo', 'centro-estetica-ejemplo'].flatMap(
      (businessSlug) => [
        {
          businessSlug,
          slug: 'repeat-post-service',
          name: 'Repeat: post-servicio',
          description: 'Mensaje automatico luego de la ultima atencion.',
          channel: CampaignChannel.WHATSAPP,
          destinationType: DestinationType.LANDING_ONLY,
          destinationUrl: null,
          enableLanding: false,
          status: CampaignStatus.ACTIVE,
          branchKey: null,
          createdByEmail: 'admin@flikker.dev',
          templateKind: CampaignTemplateKind.post_service,
          triggerOffsetDays: 30,
          messageBody:
            'Hola {nombre}, soy {clinica}. Ya pasaron unos dias desde tu ultima visita. {oferta}',
          offerText: '',
        },
        {
          businessSlug,
          slug: 'repeat-reactivation',
          name: 'Repeat: reactivacion',
          description: 'Mensaje para pacientes sin contacto reciente.',
          channel: CampaignChannel.WHATSAPP,
          destinationType: DestinationType.LANDING_ONLY,
          destinationUrl: null,
          enableLanding: false,
          status: CampaignStatus.ACTIVE,
          branchKey: null,
          createdByEmail: 'admin@flikker.dev',
          templateKind: CampaignTemplateKind.reactivation,
          triggerOffsetDays: 180,
          messageBody:
            'Hola {nombre}, te escribe {clinica}. Hace tiempo que no te vemos. {oferta}',
          offerText: '',
        },
        {
          businessSlug,
          slug: 'repeat-birthday',
          name: 'Repeat: cumpleanos',
          description: 'Saludo automatico de cumpleanos.',
          channel: CampaignChannel.WHATSAPP,
          destinationType: DestinationType.LANDING_ONLY,
          destinationUrl: null,
          enableLanding: false,
          status: CampaignStatus.ACTIVE,
          branchKey: null,
          createdByEmail: 'admin@flikker.dev',
          templateKind: CampaignTemplateKind.birthday,
          triggerOffsetDays: 0,
          messageBody: 'Feliz cumple, {nombre}! Te saluda {clinica}. {oferta}',
          offerText: '',
        },
      ],
    ),
  ];

  const campaigns: Record<
    string,
    Awaited<ReturnType<typeof prisma.campaign.upsert>>
  > = {};

  console.log('\n📢 Campaigns');
  for (const data of campaignsData) {
    const business = businesses[data.businessSlug];
    const branch = data.branchKey ? branches[data.branchKey] : null;
    const createdBy = users[data.createdByEmail];

    const campaign = await prisma.campaign.upsert({
      where: {
        businessId_slug: { businessId: business.id, slug: data.slug },
      },
      update: {
        branchId: branch?.id ?? null,
        name: data.name,
        description: data.description ?? null,
        channel: data.channel,
        destinationType: data.destinationType,
        destinationUrl: data.destinationUrl ?? null,
        enableLanding: data.enableLanding,
        status: data.status,
        createdByUserId: createdBy.id,
        templateKind: data.templateKind ?? null,
        triggerOffsetDays: data.triggerOffsetDays ?? null,
        messageBody: data.messageBody ?? null,
        offerText: data.offerText ?? null,
      },
      create: {
        businessId: business.id,
        branchId: branch?.id ?? null,
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        channel: data.channel,
        destinationType: data.destinationType,
        destinationUrl: data.destinationUrl ?? null,
        enableLanding: data.enableLanding,
        status: data.status,
        createdByUserId: createdBy.id,
        templateKind: data.templateKind ?? null,
        triggerOffsetDays: data.triggerOffsetDays ?? null,
        messageBody: data.messageBody ?? null,
        offerText: data.offerText ?? null,
      },
    });
    // Key: "businessSlug/campaignSlug"
    campaigns[`${data.businessSlug}/${data.slug}`] = campaign;
    const tag =
      data.status !== CampaignStatus.ACTIVE ? ` [${data.status}]` : '';
    console.log(`  ✓ ${data.name} → ${business.name}${tag}`);
  }

  // ---------------------------------------------------------------------------
  // QR Codes
  // ---------------------------------------------------------------------------
  const qrCodesData = [
    // Clinica Dental — QR Mostrador Pocitos (landing: true)
    {
      campaignKey: 'clinica-dental-ejemplo/qr-mostrador-pocitos',
      slug: 'gMp_Caja1',
      label: 'Caja',
    },
    {
      campaignKey: 'clinica-dental-ejemplo/qr-mostrador-pocitos',
      slug: 'gMpRecep1',
      label: 'Recepción',
    },
    // Clinica Dental — QR Mesas Carrasco (landing: false)
    {
      campaignKey: 'clinica-dental-ejemplo/qr-mesas-carrasco',
      slug: 'gMcMesa01',
      label: 'Mesa 1',
    },
    {
      campaignKey: 'clinica-dental-ejemplo/qr-mesas-carrasco',
      slug: 'gMcMesa02',
      label: 'Mesa 2',
    },
    {
      campaignKey: 'clinica-dental-ejemplo/qr-mesas-carrasco',
      slug: 'gMcMesa03',
      label: 'Mesa 3',
    },
    // Clinica Dental — Campaña pausada
    {
      campaignKey: 'clinica-dental-ejemplo/qr-pausada-pcarretas',
      slug: 'gPpMostr1',
      label: 'Mostrador',
    },
    // Clínica Centro Estetica — Post-Consulta (landing: true)
    {
      campaignKey: 'centro-estetica-ejemplo/post-consulta-google',
      slug: 'cDpRecep1',
      label: 'Recepción Centro',
    },
    // Clínica Centro Estetica — Bio Instagram (landing: false)
    {
      campaignKey: 'centro-estetica-ejemplo/bio-instagram',
      slug: 'cDbLinBi1',
      label: 'Link Bio',
    },
    // Centro Estetica — QR recepcion
    {
      campaignKey: 'centro-estetica-ejemplo/qr-barra',
      slug: 'cBqBarra1',
      label: 'Recepcion',
    },
    // Clinica Dental Ejemplo — Post-Consulta WhatsApp (landing: true)
    {
      campaignKey: 'clinica-dental-ejemplo/post-consulta-whatsapp',
      slug: 'vSpCons01',
      label: 'Consultorio 1',
    },
  ];

  const qrCodes: Record<
    string,
    Awaited<ReturnType<typeof prisma.qrCode.upsert>>
  > = {};

  console.log('\n📱 QR Codes');
  for (const data of qrCodesData) {
    const campaign = campaigns[data.campaignKey];
    const business = businesses[data.campaignKey.split('/')[0]];

    const qrCode = await prisma.qrCode.upsert({
      where: { slug: data.slug },
      update: {
        businessId: business.id,
        campaignId: campaign.id,
        label: data.label,
      },
      create: {
        businessId: business.id,
        campaignId: campaign.id,
        branchId: campaign.branchId,
        slug: data.slug,
        label: data.label,
      },
    });
    qrCodes[data.slug] = qrCode;
    console.log(`  ✓ ${data.label} (${data.slug}) → ${campaign.name}`);
  }

  // ---------------------------------------------------------------------------
  // Scan Events — realistic demo data for the last 14 days
  // ---------------------------------------------------------------------------
  const DEVICES = ['mobile', 'mobile', 'mobile', 'desktop', 'tablet'] as const;
  const USER_AGENTS: Record<string, string> = {
    mobile:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    desktop:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    tablet:
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  };
  const REFERERS = [null, 'https://instagram.com', 'https://google.com', null];

  function randomIpHash(seed: number): string {
    const hex = seed.toString(16).padStart(16, '0').slice(0, 16);
    return hex;
  }

  // Define scan distribution per QR slug
  const scanDistribution: {
    slug: string;
    scansPerDay: number;
    uniqueRatio: number;
  }[] = [
    // Clinica Dental Pocitos — high traffic (landing shown)
    { slug: 'gMp_Caja1', scansPerDay: 6, uniqueRatio: 0.8 },
    { slug: 'gMpRecep1', scansPerDay: 4, uniqueRatio: 0.75 },
    // Clinica Dental Carrasco mesas — moderate (direct redirect)
    { slug: 'gMcMesa01', scansPerDay: 3, uniqueRatio: 0.7 },
    { slug: 'gMcMesa02', scansPerDay: 2, uniqueRatio: 0.65 },
    { slug: 'gMcMesa03', scansPerDay: 1, uniqueRatio: 0.6 },
    // Centro Estetica — moderate (landing shown)
    { slug: 'cDpRecep1', scansPerDay: 3, uniqueRatio: 0.85 },
    // Centro Estetica Bio — low
    { slug: 'cDbLinBi1', scansPerDay: 2, uniqueRatio: 0.9 },
    // Centro Estetica — low
    { slug: 'cBqBarra1', scansPerDay: 2, uniqueRatio: 0.7 },
    // Dental — low (landing shown)
    { slug: 'vSpCons01', scansPerDay: 1, uniqueRatio: 0.9 },
  ];

  // Delete existing demo scan events to keep idempotent
  const allDemoQrIds = Object.values(qrCodes).map((q) => q.id);
  await prisma.scanEvent.deleteMany({
    where: { qrCodeId: { in: allDemoQrIds } },
  });

  // Reset scannedCount for demo QR codes
  await prisma.qrCode.updateMany({
    where: { id: { in: allDemoQrIds } },
    data: { scannedCount: 0, lastScannedAt: null },
  });

  console.log('\n📊 Scan Events');
  let totalEvents = 0;

  for (const dist of scanDistribution) {
    const qr = qrCodes[dist.slug];
    const campaign =
      campaigns[
        Object.keys(campaigns).find((k) => campaigns[k].id === qr.campaignId)!
      ];

    let qrScanCount = 0;
    let lastScannedAt: Date | null = null;

    for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
      const baseDate = new Date(now);
      baseDate.setDate(baseDate.getDate() - dayOffset);
      baseDate.setHours(9, 0, 0, 0);

      // Slight daily variation: ±30%
      const variation = 0.7 + Math.random() * 0.6;
      const dailyScans = Math.max(1, Math.round(dist.scansPerDay * variation));

      for (let s = 0; s < dailyScans; s++) {
        const minuteOffset = Math.floor(Math.random() * 600); // across 10 hours
        const scannedAt = new Date(baseDate.getTime() + minuteOffset * 60000);
        const ipSeed = dayOffset * 100 + s;
        const isDuplicate = Math.random() > dist.uniqueRatio;
        const deviceIdx = (dayOffset + s) % DEVICES.length;
        const device = DEVICES[deviceIdx];
        const referer =
          REFERERS[(dayOffset + s) % REFERERS.length] ?? undefined;

        await prisma.scanEvent.create({
          data: {
            qrCodeId: qr.id,
            campaignId: campaign.id,
            businessId: qr.businessId,
            branchId: qr.branchId,
            ipHash: randomIpHash(ipSeed),
            userAgent: USER_AGENTS[device],
            referer,
            deviceType: device,
            redirectedTo:
              campaign.destinationUrl ?? 'https://g.page/fallback/review',
            landingShown: campaign.enableLanding,
            isDuplicate,
            scannedAt,
          },
        });

        qrScanCount++;
        lastScannedAt = scannedAt;
      }
    }

    // Update QR counters
    await prisma.qrCode.update({
      where: { id: qr.id },
      data: { scannedCount: qrScanCount, lastScannedAt },
    });

    totalEvents += qrScanCount;
    console.log(
      `  ✓ ${dist.slug} (${qr.label}) — ${qrScanCount} events over 14 days`,
    );
  }

  console.log(`  → Total: ${totalEvents} scan events`);

  // ---------------------------------------------------------------------------
  // Review Tags
  // ---------------------------------------------------------------------------
  const tagsData = [
    {
      businessSlug: 'clinica-dental-ejemplo',
      tags: [
        { name: 'Servicio', slug: 'servicio', color: '#22C55E' },
        { name: 'Limpieza', slug: 'limpieza', color: '#3B82F6' },
        { name: 'Atención', slug: 'atencion', color: '#F59E0B' },
        { name: 'Precio', slug: 'precio', color: '#EF4444' },
      ],
    },
    {
      businessSlug: 'centro-estetica-ejemplo',
      tags: [
        { name: 'Puntualidad', slug: 'puntualidad', color: '#8B5CF6' },
        { name: 'Trato médico', slug: 'trato-medico', color: '#06B6D4' },
      ],
    },
    {
      businessSlug: 'centro-estetica-ejemplo',
      tags: [
        { name: 'Calidad', slug: 'calidad', color: '#92400E' },
        { name: 'Ambiente', slug: 'ambiente', color: '#D97706' },
      ],
    },
  ];

  const reviewTags: Record<
    string,
    Awaited<ReturnType<typeof prisma.reviewTag.upsert>>
  > = {};

  console.log('\n🏷️  Review Tags');
  for (const group of tagsData) {
    const business = businesses[group.businessSlug];
    for (const tag of group.tags) {
      const created = await prisma.reviewTag.upsert({
        where: {
          businessId_slug: { businessId: business.id, slug: tag.slug },
        },
        update: {},
        create: {
          businessId: business.id,
          name: tag.name,
          slug: tag.slug,
          color: tag.color,
        },
      });
      reviewTags[`${group.businessSlug}/${tag.slug}`] = created;
      console.log(`  ✓ ${tag.name} → ${business.name}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Reviews
  // ---------------------------------------------------------------------------

  const reviewsData = [
    // --- Clinica Dental Ejemplo: 10 reviews across branches and campaigns ---
    {
      businessSlug: 'clinica-dental-ejemplo',
      branchKey: 'clinica-dental-ejemplo/pocitos',
      campaignKey: 'clinica-dental-ejemplo/qr-mostrador-pocitos',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-gains-001',
      authorDisplayName: 'María Pérez',
      rating: 5,
      content:
        'Excelente gimnasio, las clases de funcional son increíbles. El equipo siempre atento.',
      reviewedAt: '2026-03-15T10:00:00Z',
      status: ReviewStatus.NEW,
      isHighlighted: true,
      tagSlugs: ['servicio', 'atencion'],
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      branchKey: 'clinica-dental-ejemplo/pocitos',
      campaignKey: 'clinica-dental-ejemplo/qr-mostrador-pocitos',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-gains-002',
      authorDisplayName: 'Juan López',
      rating: 4,
      content:
        'Muy buen lugar para entrenar. A veces se llena mucho en horarios pico.',
      reviewedAt: '2026-03-18T14:30:00Z',
      status: ReviewStatus.REVIEWED,
      tagSlugs: ['servicio'],
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      branchKey: 'clinica-dental-ejemplo/carrasco',
      campaignKey: null,
      source: ReviewSource.MANUAL,
      externalReviewId: null,
      authorDisplayName: 'Lucía Fernández',
      rating: 3,
      content:
        'Está bien, pero los vestuarios podrían estar más limpios. Las máquinas están en buen estado.',
      reviewedAt: '2026-03-20T09:15:00Z',
      status: ReviewStatus.REVIEWED,
      requiresAttention: true,
      tagSlugs: ['limpieza'],
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      branchKey: 'clinica-dental-ejemplo/pocitos',
      campaignKey: 'clinica-dental-ejemplo/qr-mostrador-pocitos',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-gains-003',
      authorDisplayName: 'Pedro García',
      rating: 1,
      content:
        'Pésima experiencia. Me cobraron de más y nadie supo resolver el problema.',
      reviewedAt: '2026-03-22T16:00:00Z',
      status: ReviewStatus.REVIEWED,
      requiresAttention: true,
      tagSlugs: ['precio', 'atencion'],
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      branchKey: 'clinica-dental-ejemplo/carrasco',
      campaignKey: 'clinica-dental-ejemplo/qr-mesas-carrasco',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-gains-004',
      authorDisplayName: 'Ana Martínez',
      rating: 5,
      content: 'Amo entrenar acá. Profes geniales y muy buena onda.',
      reviewedAt: '2026-03-24T11:00:00Z',
      status: ReviewStatus.NEW,
      isHighlighted: true,
      tagSlugs: ['servicio', 'atencion'],
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      branchKey: 'clinica-dental-ejemplo/pocitos',
      campaignKey: null,
      source: ReviewSource.MANUAL,
      externalReviewId: null,
      authorDisplayName: 'Roberto Silva',
      rating: 2,
      content:
        'Los horarios cambian sin aviso. Fui dos veces y estaba cerrado.',
      reviewedAt: '2026-03-25T08:30:00Z',
      status: ReviewStatus.NEW,
      requiresAttention: true,
      tagSlugs: ['servicio'],
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      branchKey: 'clinica-dental-ejemplo/carrasco',
      campaignKey: null,
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-gains-005',
      authorDisplayName: 'Valentina Rodríguez',
      rating: 4,
      content:
        'Muy buena relación calidad-precio. Las instalaciones están bien mantenidas.',
      reviewedAt: '2026-03-26T13:45:00Z',
      status: ReviewStatus.NEW,
      tagSlugs: ['precio'],
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      branchKey: 'clinica-dental-ejemplo/pocitos',
      campaignKey: 'clinica-dental-ejemplo/qr-mostrador-pocitos',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-gains-006',
      authorDisplayName: 'Diego Suárez',
      rating: 5,
      content:
        'El mejor gym de Montevideo. Desde que empecé no lo cambio por nada.',
      reviewedAt: '2026-03-27T17:20:00Z',
      status: ReviewStatus.NEW,
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      branchKey: null,
      campaignKey: null,
      source: ReviewSource.WHATSAPP_FEEDBACK,
      externalReviewId: null,
      authorDisplayName: 'Camila Torres',
      rating: 3,
      content: 'Regular. El aire acondicionado a veces no funciona.',
      reviewedAt: '2026-03-28T10:00:00Z',
      status: ReviewStatus.ARCHIVED,
      tagSlugs: ['limpieza'],
    },
    {
      businessSlug: 'clinica-dental-ejemplo',
      branchKey: 'clinica-dental-ejemplo/pocitos',
      campaignKey: null,
      source: ReviewSource.MANUAL,
      externalReviewId: null,
      authorDisplayName: 'Martín Acosta',
      rating: 4,
      content: 'Buenas clases grupales. Los profes motivan mucho.',
      reviewedAt: '2026-03-29T15:00:00Z',
      status: ReviewStatus.NEW,
      tagSlugs: ['servicio'],
    },

    // --- Clínica Centro Estetica: 5 reviews ---
    {
      businessSlug: 'centro-estetica-ejemplo',
      branchKey: 'centro-estetica-ejemplo/centro',
      campaignKey: 'centro-estetica-ejemplo/post-consulta-google',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-delta-001',
      authorDisplayName: 'Laura Méndez',
      rating: 5,
      content:
        'Excelente atención del Dr. Rodríguez. Muy profesional y empático.',
      reviewedAt: '2026-03-10T09:00:00Z',
      status: ReviewStatus.NEW,
      isHighlighted: true,
      tagSlugs: ['trato-medico'],
    },
    {
      businessSlug: 'centro-estetica-ejemplo',
      branchKey: 'centro-estetica-ejemplo/centro',
      campaignKey: 'centro-estetica-ejemplo/post-consulta-google',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-delta-002',
      authorDisplayName: 'Fernando Costa',
      rating: 2,
      content: 'Esperé más de una hora para ser atendido. Inaceptable.',
      reviewedAt: '2026-03-14T11:30:00Z',
      status: ReviewStatus.REVIEWED,
      requiresAttention: true,
      tagSlugs: ['puntualidad'],
    },
    {
      businessSlug: 'centro-estetica-ejemplo',
      branchKey: 'centro-estetica-ejemplo/pocitos',
      campaignKey: null,
      source: ReviewSource.MANUAL,
      externalReviewId: null,
      authorDisplayName: 'Sofía Ramírez',
      rating: 4,
      content:
        'Buena clínica, instalaciones modernas. El estacionamiento es complicado.',
      reviewedAt: '2026-03-19T14:00:00Z',
      status: ReviewStatus.NEW,
    },
    {
      businessSlug: 'centro-estetica-ejemplo',
      branchKey: 'centro-estetica-ejemplo/centro',
      campaignKey: 'centro-estetica-ejemplo/post-consulta-google',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-delta-003',
      authorDisplayName: 'Andrés Vidal',
      rating: 5,
      content: 'Muy conforme con todo. Personal amable y turnos puntuales.',
      reviewedAt: '2026-03-23T16:00:00Z',
      status: ReviewStatus.REVIEWED,
      tagSlugs: ['puntualidad', 'trato-medico'],
    },
    {
      businessSlug: 'centro-estetica-ejemplo',
      branchKey: 'centro-estetica-ejemplo/pocitos',
      campaignKey: null,
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-delta-004',
      authorDisplayName: 'Marina Sosa',
      rating: 3,
      content: 'La consulta estuvo bien, pero sentí que fue muy apurada.',
      reviewedAt: '2026-03-27T10:30:00Z',
      status: ReviewStatus.NEW,
      tagSlugs: ['trato-medico'],
    },

    // --- Centro Estetica Ejemplo: 3 additional reviews ---
    {
      businessSlug: 'centro-estetica-ejemplo',
      branchKey: 'centro-estetica-ejemplo/ciudad-vieja',
      campaignKey: 'centro-estetica-ejemplo/qr-barra',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-estetica-001',
      authorDisplayName: 'Ignacio Duarte',
      rating: 5,
      content:
        'Excelente tratamiento facial. El lugar es tranquilo y el equipo muy atento.',
      reviewedAt: '2026-03-12T09:30:00Z',
      status: ReviewStatus.NEW,
      isHighlighted: true,
      tagSlugs: ['calidad', 'ambiente'],
    },
    {
      businessSlug: 'centro-estetica-ejemplo',
      branchKey: 'centro-estetica-ejemplo/ciudad-vieja',
      campaignKey: null,
      source: ReviewSource.MANUAL,
      externalReviewId: null,
      authorDisplayName: 'Carolina Vega',
      rating: 4,
      content: 'Muy buena experiencia. El espacio es chico pero muy cuidado.',
      reviewedAt: '2026-03-20T11:00:00Z',
      status: ReviewStatus.NEW,
      tagSlugs: ['calidad'],
    },
    {
      businessSlug: 'centro-estetica-ejemplo',
      branchKey: 'centro-estetica-ejemplo/ciudad-vieja',
      campaignKey: 'centro-estetica-ejemplo/qr-barra',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-estetica-002',
      authorDisplayName: 'Tomás Herrera',
      rating: 3,
      content:
        'Buen servicio, aunque los precios son un poco altos para el tratamiento.',
      reviewedAt: '2026-03-25T15:00:00Z',
      status: ReviewStatus.NEW,
    },
  ];

  console.log('\n⭐ Reviews');

  // Clean up existing seed reviews to ensure idempotency
  // (reviews without externalReviewId can't be upserted)
  for (const slug of ['clinica-dental-ejemplo', 'centro-estetica-ejemplo']) {
    const biz = businesses[slug];
    await prisma.reviewStatusHistory.deleteMany({
      where: { review: { businessId: biz.id } },
    });
    await prisma.reviewTagRelation.deleteMany({
      where: { review: { businessId: biz.id } },
    });
    await prisma.review.deleteMany({ where: { businessId: biz.id } });
  }

  let reviewCount = 0;
  const createdReviews: Array<{
    slug: string;
    review: Awaited<ReturnType<typeof prisma.review.create>>;
  }> = [];

  for (const r of reviewsData) {
    const business = businesses[r.businessSlug];
    const branch = r.branchKey ? branches[r.branchKey] : null;
    const campaign = r.campaignKey ? campaigns[r.campaignKey] : null;
    const createdBy = users['admin@flikker.dev'];

    const review = await prisma.review.create({
      data: {
        businessId: business.id,
        branchId: branch?.id ?? null,
        campaignId: campaign?.id ?? null,
        source: r.source,
        externalReviewId: r.externalReviewId ?? null,
        authorDisplayName: r.authorDisplayName,
        rating: r.rating,
        content: r.content,
        reviewedAt: new Date(r.reviewedAt),
        status: r.status,
        isHighlighted: r.isHighlighted ?? false,
        createdByUserId: createdBy.id,
        ...(r.status === ReviewStatus.ARCHIVED
          ? { archivedAt: new Date() }
          : {}),
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: r.status,
            changedByUserId: createdBy.id,
          },
        },
      },
    });

    createdReviews.push({ slug: r.businessSlug, review });

    // Assign tags
    if (r.tagSlugs) {
      for (const tagSlug of r.tagSlugs) {
        const tag = reviewTags[`${r.businessSlug}/${tagSlug}`];
        if (tag) {
          await prisma.reviewTagRelation.create({
            data: { reviewId: review.id, tagId: tag.id },
          });
        }
      }
    }

    reviewCount++;
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    console.log(
      `  ✓ ${stars} ${r.authorDisplayName} → ${business.name} [${r.status}]`,
    );
  }

  console.log(`  → Total: ${reviewCount} reviews`);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\nSeed complete.\n');
  console.log('Demo tenants:');
  console.log(
    '  Clinica Dental Ejemplo -> Pro, USD 129/mo, setup USD 99, 600 messages/mo',
  );
  console.log(
    '  Centro de Estetica Ejemplo -> Pro, USD 129/mo, setup USD 99, 600 messages/mo',
  );
  console.log('Active plans:');
  console.log('  Starter -> USD 69/mo, setup USD 0, 200 messages/mo');
  console.log('  Pro -> USD 129/mo, setup USD 99, 600 messages/mo');
  console.log('Demo credentials: all use password Flikker2026!');
  console.log(
    `Seeded ${totalEvents} scan events, ${reviewCount} reviews and ${Object.keys(reviewTags).length} tags.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
