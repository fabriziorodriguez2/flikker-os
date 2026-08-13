'use client';

import { useCallback, useEffect, useState } from 'react';
import BrandPreviewCard from '@/components/settings/brand-preview-card';
import ColorSwatch from '@/components/settings/color-swatch';
import SettingsFormSection from '@/components/settings/settings-form-section';
import MetricCard from '@/components/ui/metric-card';
import PageHeader from '@/components/ui/page-header';
import { useCanMutate } from '../../role-context';

interface Business {
  id: string;
  name: string;
  slug: string;
  status: string;
  industry: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  country: string;
  timezone: string;
  currency: string;
}

interface BrandProfile {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  toneOfVoice: string | null;
  whatsappUrl: string | null;
  website: string | null;
  shortBio: string | null;
  signatureText: string | null;
  googleBusinessProfileUrl: string | null;
  defaultReviewRedirectUrl: string | null;
}

export default function SettingsClient() {
  const canMutate = useCanMutate();

  const [business, setBusiness] = useState<Business | null>(null);
  const [bizLoading, setBizLoading] = useState(true);
  const [bizSaving, setBizSaving] = useState(false);
  const [bizMessage, setBizMessage] = useState<string | null>(null);
  const [bizError, setBizError] = useState<string | null>(null);

  const [bizName, setBizName] = useState('');
  const [bizIndustry, setBizIndustry] = useState('');
  const [bizDescription, setBizDescription] = useState('');
  const [bizWebsite, setBizWebsite] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizEmail, setBizEmail] = useState('');

  const [brandLoading, setBrandLoading] = useState(true);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandMessage, setBrandMessage] = useState<string | null>(null);
  const [brandError, setBrandError] = useState<string | null>(null);

  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [shortBio, setShortBio] = useState('');
  const [signatureText, setSignatureText] = useState('');
  const [googleBusinessProfileUrl, setGoogleBusinessProfileUrl] = useState('');
  const [defaultReviewRedirectUrl, setDefaultReviewRedirectUrl] = useState('');

  const fetchBusiness = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/businesses/current');
      if (!res.ok) throw new Error('Error al cargar negocio');
      const data: Business = await res.json();
      setBusiness(data);
      setBizName(data.name);
      setBizIndustry(data.industry ?? '');
      setBizDescription(data.description ?? '');
      setBizWebsite(data.website ?? '');
      setBizPhone(data.phone ?? '');
      setBizEmail(data.email ?? '');
    } catch (e) {
      setBizError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBizLoading(false);
    }
  }, []);

  const fetchBrand = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/businesses/current/brand');
      if (!res.ok) throw new Error('Error al cargar perfil de marca');
      const data: BrandProfile = await res.json();
      setLogoUrl(data.logoUrl ?? '');
      setPrimaryColor(data.primaryColor ?? '');
      setSecondaryColor(data.secondaryColor ?? '');
      setToneOfVoice(data.toneOfVoice ?? '');
      setWhatsappUrl(data.whatsappUrl ?? '');
      setShortBio(data.shortBio ?? '');
      setSignatureText(data.signatureText ?? '');
      setGoogleBusinessProfileUrl(data.googleBusinessProfileUrl ?? '');
      setDefaultReviewRedirectUrl(data.defaultReviewRedirectUrl ?? '');
    } catch (e) {
      setBrandError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBrandLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBusiness();
    fetchBrand();
  }, [fetchBusiness, fetchBrand]);

  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    // Guard por las dudas, además de deshabilitar los inputs: el backend ya
    // rechaza el PATCH para OPERATOR, esto solo evita el viaje de red inútil.
    if (!canMutate) return;
    setBizSaving(true);
    setBizMessage(null);
    setBizError(null);

    const body: Record<string, string> = {};
    if (bizName !== business?.name) body.name = bizName;
    if (bizIndustry !== (business?.industry ?? '')) body.industry = bizIndustry;
    if (bizDescription !== (business?.description ?? '')) body.description = bizDescription;
    if (bizWebsite !== (business?.website ?? '')) body.website = bizWebsite;
    if (bizPhone !== (business?.phone ?? '')) body.phone = bizPhone;
    if (bizEmail !== (business?.email ?? '')) body.email = bizEmail;

    if (Object.keys(body).length === 0) {
      setBizMessage('Sin cambios');
      setBizSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/proxy/businesses/${business?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'Error al guardar');
      }
      setBizMessage('Guardado');
      await fetchBusiness();
    } catch (e) {
      setBizError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBizSaving(false);
    }
  }

  async function handleSaveBrand(e: React.FormEvent) {
    e.preventDefault();
    if (!canMutate) return;
    setBrandSaving(true);
    setBrandMessage(null);
    setBrandError(null);

    const body: Record<string, string> = {};
    if (logoUrl) body.logoUrl = logoUrl;
    if (primaryColor) body.primaryColor = primaryColor;
    if (secondaryColor) body.secondaryColor = secondaryColor;
    if (toneOfVoice) body.toneOfVoice = toneOfVoice;
    if (whatsappUrl) body.whatsappUrl = whatsappUrl;
    if (shortBio) body.shortBio = shortBio;
    if (signatureText) body.signatureText = signatureText;
    if (googleBusinessProfileUrl) body.googleBusinessProfileUrl = googleBusinessProfileUrl;
    if (defaultReviewRedirectUrl) body.defaultReviewRedirectUrl = defaultReviewRedirectUrl;

    try {
      const res = await fetch('/api/proxy/businesses/current/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'Error al guardar marca');
      }
      setBrandMessage('Marca actualizada');
      await fetchBrand();
    } catch (e) {
      setBrandError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBrandSaving(false);
    }
  }

  // `disabled:` de Tailwind hace el resto solo: ni foco, ni cursor de texto,
  // ni forma de escribir. Nada de mostrarle a un OPERATOR un campo que
  // PARECE editable y termina en un 403 al guardar.
  const inputClass =
    'mt-2 w-full rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--text-soft)] focus:border-[color:var(--brand-accent)] focus:ring-2 focus:ring-[color:rgba(145,136,245,0.14)] disabled:cursor-not-allowed disabled:border-[color:var(--surface-subtle)] disabled:bg-[color:var(--surface-muted)] disabled:text-[color:var(--text-muted)]';
  const textareaClass = `${inputClass} min-h-[112px] resize-y`;
  const actionButtonClass =
    'inline-flex items-center rounded-[16px] bg-[color:var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,4,65,0.18)] transition-colors hover:bg-[color:var(--brand-accent)] disabled:cursor-not-allowed disabled:opacity-60';

  const businessFieldsFilled = [
    bizWebsite,
    bizPhone,
    bizEmail,
    bizDescription,
    bizIndustry,
  ].filter((value) => value.trim()).length;

  const brandFieldsFilled = [
    logoUrl,
    primaryColor,
    secondaryColor,
    shortBio,
    signatureText,
    googleBusinessProfileUrl,
    defaultReviewRedirectUrl,
  ].filter((value) => value.trim()).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Configuración"
        title="Negocio y marca"
        subtitle="Datos del negocio y perfil de marca."
      />

      {!canMutate ? (
        <p className="rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3 text-sm text-[color:var(--text-muted)]">
          Estás viendo esta información en modo lectura. Para cambiar algo,
          pedile a un dueño o administrador del negocio.
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-4">
        <MetricCard
          label="Negocio"
          value={business?.name ?? (bizLoading ? '...' : '-')}
          tone="accent"
          hint={business?.status === 'ACTIVE' ? 'Activo' : business?.status ?? 'Sin estado'}
        />
        <MetricCard
          label="Datos completos"
          value={bizLoading ? '...' : `${businessFieldsFilled}/5`}
          hint="Sitio, teléfono, email, industria y descripción"
        />
        <MetricCard
          label="Marca"
          value={brandLoading ? '...' : `${brandFieldsFilled}/7`}
          hint="Logo, colores y enlaces"
        />
        <MetricCard
          label="Slug"
          value={business?.slug ?? (bizLoading ? '...' : '-')}
          hint="Identificador del negocio"
        />
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <div className="space-y-8">
          <form onSubmit={handleSaveBusiness}>
            <SettingsFormSection
              eyebrow="Negocio"
              title="Datos generales"
              description="Información básica del negocio."
              footer={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-[color:var(--text-muted)]">
                    {bizError ? (
                      <span className="text-[color:var(--danger-text)]">{bizError}</span>
                    ) : bizMessage ? (
                      <span className="text-[color:var(--success-text)]">{bizMessage}</span>
                    ) : (
                      'Estos datos se usan en el panel y en salidas públicas.'
                    )}
                  </div>

                  {canMutate ? (
                    <button type="submit" disabled={bizSaving || bizLoading} className={actionButtonClass}>
                      {bizSaving ? 'Guardando...' : 'Guardar negocio'}
                    </button>
                  ) : null}
                </div>
              }
            >
              {bizLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="h-24 animate-pulse rounded-[22px] bg-[color:var(--surface-muted)]" />
                  <div className="h-24 animate-pulse rounded-[22px] bg-[color:var(--surface-muted)]" />
                  <div className="h-32 animate-pulse rounded-[22px] bg-[color:var(--surface-muted)] sm:col-span-2" />
                  <div className="h-24 animate-pulse rounded-[22px] bg-[color:var(--surface-muted)]" />
                  <div className="h-24 animate-pulse rounded-[22px] bg-[color:var(--surface-muted)]" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Nombre del negocio
                      </label>
                      <input disabled={!canMutate} value={bizName} onChange={(e) => setBizName(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Industria
                      </label>
                      <input disabled={!canMutate} value={bizIndustry} onChange={(e) => setBizIndustry(e.target.value)} className={inputClass} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Descripción corta
                      </label>
                      <textarea disabled={!canMutate} value={bizDescription} onChange={(e) => setBizDescription(e.target.value)} rows={4} className={textareaClass} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Sitio web
                      </label>
                      <input disabled={!canMutate} value={bizWebsite} onChange={(e) => setBizWebsite(e.target.value)} className={inputClass} placeholder="https://..." />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Teléfono
                      </label>
                      <input disabled={!canMutate} value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} className={inputClass} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Email de contacto
                      </label>
                      <input disabled={!canMutate} type="email" value={bizEmail} onChange={(e) => setBizEmail(e.target.value)} className={inputClass} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Slug</p>
                      <p className="mt-3 text-sm font-semibold text-[color:var(--foreground)]">{business?.slug ?? '-'}</p>
                    </div>
                    <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">País y moneda</p>
                      <p className="mt-3 text-sm font-semibold text-[color:var(--foreground)]">
                        {business?.country ?? '-'} · {business?.currency ?? '-'}
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Zona horaria</p>
                      <p className="mt-3 text-sm font-semibold text-[color:var(--foreground)]">{business?.timezone ?? '-'}</p>
                    </div>
                  </div>
                </div>
              )}
            </SettingsFormSection>
          </form>

          <form onSubmit={handleSaveBrand}>
            <SettingsFormSection
              eyebrow="Marca"
              title="Perfil de marca"
              description="Logo, colores y enlaces base."
              footer={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-[color:var(--text-muted)]">
                    {brandError ? (
                      <span className="text-[color:var(--danger-text)]">{brandError}</span>
                    ) : brandMessage ? (
                      <span className="text-[color:var(--success-text)]">{brandMessage}</span>
                    ) : (
                      'Estos datos se usan en widgets y superficies públicas.'
                    )}
                  </div>

                  {canMutate ? (
                    <button type="submit" disabled={brandSaving || brandLoading} className={actionButtonClass}>
                      {brandSaving ? 'Guardando...' : 'Guardar marca'}
                    </button>
                  ) : null}
                </div>
              }
            >
              {brandLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="h-24 animate-pulse rounded-[22px] bg-[color:var(--surface-muted)] sm:col-span-2" />
                  <div className="h-24 animate-pulse rounded-[22px] bg-[color:var(--surface-muted)]" />
                  <div className="h-24 animate-pulse rounded-[22px] bg-[color:var(--surface-muted)]" />
                  <div className="h-32 animate-pulse rounded-[22px] bg-[color:var(--surface-muted)] sm:col-span-2" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        URL del logo
                      </label>
                      <input disabled={!canMutate} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={inputClass} placeholder="https://..." />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Color primario
                      </label>
                      <input disabled={!canMutate} value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className={inputClass} placeholder="#9188F5" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Color secundario
                      </label>
                      <input disabled={!canMutate} value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className={inputClass} placeholder="#000441" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Tono de voz
                      </label>
                      <input disabled={!canMutate} value={toneOfVoice} onChange={(e) => setToneOfVoice(e.target.value)} className={inputClass} placeholder="cercano, profesional, directo..." />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        URL de WhatsApp
                      </label>
                      <input disabled={!canMutate} value={whatsappUrl} onChange={(e) => setWhatsappUrl(e.target.value)} className={inputClass} placeholder="https://wa.me/..." />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Bio corta
                      </label>
                      <textarea
                        disabled={!canMutate}
                        value={shortBio}
                        onChange={(e) => setShortBio(e.target.value)}
                        rows={4}
                        maxLength={280}
                        className={textareaClass}
                        placeholder="Descripción breve del negocio..."
                      />
                      <p className="mt-2 text-xs text-[color:var(--text-soft)]">{shortBio.length}/280</p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Firma
                      </label>
                      <input
                        disabled={!canMutate}
                        value={signatureText}
                        onChange={(e) => setSignatureText(e.target.value)}
                        maxLength={120}
                        className={inputClass}
                        placeholder="Equipo de..."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Google Business Profile
                      </label>
                      <input
                        disabled={!canMutate}
                        value={googleBusinessProfileUrl}
                        onChange={(e) => setGoogleBusinessProfileUrl(e.target.value)}
                        className={inputClass}
                        placeholder="https://g.page/..."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        URL por defecto para reseñas
                      </label>
                      <input
                        disabled={!canMutate}
                        value={defaultReviewRedirectUrl}
                        onChange={(e) => setDefaultReviewRedirectUrl(e.target.value)}
                        className={inputClass}
                        placeholder="https://g.page/.../review"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <ColorSwatch label="Primario" value={primaryColor} />
                    <ColorSwatch label="Secundario" value={secondaryColor} />
                  </div>
                </div>
              )}
            </SettingsFormSection>
          </form>
        </div>

        <div className="space-y-6">
          <BrandPreviewCard
            businessName={bizName.trim() || business?.name || 'Tu negocio'}
            logoUrl={logoUrl}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            shortBio={shortBio}
            signatureText={signatureText}
          />

          <div className="rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[var(--shadow-card)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
              Incluye
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-[color:var(--text-muted)]">
              <li>Nombre, contacto y descripción del negocio</li>
              <li>Logo, colores y firma</li>
              <li>Enlaces base para reseñas y perfil público</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
