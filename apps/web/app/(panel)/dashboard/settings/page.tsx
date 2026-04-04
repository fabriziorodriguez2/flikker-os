'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function SettingsPage() {
  const canMutate = useCanMutate();

  // Business info state
  const [business, setBusiness] = useState<Business | null>(null);
  const [bizLoading, setBizLoading] = useState(true);
  const [bizSaving, setBizSaving] = useState(false);
  const [bizMessage, setBizMessage] = useState<string | null>(null);
  const [bizError, setBizError] = useState<string | null>(null);

  // Business form fields
  const [bizName, setBizName] = useState('');
  const [bizIndustry, setBizIndustry] = useState('');
  const [bizDescription, setBizDescription] = useState('');
  const [bizWebsite, setBizWebsite] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizEmail, setBizEmail] = useState('');

  // Brand profile state
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [brandLoading, setBrandLoading] = useState(true);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandMessage, setBrandMessage] = useState<string | null>(null);
  const [brandError, setBrandError] = useState<string | null>(null);

  // Brand form fields
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
      setBrand(data);
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

  const inputClass =
    'rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200';

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Configuración</h1>

      {/* Business info form */}
      <form onSubmit={handleSaveBusiness} className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-medium text-zinc-900 mb-4">Información del negocio</h2>

        {bizLoading ? (
          <p className="text-sm text-zinc-500">Cargando...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">Nombre</label>
                <input value={bizName} onChange={(e) => setBizName(e.target.value)} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">Industria</label>
                <input value={bizIndustry} onChange={(e) => setBizIndustry(e.target.value)} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-zinc-600">Descripción</label>
                <textarea value={bizDescription} onChange={(e) => setBizDescription(e.target.value)} rows={2} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">Website</label>
                <input value={bizWebsite} onChange={(e) => setBizWebsite(e.target.value)} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">Teléfono</label>
                <input value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-zinc-600">Email</label>
                <input type="email" value={bizEmail} onChange={(e) => setBizEmail(e.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="mt-3 text-xs text-zinc-400">
              Slug: {business?.slug} · País: {business?.country} · Zona: {business?.timezone} · Moneda: {business?.currency}
            </div>

            {bizError && <p className="mt-3 text-sm text-red-600">{bizError}</p>}
            {bizMessage && <p className="mt-3 text-sm text-green-600">{bizMessage}</p>}

            {canMutate && (
              <button
                type="submit" disabled={bizSaving}
                className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                {bizSaving ? 'Guardando...' : 'Guardar negocio'}
              </button>
            )}
          </>
        )}
      </form>

      {/* Brand profile form */}
      <form onSubmit={handleSaveBrand} className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-medium text-zinc-900 mb-4">Perfil de marca</h2>

        {brandLoading ? (
          <p className="text-sm text-zinc-500">Cargando...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-zinc-600">URL del logo</label>
                <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={inputClass} placeholder="https://..." />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">Color primario</label>
                <div className="flex items-center gap-2">
                  <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className={inputClass + ' flex-1'} placeholder="#FF6B00" />
                  {primaryColor && (
                    <div className="w-8 h-8 rounded border border-zinc-200" style={{ backgroundColor: primaryColor }} />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">Color secundario</label>
                <div className="flex items-center gap-2">
                  <input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className={inputClass + ' flex-1'} placeholder="#1A1A1A" />
                  {secondaryColor && (
                    <div className="w-8 h-8 rounded border border-zinc-200" style={{ backgroundColor: secondaryColor }} />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">Tono de voz</label>
                <input value={toneOfVoice} onChange={(e) => setToneOfVoice(e.target.value)} className={inputClass} placeholder="friendly, professional, casual..." />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">WhatsApp URL</label>
                <input value={whatsappUrl} onChange={(e) => setWhatsappUrl(e.target.value)} className={inputClass} placeholder="https://wa.me/..." />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-zinc-600">Bio corta</label>
                <textarea value={shortBio} onChange={(e) => setShortBio(e.target.value)} rows={2} maxLength={280} className={inputClass} placeholder="Descripción corta para perfiles y reseñas..." />
                <span className="text-xs text-zinc-400">{shortBio.length}/280</span>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-zinc-600">Firma</label>
                <input value={signatureText} onChange={(e) => setSignatureText(e.target.value)} maxLength={120} className={inputClass} placeholder="Equipo de..." />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">Google Business Profile URL</label>
                <input value={googleBusinessProfileUrl} onChange={(e) => setGoogleBusinessProfileUrl(e.target.value)} className={inputClass} placeholder="https://g.page/..." />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">URL redirección reseñas</label>
                <input value={defaultReviewRedirectUrl} onChange={(e) => setDefaultReviewRedirectUrl(e.target.value)} className={inputClass} placeholder="https://g.page/.../review" />
              </div>
            </div>

            {/* Logo preview */}
            {brand?.logoUrl && (
              <div className="mt-4">
                <p className="text-xs font-medium text-zinc-600 mb-2">Preview logo</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brand.logoUrl} alt="Logo" className="w-16 h-16 rounded-lg border border-zinc-200 object-cover" />
              </div>
            )}

            {brandError && <p className="mt-3 text-sm text-red-600">{brandError}</p>}
            {brandMessage && <p className="mt-3 text-sm text-green-600">{brandMessage}</p>}

            {canMutate && (
              <button
                type="submit" disabled={brandSaving}
                className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                {brandSaving ? 'Guardando...' : 'Guardar marca'}
              </button>
            )}
          </>
        )}
      </form>
    </div>
  );
}
