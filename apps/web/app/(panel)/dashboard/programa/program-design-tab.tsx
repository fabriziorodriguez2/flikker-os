"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Coffee,
  CreditCard,
  Crop,
  Crown,
  Flame,
  Gift,
  Heart,
  ImageIcon,
  ImageUp,
  LayoutGrid,
  Leaf,
  Loader2,
  Palette,
  Scissors,
  ShoppingBag,
  SlidersHorizontal,
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
import PhoneFrame from "@/components/ui/phone-frame";
import {
  DEFAULT_CARD_COLOR,
  STAMP_ICONS,
  buildLoyaltyCardTheme,
  contrastRatio,
  resolveLoyaltyStampAreaColor,
  type StampIconKey,
} from "@/lib/loyalty-card-theme";
import {
  STAMP_BACKGROUND_PATTERNS,
  automaticPatternIntensity,
  buildStampPatternDataUri,
  effectivePatternOpacity,
  isStampPatternKey,
  tileSizeFor,
  type StampPatternKey,
} from "@/lib/loyalty-stamp-patterns";
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
  children,
}: {
  appearance: LoyaltyAppearance;
  businessName: string;
  rewardName: string;
  stampsRequired: number;
  canMutate: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  children?: ReactNode;
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
  const [pattern, setPattern] = useState<StampPatternKey>(
    isStampPatternKey(appearance.loyaltyStampBackgroundPattern)
      ? appearance.loyaltyStampBackgroundPattern
      : "none",
  );
  /** `null` = Automático — mismo criterio que los `ColorControl` de arriba. */
  const [patternIntensity, setPatternIntensity] = useState<number | null>(
    appearance.loyaltyStampBackgroundOpacity ?? null,
  );
  const [backgroundImage, setBackgroundImage] = useState(
    appearance.loyaltyCardBackgroundImage ?? "",
  );
  const [logoUrl, setLogoUrl] = useState(appearance.logoUrl ?? "");
  const [showBusinessName, setShowBusinessName] = useState(
    appearance.loyaltyShowBusinessName !== false,
  );
  const [styleOpen, setStyleOpen] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Responsive del editor (pedido explícito) — dos controles independientes:
  // en laptop angosta (1024-1279px, donde el preview fijo de 340px apretaba
  // el formulario) el dueño puede ocultarlo para darle todo el ancho al
  // editor; en mobile/tablet (<1024px) el preview nunca compite por espacio
  // en la misma columna, se abre aparte en una hoja. Desktop grande (≥1280px)
  // no cambia: nav → editor → preview sticky, sin ningún toggle de por medio.
  const [desktopPreviewCollapsed, setDesktopPreviewCollapsed] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  const theme = buildLoyaltyCardTheme(cardColor, stampColor || null);
  const stampBackground = resolveLoyaltyStampAreaColor(
    cardColor,
    stampAreaColor,
  );
  const resolvedPatternIntensity =
    patternIntensity ?? automaticPatternIntensity(theme.isDarkCard);
  const requestedStampIgnored =
    Boolean(stampColor) && contrastRatio(stampColor, stampBackground) < 3;
  const requestedTextIgnored =
    Boolean(textColor) && contrastRatio(textColor, cardColor) < 4.5;

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
      if (kind === "logo") setCropSource(dataUrl);
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
        loyaltyStampBackgroundPattern: pattern,
        loyaltyStampBackgroundOpacity: patternIntensity,
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

  const selectedStyle = CARD_STYLES.find(
    (preset) =>
      preset.card === cardColor &&
      preset.text === textColor &&
      preset.area === stampAreaColor &&
      preset.stamp === stampColor,
  );

  function applyStyle(preset: (typeof CARD_STYLES)[number]) {
    setCardColor(preset.card);
    setTextColor(preset.text);
    setStampAreaColor(preset.area);
    setStampColor(preset.stamp);
  }

  const previewContent = (
    <>
      <PhoneFrame>
        <div className="flex h-full min-h-full items-start bg-white px-3 pb-6 pt-12">
          <div className="w-full">
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
                stampBackgroundPattern: pattern,
                stampBackgroundOpacity: patternIntensity,
              }}
            />
          </div>
        </div>
      </PhoneFrame>
      <p className="mt-3 text-xs leading-5 text-[#8891A4]">
        Los colores con poco contraste se corrigen automáticamente para
        mantener la tarjeta legible.
      </p>
    </>
  );

  return (
    <>
      <div
        className={
          desktopPreviewCollapsed
            ? "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
            : "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_340px]"
        }
      >
        <div className="min-w-0 space-y-5">
          {children}

          {/* Solo existe en la franja angosta (1024-1279px) — ahí es donde
              el preview fijo apretaba el editor. En desktop grande (≥1280px)
              nunca se ve: el preview siempre está sticky, como antes. */}
          <button
            type="button"
            onClick={() => setDesktopPreviewCollapsed((current) => !current)}
            className="hidden items-center gap-2 rounded-[10px] border border-[#E4E7EF] bg-white px-3.5 py-2 text-xs font-semibold text-[#5C6BC0] hover:border-[#BFC5EA] lg:inline-flex xl:hidden"
          >
            {desktopPreviewCollapsed ? "Ver preview" : "Ocultar preview"}
          </button>
          <section className="overflow-hidden rounded-[16px] border border-[#E8EAF0] bg-white">
            <div className="p-6">
              <ProgramSectionHeading
                icon={Palette}
                title="Personalización de la tarjeta"
                description="Elegí colores, sellos e imágenes. La vista previa usa exactamente la misma tarjeta que ven tus clientes."
              />
            </div>

            <DesignSection
              icon={LayoutGrid}
              title="Estilo"
              description="Elegí una base y personalizala a tu gusto."
            >
              <button
                type="button"
                disabled={!canMutate}
                onClick={() => setStyleOpen(true)}
                className="flex w-full items-center gap-4 rounded-[13px] border border-[#E4E7EF] bg-white p-4 text-left hover:border-[#BFC5EA] disabled:cursor-not-allowed"
              >
                <span className="flex -space-x-1.5">
                  {[
                    cardColor,
                    textColor || theme.text,
                    stampBackground,
                    stampColor || theme.accent,
                  ].map((color) => (
                    <span
                      key={color}
                      className="h-7 w-7 rounded-full border-2 border-white"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#202333]">
                    {selectedStyle?.label ?? "Personalizado"}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#8891A4]">
                    Abrir paleta y elegir colores
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-[#9AA2B5]" />
              </button>
            </DesignSection>

            <DesignSection
              icon={CreditCard}
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
                    <p className="text-xs text-[#8891A4]">
                      PNG, JPG, WebP o SVG.
                    </p>
                  </div>
                </div>
                {canMutate ? (
                  <label className="flk-glossy-secondary inline-flex h-9 cursor-pointer items-center gap-2 rounded-[9px] border border-[#E1E4EC] px-3 text-xs font-semibold text-[#202333]">
                    <Crop className="h-3.5 w-3.5" /> Cambiar y recortar
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
                  aria-label="Mostrar nombre del negocio"
                  disabled={!canMutate}
                  onClick={() => setShowBusinessName((current) => !current)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${showBusinessName ? "bg-[#5C6BC0]" : "bg-[#D9DDE8]"}`}
                >
                  <span
                    className={`absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${showBusinessName ? "translate-x-6" : "translate-x-1"}`}
                  />
                </button>
              </div>
            </DesignSection>

            <DesignSection
              icon={SlidersHorizontal}
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
              icon={Sparkles}
              title="Diseño de sellos"
              description="Ícono y colores del área de sellos."
            >
              <div className="space-y-4">
                <ColorControl
                  label="Fondo del área de sellos"
                  value={stampAreaColor}
                  fallback={stampBackground}
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
                      className={`flex h-10 items-center justify-center rounded-[9px] border ${icon === option.key ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#5C6BC0]" : "border-[#E8EAF0] bg-[#FAFAFC] text-[#747C90] hover:border-[#BFC5EA]"}`}
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

              <p className="mt-5 text-sm font-semibold text-[#202333]">
                Fondo del área de sellos
              </p>
              <p className="mt-0.5 text-xs text-[#8891A4]">
                Un patrón sutil detrás de los sellos. Siempre va detrás — nunca
                encima — para que el sello se siga leyendo bien.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STAMP_BACKGROUND_PATTERNS.map((option) => {
                  const previewUri =
                    option.key === "none"
                      ? null
                      : buildStampPatternDataUri(
                          option.key,
                          theme.accent,
                          effectivePatternOpacity(resolvedPatternIntensity),
                        );
                  const selected = pattern === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      disabled={!canMutate}
                      onClick={() => setPattern(option.key)}
                      className={`flex flex-col items-center gap-1.5 rounded-[11px] border p-2 ${selected ? "border-[#5C6BC0] bg-[#EEF0FB]" : "border-[#E8EAF0] bg-white hover:border-[#BFC5EA]"}`}
                    >
                      <span
                        className="h-12 w-full rounded-[8px]"
                        style={{
                          backgroundColor: stampBackground,
                          backgroundImage: previewUri
                            ? `url("${previewUri}")`
                            : undefined,
                          backgroundRepeat: "repeat",
                          backgroundSize: previewUri
                            ? `${tileSizeFor(option.key)}px ${tileSizeFor(option.key)}px`
                            : undefined,
                        }}
                        aria-hidden="true"
                      />
                      <span
                        className={`text-[11px] font-semibold leading-tight ${selected ? "text-[#5C6BC0]" : "text-[#5F6780]"}`}
                      >
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {pattern !== "none" ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-[#5F6780]">
                      Intensidad
                    </span>
                    {patternIntensity !== null ? (
                      <button
                        type="button"
                        disabled={!canMutate}
                        onClick={() => setPatternIntensity(null)}
                        className="text-xs font-semibold text-[#5C6BC0] hover:underline disabled:cursor-not-allowed"
                      >
                        Usar automático
                      </button>
                    ) : (
                      <span className="text-xs text-[#9AA2B5]">
                        Automático
                      </span>
                    )}
                  </div>
                  <CropSlider
                    label=""
                    value={resolvedPatternIntensity}
                    min={0}
                    max={100}
                    step={5}
                    onChange={(value) => setPatternIntensity(value)}
                  />
                </div>
              ) : null}
            </DesignSection>

            <DesignSection
              icon={ImageUp}
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
                      void upload(
                        event.target.files?.[0] ?? null,
                        "background",
                      );
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
        </div>

        <aside
          className={
            desktopPreviewCollapsed
              ? "hidden xl:sticky xl:top-4 xl:block xl:self-start"
              : "hidden lg:sticky lg:top-4 lg:block lg:self-start"
          }
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Vista previa en vivo
          </p>
          {previewContent}
        </aside>
      </div>

      {/* Mobile/tablet (<1024px): el preview nunca se aplasta en la misma
          columna — vive en una hoja aparte, un tap de distancia. */}
      <button
        type="button"
        onClick={() => setMobilePreviewOpen(true)}
        className="fixed inset-x-0 bottom-5 z-30 mx-auto flex w-fit items-center gap-2 rounded-full bg-[#202333] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(17,22,59,0.3)] lg:hidden"
      >
        <CreditCard className="h-4 w-4" aria-hidden="true" />
        Ver preview
      </button>

      {mobilePreviewOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0D1B2A]/40 lg:hidden"
          onClick={() => setMobilePreviewOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Vista previa de la tarjeta"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[85vh] w-full flex-col rounded-t-[20px] border border-[#E8EAF0] bg-white px-5 pb-8 pt-4 shadow-xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-[#E3E5F0]" />
            <div className="flex shrink-0 items-center justify-between pb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Vista previa en vivo
              </p>
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(false)}
                aria-label="Cerrar vista previa"
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#8891A4] hover:bg-[#F5F6FA]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {previewContent}
            </div>
          </div>
        </div>
      ) : null}

      {styleOpen ? (
        <StylePickerModal
          cardColor={cardColor}
          textColor={textColor || theme.text}
          stampAreaColor={stampBackground}
          stampColor={stampColor || theme.accent}
          onCardColor={setCardColor}
          onTextColor={setTextColor}
          onStampAreaColor={setStampAreaColor}
          onStampColor={setStampColor}
          onPreset={applyStyle}
          onClose={() => setStyleOpen(false)}
        />
      ) : null}

      {cropSource ? (
        <LogoCropModal
          source={cropSource}
          onCancel={() => setCropSource(null)}
          onConfirm={(cropped) => {
            setLogoUrl(cropped);
            setCropSource(null);
          }}
        />
      ) : null}
    </>
  );
}

function StylePickerModal({
  cardColor,
  textColor,
  stampAreaColor,
  stampColor,
  onCardColor,
  onTextColor,
  onStampAreaColor,
  onStampColor,
  onPreset,
  onClose,
}: {
  cardColor: string;
  textColor: string;
  stampAreaColor: string;
  stampColor: string;
  onCardColor: (value: string) => void;
  onTextColor: (value: string) => void;
  onStampAreaColor: (value: string) => void;
  onStampColor: (value: string) => void;
  onPreset: (preset: (typeof CARD_STYLES)[number]) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111633]/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-style-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-[20px] border border-[#E3E5F0] bg-white p-5 shadow-[0_28px_80px_rgba(17,22,59,0.24)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#EEF0FB] text-[#5C6BC0]">
              <Palette className="h-5 w-5" />
            </span>
            <h2
              id="card-style-title"
              className="mt-3 text-xl font-bold text-[#202333]"
            >
              Elegí el estilo de la tarjeta
            </h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              Usá una paleta preparada o armá la tuya.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar selector de estilo"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#7F879C] hover:bg-[#F3F4F8]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {CARD_STYLES.map((preset) => {
            const selected =
              preset.card === cardColor &&
              preset.text === textColor &&
              preset.area === stampAreaColor &&
              preset.stamp === stampColor;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onPreset(preset)}
                className={`flex items-center gap-3 rounded-[13px] border p-3 text-left ${
                  selected
                    ? "border-[#5C6BC0] bg-[#F6F7FF]"
                    : "border-[#E4E7EF] hover:border-[#BFC5EA]"
                }`}
              >
                <span
                  className="h-11 w-14 shrink-0 rounded-[10px] border border-black/5"
                  style={{
                    background: `linear-gradient(135deg, ${preset.card} 0 58%, ${preset.area} 58%)`,
                  }}
                />
                <span className="min-w-0 flex-1 text-sm font-semibold text-[#202333]">
                  {preset.label}
                </span>
                {selected ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#5C6BC0] text-white">
                    <Check className="h-3 w-3" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-[15px] bg-[#F8F9FC] p-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#5C6BC0]" />
            <h3 className="text-sm font-bold text-[#202333]">
              Paleta personalizada
            </h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ColorControl
              label="Tarjeta"
              value={cardColor}
              fallback={DEFAULT_CARD_COLOR}
              disabled={false}
              onChange={onCardColor}
            />
            <ColorControl
              label="Texto"
              value={textColor}
              fallback="#FFFFFF"
              disabled={false}
              onChange={onTextColor}
            />
            <ColorControl
              label="Área de sellos"
              value={stampAreaColor}
              fallback={cardColor}
              disabled={false}
              onChange={onStampAreaColor}
            />
            <ColorControl
              label="Círculos"
              value={stampColor}
              fallback="#FFFFFF"
              disabled={false}
              onChange={onStampColor}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flk-glossy inline-flex h-11 items-center rounded-[10px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4F5EB0]"
          >
            Usar este estilo
          </button>
        </div>
      </section>
    </div>
  );
}

function LogoCropModal({
  source,
  onCancel,
  onConfirm,
}: {
  source: string;
  onCancel: () => void;
  onConfirm: (cropped: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [cropping, setCropping] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);

  async function confirm() {
    setCropping(true);
    setCropError(null);
    try {
      onConfirm(await cropSquareImage(source, zoom, positionX, positionY));
    } catch {
      setCropError("No pudimos recortar esa imagen.");
      setCropping(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#111633]/55 p-4 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-logo-title"
        className="w-full max-w-lg rounded-[20px] border border-[#E3E5F0] bg-white p-5 shadow-[0_28px_80px_rgba(17,22,59,0.28)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#EEF0FB] text-[#5C6BC0]">
              <Crop className="h-5 w-5" />
            </span>
            <h2
              id="crop-logo-title"
              className="mt-3 text-xl font-bold text-[#202333]"
            >
              Recortar logo
            </h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              Ajustalo dentro del cuadrado antes de usarlo.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar recorte"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#7F879C] hover:bg-[#F3F4F8]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-auto mt-5 aspect-square w-full max-w-[280px] overflow-hidden rounded-[18px] border border-[#DDE1EC] bg-[linear-gradient(45deg,#F1F2F6_25%,transparent_25%),linear-gradient(-45deg,#F1F2F6_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#F1F2F6_75%),linear-gradient(-45deg,transparent_75%,#F1F2F6_75%)] bg-[length:20px_20px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={source}
            alt="Vista previa del recorte"
            className="h-full w-full object-cover"
            style={{
              objectPosition: `${positionX}% ${positionY}%`,
              transform: `scale(${zoom})`,
              transformOrigin: `${positionX}% ${positionY}%`,
            }}
          />
        </div>

        <div className="mt-5 space-y-4">
          <CropSlider
            label="Zoom"
            value={zoom}
            min={1}
            max={3}
            step={0.05}
            onChange={setZoom}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <CropSlider
              label="Horizontal"
              value={positionX}
              min={0}
              max={100}
              step={1}
              onChange={setPositionX}
            />
            <CropSlider
              label="Vertical"
              value={positionY}
              min={0}
              max={100}
              step={1}
              onChange={setPositionY}
            />
          </div>
        </div>

        {cropError ? (
          <p className="mt-4 text-sm text-[#C0392B]">{cropError}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flk-glossy-secondary h-10 rounded-[9px] border border-[#E1E4EC] px-4 text-sm font-semibold text-[#5F6780]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={cropping}
            className="flk-glossy inline-flex h-10 items-center gap-2 rounded-[9px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {cropping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Crop className="h-4 w-4" />
            )}
            Aplicar recorte
          </button>
        </div>
      </section>
    </div>
  );
}

function CropSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-[#5F6780]">
        {label}
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[#5C6BC0]"
      />
    </label>
  );
}

function cropSquareImage(
  source: string,
  zoom: number,
  positionX: number,
  positionY: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas unavailable"));
        return;
      }

      const scale =
        Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const x = -Math.max(0, width - size) * (positionX / 100);
      const y = -Math.max(0, height - size) * (positionY / 100);
      context.clearRect(0, 0, size, size);
      context.drawImage(image, x, y, width, height);
      resolve(canvas.toDataURL("image/webp", 0.9));
    };
    image.onerror = () => reject(new Error("Invalid image"));
    image.src = source;
  });
}

function DesignSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[#EEF0F5] p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#EEF0FB] text-[#5C6BC0]">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-[#202333]">{title}</h3>
          <p className="mt-0.5 text-xs text-[#8891A4]">{description}</p>
        </div>
      </div>
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
    <div className="flex items-center justify-between gap-4 rounded-[11px] border border-[#E8EAF0] px-3.5 py-3">
      <span className="text-sm font-semibold text-[#202333]">{label}</span>
      <span className="flex items-center gap-2.5">
        <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-white shadow-[0_0_0_1px_#DDE1EC]">
          <span
            className="absolute inset-0"
            style={{ backgroundColor: resolved }}
          />
          <input
            type="color"
            value={resolved}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
        <span
          className="min-w-[72px] text-xs font-semibold uppercase tracking-[0.02em] text-[#5F6780]"
          style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
        >
          {resolved.toUpperCase()}
        </span>
        {onReset && value ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onReset}
            aria-label={`Usar color automático para ${label}`}
            title="Usar automático"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#9AA2B5] hover:bg-[#F1F2F7] hover:text-[#5C6BC0] disabled:cursor-not-allowed"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </span>
    </div>
  );
}

function ContrastWarning({ text }: { text: string }) {
  return (
    <p className="rounded-[10px] bg-[#FFF7EE] px-3 py-2 text-xs leading-5 text-[#8A520D]">
      {text}
    </p>
  );
}
