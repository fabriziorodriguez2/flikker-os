"use client";

import { useState, type ComponentType } from "react";
import {
  Check,
  Coffee,
  Crown,
  Flame,
  Gift,
  Heart,
  ImageIcon,
  Leaf,
  Loader2,
  Palette,
  Scissors,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Upload,
  Utensils,
  Wine,
  X,
  Zap,
} from "lucide-react";
import LoyaltyCard from "@/components/public/loyalty-card";
import { Shell } from "@/app/(public)/check-in/[token]/checkin-client";
import type { CheckinLanding } from "@/app/(public)/check-in/[token]/page";
import PhoneFrame from "@/components/ui/phone-frame";
import {
  DEFAULT_CARD_COLOR,
  STAMP_ICONS,
  buildLoyaltyCardTheme,
  contrastRatio,
  type StampIconKey,
} from "@/lib/loyalty-card-theme";
import ProgramSectionHeading from "./program-section-heading";
import type { LoyaltyAppearance } from "./types";

const CARD_STYLES = [
  {
    label: "Flikker",
    card: "#5C6BC0",
    text: "#FFFFFF",
    area: "#5362B5",
    stamp: "#FFFFFF",
  },
  {
    label: "Noche",
    card: "#171A2B",
    text: "#FFFFFF",
    area: "#22263A",
    stamp: "#A9B4FF",
  },
  {
    label: "Menta",
    card: "#DDF6EC",
    text: "#173B32",
    area: "#C8EDDF",
    stamp: "#147A5B",
  },
  {
    label: "Arena",
    card: "#F5E8CE",
    text: "#3C2C1E",
    area: "#EEDDBB",
    stamp: "#8B5A2B",
  },
  {
    label: "Coral",
    card: "#F7D5D0",
    text: "#4A2323",
    area: "#F0C0B9",
    stamp: "#A33F45",
  },
  {
    label: "Bosque",
    card: "#173C32",
    text: "#FFFFFF",
    area: "#204C40",
    stamp: "#C7F4D8",
  },
] as const;

const STAMP_ICON_COMPONENTS: Record<
  StampIconKey,
  ComponentType<{ className?: string }>
> = {
  gift: Gift,
  star: Star,
  coffee: Coffee,
  heart: Heart,
  check: Check,
  sparkles: Sparkles,
  flame: Flame,
  leaf: Leaf,
  wine: Wine,
  scissors: Scissors,
  bag: ShoppingBag,
  utensils: Utensils,
  zap: Zap,
  tag: Tag,
  crown: Crown,
};

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

function readImage(file: File, maxBytes: number): Promise<string> {
  if (!IMAGE_TYPES.has(file.type)) {
    return Promise.reject(new Error("Usá una imagen PNG, JPG, WebP o SVG."));
  }
  if (file.size > maxBytes) {
    return Promise.reject(
      new Error(
        `La imagen debe pesar menos de ${Math.round(maxBytes / 1024)} KB.`,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("No pudimos leer la imagen."));
    reader.onerror = () => reject(new Error("No pudimos leer la imagen."));
    reader.readAsDataURL(file);
  });
}

export default function ProgramDesignTab({
  appearance,
  businessName,
  rewardName,
  stampsRequired,
  canMutate,
  onSave,
}: {
  appearance: LoyaltyAppearance;
  businessName: string;
  rewardName: string;
  stampsRequired: number;
  canMutate: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [cardColor, setCardColor] = useState(
    appearance.loyaltyCardColor ??
      appearance.primaryColor ??
      DEFAULT_CARD_COLOR,
  );
  const [textColor, setTextColor] = useState(
    appearance.loyaltyCardTextColor ?? "",
  );
  const [stampAreaColor, setStampAreaColor] = useState(
    appearance.loyaltyStampAreaColor ?? "",
  );
  const [stampColor, setStampColor] = useState(
    appearance.loyaltyStampColor ?? "",
  );
  const [icon, setIcon] = useState(appearance.loyaltyStampIcon ?? "gift");
  const [backgroundImage, setBackgroundImage] = useState(
    appearance.loyaltyCardBackgroundImage ?? "",
  );
  const [logoUrl, setLogoUrl] = useState(appearance.logoUrl ?? "");
  const [showBusinessName, setShowBusinessName] = useState(
    appearance.loyaltyShowBusinessName !== false,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const theme = buildLoyaltyCardTheme(cardColor, stampColor || null);
  const stampBackground = stampAreaColor || cardColor;
  const requestedStampIgnored =
    Boolean(stampColor) && contrastRatio(stampColor, stampBackground) < 3;
  const requestedTextIgnored =
    Boolean(textColor) && contrastRatio(textColor, cardColor) < 4.5;

  const previewLanding: CheckinLanding = {
    source: { name: "Preview", type: "qr" },
    business: {
      businessName: businessName || "Tu negocio",
      logoUrl: logoUrl || null,
      primaryColor: appearance.primaryColor,
      googleBusinessProfileUrl: null,
      loyaltyCardColor: cardColor,
      loyaltyCardTextColor: textColor || null,
      loyaltyCardBackgroundImage: backgroundImage || null,
      loyaltyStampAreaColor: stampAreaColor || null,
      loyaltyStampColor: stampColor || null,
      loyaltyStampIcon: icon,
      loyaltyShowBusinessName: showBusinessName,
    },
    benefit: null,
    benefitText: null,
    welcomeMessage: null,
  };

  async function upload(
    file: File | null,
    kind: "icon" | "background" | "logo",
  ) {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await readImage(
        file,
        kind === "icon" ? 350_000 : 2_000_000,
      );
      if (kind === "icon") setIcon(dataUrl);
      if (kind === "background") setBackgroundImage(dataUrl);
      if (kind === "logo") setLogoUrl(dataUrl);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "No pudimos cargar la imagen.",
      );
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await onSave({
        loyaltyCardColor: cardColor,
        loyaltyCardTextColor: textColor || null,
        loyaltyCardBackgroundImage: backgroundImage || null,
        loyaltyStampAreaColor: stampAreaColor || null,
        loyaltyStampColor: stampColor || null,
        loyaltyStampIcon: icon,
        loyaltyShowBusinessName: showBusinessName,
        logoUrl: logoUrl || null,
      });
      setMessage("Diseño guardado.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "No pudimos guardar.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-[16px] border border-[#E8EAF0] bg-white">
        <div className="p-6">
          <ProgramSectionHeading
            icon={Palette}
            title="Personalización de la tarjeta"
            description="Elegí colores, sellos e imágenes. La vista previa usa exactamente la misma tarjeta que ven tus clientes."
          />
        </div>

        <DesignSection
          title="Estilo"
          description="Elegí una base y personalizala a tu gusto."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {CARD_STYLES.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={!canMutate}
                onClick={() => {
                  setCardColor(preset.card);
                  setTextColor(preset.text);
                  setStampAreaColor(preset.area);
                  setStampColor(preset.stamp);
                }}
                className="flex items-center gap-3 rounded-[12px] border border-[#E6E8F0] p-3 text-left hover:border-[#BFC5EA] disabled:cursor-not-allowed"
              >
                <span
                  className="h-9 w-12 shrink-0 rounded-[9px] border border-black/5"
                  style={{
                    background: `linear-gradient(135deg, ${preset.card} 0 58%, ${preset.area} 58%)`,
                  }}
                />
                <span className="text-xs font-semibold text-[#202333]">
                  {preset.label}
                </span>
              </button>
            ))}
          </div>
        </DesignSection>

        <DesignSection
          title="Marca"
          description="Logo y nombre que aparecen en el encabezado."
        >
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-[#E8EAF0] p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-16 items-center justify-center overflow-hidden rounded-[10px] bg-[#F4F5F9]">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <ImageIcon className="h-5 w-5 text-[#9AA2B5]" />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold text-[#202333]">
                  Logo de la tarjeta
                </p>
                <p className="text-xs text-[#8891A4]">PNG, JPG, WebP o SVG.</p>
              </div>
            </div>
            {canMutate ? (
              <label className="flk-glossy-secondary inline-flex h-9 cursor-pointer items-center gap-2 rounded-[9px] border border-[#E1E4EC] px-3 text-xs font-semibold text-[#202333]">
                <Upload className="h-3.5 w-3.5" /> Cambiar
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(event) => {
                    void upload(event.target.files?.[0] ?? null, "logo");
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-4 rounded-[12px] border border-[#E8EAF0] p-4">
            <div>
              <p className="text-sm font-semibold text-[#202333]">
                Mostrar nombre del negocio
              </p>
              <p className="mt-0.5 text-xs text-[#8891A4]">
                Se muestra junto al logo.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showBusinessName}
              disabled={!canMutate}
              onClick={() => setShowBusinessName((current) => !current)}
              className={`relative h-6 w-11 rounded-full transition-colors ${showBusinessName ? "bg-[#5C6BC0]" : "bg-[#D9DDE8]"}`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${showBusinessName ? "translate-x-5" : "translate-x-1"}`}
              />
            </button>
          </div>
        </DesignSection>

        <DesignSection
          title="Apariencia"
          description="Colores principales de la tarjeta."
        >
          <div className="space-y-4">
            <ColorControl
              label="Color de la tarjeta"
              value={cardColor}
              fallback={DEFAULT_CARD_COLOR}
              disabled={!canMutate}
              onChange={setCardColor}
            />
            <ColorControl
              label="Color del texto"
              value={textColor}
              fallback={theme.text}
              disabled={!canMutate}
              onChange={setTextColor}
              onReset={() => setTextColor("")}
            />
            {requestedTextIgnored ? (
              <ContrastWarning text="Ese texto no contrasta lo suficiente. En la tarjeta usamos automáticamente un color legible." />
            ) : null}
          </div>
        </DesignSection>

        <DesignSection
          title="Diseño de sellos"
          description="Ícono y colores del área de sellos."
        >
          <div className="space-y-4">
            <ColorControl
              label="Fondo del área de sellos"
              value={stampAreaColor}
              fallback={cardColor}
              disabled={!canMutate}
              onChange={setStampAreaColor}
              onReset={() => setStampAreaColor("")}
            />
            <ColorControl
              label="Color de los círculos"
              value={stampColor}
              fallback={buildLoyaltyCardTheme(stampBackground).accent}
              disabled={!canMutate}
              onChange={setStampColor}
              onReset={() => setStampColor("")}
            />
            {requestedStampIgnored ? (
              <ContrastWarning text="Ese color se pierde sobre el fondo de sellos. Usamos automáticamente uno con contraste." />
            ) : null}
          </div>

          <p className="mt-5 text-sm font-semibold text-[#202333]">
            Ícono dentro del sello
          </p>
          <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-8">
            {STAMP_ICONS.map((option) => {
              const Icon = STAMP_ICON_COMPONENTS[option.key];
              return (
                <button
                  key={option.key}
                  type="button"
                  title={option.label}
                  aria-label={option.label}
                  disabled={!canMutate}
                  onClick={() => setIcon(option.key)}
                  className={`flex aspect-square items-center justify-center rounded-[10px] border ${icon === option.key ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#5C6BC0]" : "border-[#E8EAF0] bg-[#FAFAFC] text-[#747C90] hover:border-[#BFC5EA]"}`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>

          {canMutate ? (
            <label className="mt-3 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-dashed border-[#C9CEE1] text-sm font-semibold text-[#4F5EB0] hover:border-[#5C6BC0] hover:bg-[#F8F8FF]">
              <Upload className="h-4 w-4" /> Subir ícono personalizado
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(event) => {
                  void upload(event.target.files?.[0] ?? null, "icon");
                  event.currentTarget.value = "";
                }}
              />
            </label>
          ) : null}
        </DesignSection>

        <DesignSection
          title="Imagen de fondo"
          description="Opcional, aparece detrás del contenido."
        >
          {backgroundImage ? (
            <div className="relative h-40 overflow-hidden rounded-[14px] border border-[#E4E7EF]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={backgroundImage}
                alt="Fondo de la tarjeta"
                className="h-full w-full object-cover"
              />
              {canMutate ? (
                <button
                  type="button"
                  onClick={() => setBackgroundImage("")}
                  aria-label="Quitar imagen de fondo"
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#5F6780] shadow-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : canMutate ? (
            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed border-[#C9CEE1] bg-[#FCFCFD] px-5 text-center hover:border-[#5C6BC0] hover:bg-[#F8F8FF]">
              <Upload className="h-7 w-7 text-[#7F879C]" />
              <span className="mt-3 text-sm font-semibold text-[#202333]">
                Elegí una imagen de fondo
              </span>
              <span className="mt-1 text-xs text-[#8891A4]">
                JPG, PNG, WebP o SVG · máximo 2 MB
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(event) => {
                  void upload(event.target.files?.[0] ?? null, "background");
                  event.currentTarget.value = "";
                }}
              />
            </label>
          ) : (
            <p className="text-sm text-[#8891A4]">
              No hay una imagen de fondo configurada.
            </p>
          )}
        </DesignSection>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#EEF0F5] bg-[#FCFCFD] px-6 py-4">
          {error ? (
            <p className="mr-auto text-sm text-[#C0392B]">{error}</p>
          ) : null}
          {message ? (
            <p className="mr-auto text-sm font-medium text-[#1D9E75]">
              {message}
            </p>
          ) : null}
          {canMutate ? (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="flk-glossy inline-flex h-11 items-center gap-2 rounded-[10px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4F5EB0] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Guardando…" : "Guardar diseño"}
            </button>
          ) : null}
        </div>
      </section>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
          Vista previa en vivo
        </p>
        <PhoneFrame>
          <Shell landing={previewLanding} fill={false}>
            <div className="w-full max-w-sm">
              <LoyaltyCard
                rewardName={rewardName}
                progress={Math.min(2, stampsRequired)}
                target={stampsRequired}
                appearance={{
                  cardColor,
                  textColor: textColor || null,
                  backgroundImage: backgroundImage || null,
                  stampAreaColor: stampAreaColor || null,
                  stampColor: stampColor || null,
                  stampIcon: icon,
                  logoUrl: logoUrl || null,
                  businessName,
                  showBusinessName,
                }}
              />
            </div>
          </Shell>
        </PhoneFrame>
        <p className="mt-3 text-xs leading-5 text-[#8891A4]">
          Los colores con poco contraste se corrigen automáticamente para
          mantener la tarjeta legible.
        </p>
      </aside>
    </div>
  );
}

function DesignSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[#EEF0F5] p-6">
      <h3 className="text-sm font-bold text-[#202333]">{title}</h3>
      <p className="mt-0.5 text-xs text-[#8891A4]">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ColorControl({
  label,
  value,
  fallback,
  disabled,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  fallback: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onReset?: () => void;
}) {
  const resolved = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;

  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#202333]">{label}</span>
      <span className="mt-2 flex items-center gap-2">
        <input
          type="color"
          value={resolved}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-10 w-16 cursor-pointer rounded-[9px] border border-[#DDE1EC] bg-white p-1 disabled:cursor-not-allowed"
          aria-label={label}
        />
        <input
          key={resolved}
          defaultValue={resolved.toUpperCase()}
          disabled={disabled}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(next)) onChange(next.toUpperCase());
            else event.currentTarget.value = resolved.toUpperCase();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-10 min-w-0 flex-1 rounded-[9px] border border-[#DDE1EC] px-3 text-sm font-medium uppercase text-[#202333] outline-none focus:border-[#5C6BC0]"
          aria-label={`${label} en hexadecimal`}
        />
        {onReset ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onReset}
            className="h-10 rounded-[9px] border border-[#E1E4EC] px-3 text-xs font-semibold text-[#5F6780] hover:border-[#C9D0F4] disabled:cursor-not-allowed"
          >
            Automático
          </button>
        ) : null}
      </span>
    </label>
  );
}

function ContrastWarning({ text }: { text: string }) {
  return (
    <p className="rounded-[10px] bg-[#FFF7EE] px-3 py-2 text-xs leading-5 text-[#8A520D]">
      {text}
    </p>
  );
}
