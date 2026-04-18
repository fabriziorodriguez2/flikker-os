/**
 * Seed — Flikker OS demo data
 *
 * Idempotent: usa upsert en todas las entidades.
 * Ejecutar: npm run seed (desde apps/api)
 *
 * Usuarios creados:
 *   admin@flikker.dev    / Flikker2026!  — OWNER en Gains + Delta  [PLATFORM ADMIN]
 *   admin2@flikker.dev   / Flikker2026!  — ADMIN en Gains
 *   ops@flikker.dev      / Flikker2026!  — OPERATOR en Gains
 *   viewer@flikker.dev   / Flikker2026!  — VIEWER en Delta
 *   cafe@flikker.dev     / Flikker2026!  — OWNER en Café Brava (Free)
 *   vet@flikker.dev      / Flikker2026!  — OWNER en Veterinaria San Roque (Trial)
 *   multi@flikker.dev    / Flikker2026!  — ADMIN en Delta + OPERATOR en Vet
 *   revoked@flikker.dev  / Flikker2026!  — REVOKED en Gains
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
  DestinationType,
  ReviewSource,
  ReviewStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'Flikker2026!';

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
      email: 'cafe@flikker.dev',
      firstName: 'Laura',
      lastName: 'Méndez',
      isPlatformAdmin: false,
    },
    {
      email: 'vet@flikker.dev',
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
      slug: 'gains-montevideo',
      name: 'Gains Montevideo',
      legalName: 'Gains Fitness Uruguay S.A.',
      industry: 'fitness',
      description:
        'Cadena de gimnasios en Montevideo enfocada en entrenamiento funcional.',
      country: 'UY',
      timezone: 'America/Montevideo',
      currency: 'UYU',
      status: BusinessStatus.ACTIVE,
      email: 'contacto@gains.uy',
      phone: '+598 99 123 456',
      website: 'https://gains.uy',
      logoUrl: 'https://placehold.co/200x200/FF6B00/FFF?text=GAINS',
      primaryColor: '#FF6B00',
      secondaryColor: '#1A1A1A',
      toneOfVoice: 'friendly',
      whatsappUrl: 'https://wa.me/59899123456',
      shortBio:
        'Tu gimnasio funcional en Montevideo. Entrenamiento real, resultados reales.',
      signatureText: 'Equipo Gains Montevideo',
      googleBusinessProfileUrl: 'https://g.page/gains-montevideo',
      defaultReviewRedirectUrl: 'https://g.page/gains-montevideo/review',
    },
    {
      slug: 'clinica-delta',
      name: 'Clínica Delta',
      legalName: 'Delta Salud S.R.L.',
      industry: 'health',
      description: 'Centro médico multidisciplinario en Montevideo.',
      country: 'UY',
      timezone: 'America/Montevideo',
      currency: 'UYU',
      status: BusinessStatus.ACTIVE,
      email: 'info@clinicadelta.uy',
      phone: '+598 2 900 0000',
      website: 'https://clinicadelta.uy',
      logoUrl: 'https://placehold.co/200x200/0077B6/FFF?text=DELTA',
      primaryColor: '#0077B6',
      secondaryColor: '#FFFFFF',
      toneOfVoice: 'professional',
      whatsappUrl: 'https://wa.me/59829000000',
      shortBio:
        'Centro médico multidisciplinario. Tu salud, nuestra prioridad.',
      signatureText: 'Clínica Delta — Equipo Médico',
      googleBusinessProfileUrl: 'https://g.page/clinica-delta',
      defaultReviewRedirectUrl: 'https://g.page/clinica-delta/review',
    },
    {
      slug: 'cafe-brava',
      name: 'Café Brava',
      legalName: 'Brava Gastronomía S.R.L.',
      industry: 'gastronomy',
      description: 'Café de especialidad en el corazón de Ciudad Vieja.',
      country: 'UY',
      timezone: 'America/Montevideo',
      currency: 'UYU',
      status: BusinessStatus.ACTIVE,
      email: 'hola@cafebrava.uy',
      phone: '+598 99 555 111',
      website: null,
      primaryColor: '#8B4513',
      secondaryColor: '#F5F0E8',
      toneOfVoice: 'casual',
      shortBio: 'Café de especialidad con granos tostados en Montevideo.',
      signatureText: 'Laura — Café Brava',
    },
    {
      slug: 'veterinaria-san-roque',
      name: 'Veterinaria San Roque',
      legalName: 'San Roque Veterinaria S.A.',
      industry: 'veterinary',
      description:
        'Clínica veterinaria integral con servicio de urgencias 24h.',
      country: 'UY',
      timezone: 'America/Montevideo',
      currency: 'UYU',
      status: BusinessStatus.ACTIVE,
      email: 'contacto@sanroque.vet',
      phone: '+598 2 600 1234',
      website: 'https://sanroque.vet',
      logoUrl: 'https://placehold.co/200x200/2D6A4F/FFF?text=SR',
      primaryColor: '#2D6A4F',
      secondaryColor: '#D8F3DC',
      toneOfVoice: 'empathetic',
      whatsappUrl: 'https://wa.me/59826001234',
      shortBio: 'Cuidamos a tu mascota como si fuera nuestra. Urgencias 24h.',
      signatureText: 'Dr. Carlos Pereira — Veterinaria San Roque',
    },
    {
      slug: 'studio-nomade',
      name: 'Studio Nómade',
      legalName: null,
      industry: 'coworking',
      description: 'Espacio de coworking para creativos y freelancers.',
      country: 'UY',
      timezone: 'America/Montevideo',
      currency: 'UYU',
      status: BusinessStatus.DRAFT,
      email: 'info@studionomade.uy',
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
      update: {},
      create: data,
    });
    businesses[data.slug] = business;
    console.log(`  ✓ ${business.name} (${business.slug}) [${business.status}]`);
  }

  // ---------------------------------------------------------------------------
  // Branches
  // ---------------------------------------------------------------------------
  const branchesData = [
    // Gains Montevideo — 3 sucursales (Pro permite 10)
    {
      businessSlug: 'gains-montevideo',
      slug: 'pocitos',
      name: 'Gains Pocitos',
      address: 'Av. Brasil 2345, Pocitos',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 99 123 457',
      email: 'pocitos@gains.uy',
    },
    {
      businessSlug: 'gains-montevideo',
      slug: 'carrasco',
      name: 'Gains Carrasco',
      address: 'Av. Italia 5678, Carrasco',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 99 123 458',
      email: 'carrasco@gains.uy',
    },
    {
      businessSlug: 'gains-montevideo',
      slug: 'punta-carretas',
      name: 'Gains Punta Carretas',
      address: 'Ellauri 812, Punta Carretas',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 99 123 459',
      email: 'puntacarretas@gains.uy',
    },
    // Clínica Delta — 2 sucursales (Starter permite 3)
    {
      businessSlug: 'clinica-delta',
      slug: 'centro',
      name: 'Delta Centro',
      address: '18 de Julio 1234, Centro',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 2 900 0001',
      email: 'centro@clinicadelta.uy',
    },
    {
      businessSlug: 'clinica-delta',
      slug: 'pocitos',
      name: 'Delta Pocitos',
      address: 'Bvar. España 2901, Pocitos',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 2 900 0002',
      email: 'pocitos@clinicadelta.uy',
    },
    // Café Brava — 1 sucursal (Free máx = 1, AL LÍMITE)
    {
      businessSlug: 'cafe-brava',
      slug: 'ciudad-vieja',
      name: 'Brava Ciudad Vieja',
      address: 'Sarandí 450, Ciudad Vieja',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 99 555 112',
      email: 'hola@cafebrava.uy',
    },
    // Veterinaria San Roque — 2 sucursales (Starter trial permite 3)
    {
      businessSlug: 'veterinaria-san-roque',
      slug: 'sede-principal',
      name: 'Sede Principal',
      address: 'Av. Millán 3200, La Blanqueada',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 2 600 1234',
      email: 'contacto@sanroque.vet',
    },
    {
      businessSlug: 'veterinaria-san-roque',
      slug: 'sayago',
      name: 'Consultorio Sayago',
      address: 'Camino Castro 1560, Sayago',
      city: 'Montevideo',
      state: 'Montevideo',
      phone: '+598 2 600 1235',
      email: 'sayago@sanroque.vet',
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
    const { businessSlug: _, ...branchFields } = data;

    const branch = await prisma.branch.upsert({
      where: {
        businessId_slug: { businessId: business.id, slug: data.slug },
      },
      update: {},
      create: { businessId: business.id, ...branchFields },
    });
    branches[`${data.businessSlug}/${data.slug}`] = branch;
    console.log(`  ✓ ${data.name} → ${business.name}`);
  }

  // ---------------------------------------------------------------------------
  // Memberships
  // ---------------------------------------------------------------------------
  const membershipsData = [
    // Gains Montevideo — 5 miembros (Pro permite 15)
    {
      email: 'admin@flikker.dev',
      businessSlug: 'gains-montevideo',
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'admin2@flikker.dev',
      businessSlug: 'gains-montevideo',
      role: MembershipRole.ADMIN,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'ops@flikker.dev',
      businessSlug: 'gains-montevideo',
      role: MembershipRole.OPERATOR,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'multi@flikker.dev',
      businessSlug: 'gains-montevideo',
      role: MembershipRole.VIEWER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'revoked@flikker.dev',
      businessSlug: 'gains-montevideo',
      role: MembershipRole.OPERATOR,
      status: MembershipStatus.REVOKED,
    },

    // Clínica Delta — 3 miembros (Starter permite 5)
    {
      email: 'admin@flikker.dev',
      businessSlug: 'clinica-delta',
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'viewer@flikker.dev',
      businessSlug: 'clinica-delta',
      role: MembershipRole.VIEWER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'multi@flikker.dev',
      businessSlug: 'clinica-delta',
      role: MembershipRole.ADMIN,
      status: MembershipStatus.ACTIVE,
    },

    // Café Brava — 2 miembros (Free máx = 2, AL LÍMITE)
    {
      email: 'cafe@flikker.dev',
      businessSlug: 'cafe-brava',
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'ops@flikker.dev',
      businessSlug: 'cafe-brava',
      role: MembershipRole.OPERATOR,
      status: MembershipStatus.ACTIVE,
    },

    // Veterinaria San Roque — 2 miembros (Starter trial permite 5)
    {
      email: 'vet@flikker.dev',
      businessSlug: 'veterinaria-san-roque',
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    {
      email: 'multi@flikker.dev',
      businessSlug: 'veterinaria-san-roque',
      role: MembershipRole.OPERATOR,
      status: MembershipStatus.ACTIVE,
    },

    // Studio Nómade — 1 miembro (DRAFT, solo el creador)
    {
      email: 'admin@flikker.dev',
      businessSlug: 'studio-nomade',
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
      update: { status: data.status },
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
      slug: 'free',
      name: 'Free',
      description: 'Para probar la plataforma sin compromiso.',
      maxBranches: 1,
      maxMembers: 2,
      maxCampaigns: 1,
      maxReviewsPerMonth: 20,
      priceMonthly: 0,
      trialDays: 0,
      displayOrder: 0,
    },
    {
      slug: 'starter',
      name: 'Starter',
      description: 'Ideal para un negocio local con una o dos sucursales.',
      maxBranches: 3,
      maxMembers: 5,
      maxCampaigns: 5,
      maxReviewsPerMonth: 100,
      priceMonthly: 2900,
      trialDays: 14,
      displayOrder: 1,
    },
    {
      slug: 'pro',
      name: 'Pro',
      description: 'Para negocios que quieren escalar su reputación local.',
      maxBranches: 10,
      maxMembers: 15,
      maxCampaigns: 20,
      maxReviewsPerMonth: 500,
      priceMonthly: 7900,
      trialDays: 14,
      displayOrder: 2,
    },
  ];

  const plans: Record<
    string,
    Awaited<ReturnType<typeof prisma.plan.upsert>>
  > = {};

  console.log('\n📋 Plans');
  for (const data of plansData) {
    const plan = await prisma.plan.upsert({
      where: { slug: data.slug },
      update: {},
      create: data,
    });
    plans[data.slug] = plan;
    console.log(
      `  ✓ ${plan.name} (${plan.slug}) — $${(plan.priceMonthly / 100).toFixed(2)}/mo`,
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
      businessSlug: 'gains-montevideo',
      planSlug: 'pro',
      status: SubscriptionStatus.ACTIVE,
      trialEndsAt: null,
    },
    {
      businessSlug: 'clinica-delta',
      planSlug: 'starter',
      status: SubscriptionStatus.ACTIVE,
      trialEndsAt: null,
    },
    {
      businessSlug: 'veterinaria-san-roque',
      planSlug: 'starter',
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: trialEnd,
    },
    // Café Brava — sin subscription → DEFAULT_LIMITS (Free)
    // Studio Nómade — sin subscription → DEFAULT_LIMITS (Free)
  ];

  console.log('\n💳 Subscriptions');
  for (const data of subscriptionsData) {
    const business = businesses[data.businessSlug];
    const plan = plans[data.planSlug];

    await prisma.subscription.upsert({
      where: { businessId: business.id },
      update: {},
      create: {
        businessId: business.id,
        planId: plan.id,
        status: data.status,
        currentPeriodStart: now,
        currentPeriodEnd: oneMonthLater,
        trialEndsAt: data.trialEndsAt,
      },
    });
    const tag = data.status === SubscriptionStatus.TRIALING ? ' [TRIAL]' : '';
    console.log(`  ✓ ${business.name} → ${plan.name}${tag}`);
  }

  // ---------------------------------------------------------------------------
  // Campaigns
  // ---------------------------------------------------------------------------
  const adminUser = users['admin@flikker.dev'];
  const cafeUser = users['cafe@flikker.dev'];
  const vetUser = users['vet@flikker.dev'];

  const campaignsData = [
    // Gains Montevideo — 3 campaigns (Pro allows 20)
    {
      businessSlug: 'gains-montevideo',
      slug: 'qr-mostrador-pocitos',
      name: 'QR Mostrador — Pocitos',
      channel: CampaignChannel.QR_COUNTER,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: 'https://g.page/gains-montevideo/review',
      enableLanding: true,
      status: CampaignStatus.ACTIVE,
      branchKey: 'gains-montevideo/pocitos',
      createdByEmail: 'admin@flikker.dev',
    },
    {
      businessSlug: 'gains-montevideo',
      slug: 'qr-mesas-carrasco',
      name: 'QR Mesas — Carrasco',
      channel: CampaignChannel.QR_TABLE,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: 'https://g.page/gains-montevideo/review',
      enableLanding: false,
      status: CampaignStatus.ACTIVE,
      branchKey: 'gains-montevideo/carrasco',
      createdByEmail: 'admin@flikker.dev',
    },
    {
      businessSlug: 'gains-montevideo',
      slug: 'qr-pausada-pcarretas',
      name: 'Campaña Pausada — Punta Carretas',
      channel: CampaignChannel.QR_COUNTER,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: 'https://g.page/gains-montevideo/review',
      enableLanding: false,
      status: CampaignStatus.PAUSED,
      branchKey: 'gains-montevideo/punta-carretas',
      createdByEmail: 'admin@flikker.dev',
    },
    // Clínica Delta — 2 campaigns (Starter allows 5)
    {
      businessSlug: 'clinica-delta',
      slug: 'post-consulta-google',
      name: 'Post-Consulta Google',
      channel: CampaignChannel.QR_CHECKOUT,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: 'https://g.page/clinica-delta/review',
      enableLanding: true,
      status: CampaignStatus.ACTIVE,
      branchKey: 'clinica-delta/centro',
      createdByEmail: 'admin@flikker.dev',
    },
    {
      businessSlug: 'clinica-delta',
      slug: 'bio-instagram',
      name: 'Bio Instagram',
      description: 'Link en bio de Instagram para captar reseñas.',
      channel: CampaignChannel.SOCIAL_BIO,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: 'https://g.page/clinica-delta/review',
      enableLanding: false,
      status: CampaignStatus.ACTIVE,
      branchKey: null, // no branch
      createdByEmail: 'admin@flikker.dev',
    },
    // Café Brava — 1 campaign (Free allows 1, AT LIMIT)
    {
      businessSlug: 'cafe-brava',
      slug: 'qr-barra',
      name: 'QR Barra',
      channel: CampaignChannel.QR_COUNTER,
      destinationType: DestinationType.GOOGLE_REVIEW,
      destinationUrl: null, // falls back to business.googleBusinessProfileUrl
      enableLanding: false,
      status: CampaignStatus.ACTIVE,
      branchKey: 'cafe-brava/ciudad-vieja',
      createdByEmail: 'cafe@flikker.dev',
    },
    // Veterinaria San Roque — 1 campaign (Starter trial allows 5)
    {
      businessSlug: 'veterinaria-san-roque',
      slug: 'post-consulta-whatsapp',
      name: 'Post-Consulta WhatsApp',
      channel: CampaignChannel.QR_CHECKOUT,
      destinationType: DestinationType.CUSTOM_URL,
      destinationUrl:
        'https://wa.me/59826001234?text=Hola%2C%20quiero%20dejar%20una%20rese%C3%B1a',
      enableLanding: true,
      status: CampaignStatus.ACTIVE,
      branchKey: 'veterinaria-san-roque/sede-principal',
      createdByEmail: 'vet@flikker.dev',
    },
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
      update: { status: data.status },
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
    // Gains — QR Mostrador Pocitos (landing: true)
    {
      campaignKey: 'gains-montevideo/qr-mostrador-pocitos',
      slug: 'gMp_Caja1',
      label: 'Caja',
    },
    {
      campaignKey: 'gains-montevideo/qr-mostrador-pocitos',
      slug: 'gMpRecep1',
      label: 'Recepción',
    },
    // Gains — QR Mesas Carrasco (landing: false)
    {
      campaignKey: 'gains-montevideo/qr-mesas-carrasco',
      slug: 'gMcMesa01',
      label: 'Mesa 1',
    },
    {
      campaignKey: 'gains-montevideo/qr-mesas-carrasco',
      slug: 'gMcMesa02',
      label: 'Mesa 2',
    },
    {
      campaignKey: 'gains-montevideo/qr-mesas-carrasco',
      slug: 'gMcMesa03',
      label: 'Mesa 3',
    },
    // Gains — Campaña pausada
    {
      campaignKey: 'gains-montevideo/qr-pausada-pcarretas',
      slug: 'gPpMostr1',
      label: 'Mostrador',
    },
    // Clínica Delta — Post-Consulta (landing: true)
    {
      campaignKey: 'clinica-delta/post-consulta-google',
      slug: 'cDpRecep1',
      label: 'Recepción Centro',
    },
    // Clínica Delta — Bio Instagram (landing: false)
    {
      campaignKey: 'clinica-delta/bio-instagram',
      slug: 'cDbLinBi1',
      label: 'Link Bio',
    },
    // Café Brava — QR Barra
    {
      campaignKey: 'cafe-brava/qr-barra',
      slug: 'cBqBarra1',
      label: 'Barra',
    },
    // Veterinaria San Roque — Post-Consulta WhatsApp (landing: true)
    {
      campaignKey: 'veterinaria-san-roque/post-consulta-whatsapp',
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
      update: {},
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
    // Gains Pocitos — high traffic (landing shown)
    { slug: 'gMp_Caja1', scansPerDay: 6, uniqueRatio: 0.8 },
    { slug: 'gMpRecep1', scansPerDay: 4, uniqueRatio: 0.75 },
    // Gains Carrasco mesas — moderate (direct redirect)
    { slug: 'gMcMesa01', scansPerDay: 3, uniqueRatio: 0.7 },
    { slug: 'gMcMesa02', scansPerDay: 2, uniqueRatio: 0.65 },
    { slug: 'gMcMesa03', scansPerDay: 1, uniqueRatio: 0.6 },
    // Delta — moderate (landing shown)
    { slug: 'cDpRecep1', scansPerDay: 3, uniqueRatio: 0.85 },
    // Delta Bio — low
    { slug: 'cDbLinBi1', scansPerDay: 2, uniqueRatio: 0.9 },
    // Café Brava — low
    { slug: 'cBqBarra1', scansPerDay: 2, uniqueRatio: 0.7 },
    // Vet — low (landing shown)
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
      businessSlug: 'gains-montevideo',
      tags: [
        { name: 'Servicio', slug: 'servicio', color: '#22C55E' },
        { name: 'Limpieza', slug: 'limpieza', color: '#3B82F6' },
        { name: 'Atención', slug: 'atencion', color: '#F59E0B' },
        { name: 'Precio', slug: 'precio', color: '#EF4444' },
      ],
    },
    {
      businessSlug: 'clinica-delta',
      tags: [
        { name: 'Puntualidad', slug: 'puntualidad', color: '#8B5CF6' },
        { name: 'Trato médico', slug: 'trato-medico', color: '#06B6D4' },
      ],
    },
    {
      businessSlug: 'cafe-brava',
      tags: [
        { name: 'Café', slug: 'cafe', color: '#92400E' },
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
    // --- Gains Montevideo: 10 reviews across branches and campaigns ---
    {
      businessSlug: 'gains-montevideo',
      branchKey: 'gains-montevideo/pocitos',
      campaignKey: 'gains-montevideo/qr-mostrador-pocitos',
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
      businessSlug: 'gains-montevideo',
      branchKey: 'gains-montevideo/pocitos',
      campaignKey: 'gains-montevideo/qr-mostrador-pocitos',
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
      businessSlug: 'gains-montevideo',
      branchKey: 'gains-montevideo/carrasco',
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
      businessSlug: 'gains-montevideo',
      branchKey: 'gains-montevideo/pocitos',
      campaignKey: 'gains-montevideo/qr-mostrador-pocitos',
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
      businessSlug: 'gains-montevideo',
      branchKey: 'gains-montevideo/carrasco',
      campaignKey: 'gains-montevideo/qr-mesas-carrasco',
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
      businessSlug: 'gains-montevideo',
      branchKey: 'gains-montevideo/pocitos',
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
      businessSlug: 'gains-montevideo',
      branchKey: 'gains-montevideo/carrasco',
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
      businessSlug: 'gains-montevideo',
      branchKey: 'gains-montevideo/pocitos',
      campaignKey: 'gains-montevideo/qr-mostrador-pocitos',
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
      businessSlug: 'gains-montevideo',
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
      businessSlug: 'gains-montevideo',
      branchKey: 'gains-montevideo/pocitos',
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

    // --- Clínica Delta: 5 reviews ---
    {
      businessSlug: 'clinica-delta',
      branchKey: 'clinica-delta/centro',
      campaignKey: 'clinica-delta/post-consulta-google',
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
      businessSlug: 'clinica-delta',
      branchKey: 'clinica-delta/centro',
      campaignKey: 'clinica-delta/post-consulta-google',
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
      businessSlug: 'clinica-delta',
      branchKey: 'clinica-delta/pocitos',
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
      businessSlug: 'clinica-delta',
      branchKey: 'clinica-delta/centro',
      campaignKey: 'clinica-delta/post-consulta-google',
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
      businessSlug: 'clinica-delta',
      branchKey: 'clinica-delta/pocitos',
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

    // --- Café Brava: 3 reviews ---
    {
      businessSlug: 'cafe-brava',
      branchKey: 'cafe-brava/ciudad-vieja',
      campaignKey: 'cafe-brava/qr-barra',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-cafe-001',
      authorDisplayName: 'Ignacio Duarte',
      rating: 5,
      content:
        'El mejor café de Ciudad Vieja. Granos frescos y ambiente hermoso.',
      reviewedAt: '2026-03-12T09:30:00Z',
      status: ReviewStatus.NEW,
      isHighlighted: true,
      tagSlugs: ['cafe', 'ambiente'],
    },
    {
      businessSlug: 'cafe-brava',
      branchKey: 'cafe-brava/ciudad-vieja',
      campaignKey: null,
      source: ReviewSource.MANUAL,
      externalReviewId: null,
      authorDisplayName: 'Carolina Vega',
      rating: 4,
      content: 'Muy rico el flat white. Lugar chico pero acogedor.',
      reviewedAt: '2026-03-20T11:00:00Z',
      status: ReviewStatus.NEW,
      tagSlugs: ['cafe'],
    },
    {
      businessSlug: 'cafe-brava',
      branchKey: 'cafe-brava/ciudad-vieja',
      campaignKey: 'cafe-brava/qr-barra',
      source: ReviewSource.GOOGLE,
      externalReviewId: 'google-cafe-002',
      authorDisplayName: 'Tomás Herrera',
      rating: 3,
      content: 'Buen café pero precios un poco altos para lo que ofrecen.',
      reviewedAt: '2026-03-25T15:00:00Z',
      status: ReviewStatus.NEW,
    },
  ];

  console.log('\n⭐ Reviews');

  // Clean up existing seed reviews to ensure idempotency
  // (reviews without externalReviewId can't be upserted)
  for (const slug of ['gains-montevideo', 'clinica-delta', 'cafe-brava']) {
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
  console.log('\n✅ Seed complete.\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Demo credentials (all use same password: Flikker2026!)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(
    '  admin@flikker.dev    OWNER    → Gains + Delta + Nómade  [PLATFORM ADMIN]',
  );
  console.log('  admin2@flikker.dev   ADMIN    → Gains');
  console.log('  ops@flikker.dev      OPERATOR → Gains + Café Brava');
  console.log('  viewer@flikker.dev   VIEWER   → Delta');
  console.log('  cafe@flikker.dev     OWNER    → Café Brava (Free)');
  console.log(
    '  vet@flikker.dev      OWNER    → Veterinaria San Roque (Trial)',
  );
  console.log('  multi@flikker.dev    ADMIN/OP → Delta + Vet + Gains');
  console.log('  revoked@flikker.dev  REVOKED  → Gains');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(
    '  Gains Montevideo       → Pro (ACTIVE)       3 branches, 5 members',
  );
  console.log(
    '  Clínica Delta          → Starter (ACTIVE)   2 branches, 3 members',
  );
  console.log(
    '  Café Brava             → Free (no sub)      1 branch,  2 members [AT LIMIT]',
  );
  console.log(
    '  Veterinaria San Roque  → Starter (TRIALING) 2 branches, 2 members',
  );
  console.log(
    '  Studio Nómade          → None (DRAFT)       0 branches, 1 member',
  );
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n  Campaigns & QR Codes (Phase 2)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(
    '  Gains — QR Mostrador Pocitos    ACTIVE  landing=yes  2 QR (Caja, Recepción)',
  );
  console.log(
    '  Gains — QR Mesas Carrasco       ACTIVE  landing=no   3 QR (Mesa 1, 2, 3)',
  );
  console.log(
    '  Gains — Campaña Pausada PCtas   PAUSED  landing=no   1 QR (Mostrador)',
  );
  console.log(
    '  Delta — Post-Consulta Google    ACTIVE  landing=yes  1 QR (Recepción Centro)',
  );
  console.log(
    '  Delta — Bio Instagram           ACTIVE  landing=no   1 QR (Link Bio)',
  );
  console.log(
    '  Café  — QR Barra                ACTIVE  landing=no   1 QR (Barra) [AT LIMIT]',
  );
  console.log(
    '  Vet   — Post-Consulta WhatsApp  ACTIVE  landing=yes  1 QR (Consultorio 1)',
  );
  console.log(`  → ${totalEvents} scan events across 14 days`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n  Reviews & Tags (Phase 3)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Gains — 10 reviews (★1-5), 4 tags, mixed statuses & flags');
  console.log('  Delta — 5 reviews (★2-5), 2 tags, includes reviews to follow up');
  console.log('  Café  — 3 reviews (★3-5), 2 tags');
  console.log(
    `  → ${reviewCount} reviews, ${Object.keys(reviewTags).length} tags total`,
  );
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
