"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import LoyaltyCard from "@/components/public/loyalty-card";
import {
  DEFAULT_CARD_COLOR,
  STAMP_ICONS,
  buildLoyaltyCardTheme,
  contrastRatio,
} from "@/lib/loyalty-card-theme";
import type { LoyaltyAppearance } from "./types";

const PRESET_CARDS = [
  "#1A1040",
  "#5C6BC0",
  "#0F766E",
  "#B4530A",
  "#8A1C3B",
  "#F5F6FB",
];

/**
 * "Diseño". La preview NO es una maqueta: es el mismo `LoyaltyCard` que ve
 * el cliente, con los mismos tokens de contraste. Si acá se ve legible, del
 * otro lado también.
 */
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
    appearance.loyaltyCardColor ?? appearance.primaryColor ?? DEFAULT_CARD_COLOR,
  );
  const [stampColor, setStampColor] = useState(
    appearance.loyaltyStampColor ?? "",
  );
  const [icon, setIcon] = useState(appearance.loyaltyStampIcon ?? "gift");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = buildLoyaltyCardTheme(cardColor, stampColor || null);
  // El acento pedido se descarta si no llega a 3:1 — se avisa en vez de
  // guardar en silencio algo que el cliente no va a poder leer.
  const requestedIgnored =
    Boolean(stampColor) &&
    /^#[0-9A-Fa-f]{6}$/.test(stampColor) &&
    contrastRatio(stampColor, theme.card) < 3;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        loyaltyCardColor: cardColor,
        ...(stampColor ? { loyaltyStampColor: stampColor } : {}),
        loyaltyStampIcon: icon,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
        <h2 className="text-base font-bold text-[#1A202C]">
          Diseño de la tarjeta
        </h2>
        <p className="mt-1 text-sm text-[#8891A4]">
          Así la ve tu cliente cuando escanea. El color de los sellos se ajusta
          solo para que siempre se lean sobre tu tarjeta.
        </p>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Color de la tarjeta
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {PRESET_CARDS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={!canMutate}
                onClick={() => setCardColor(preset)}
                aria-label={`Color ${preset}`}
                className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-105 ${
                  cardColor.toUpperCase() === preset
                    ? "border-[#1A202C]"
                    : "border-[#E8EAF0]"
                }`}
                style={{ backgroundColor: preset }}
              />
            ))}
            <input
              type="color"
              value={cardColor}
              disabled={!canMutate}
              onChange={(e) => setCardColor(e.target.value.toUpperCase())}
              className="h-9 w-14 cursor-pointer rounded-[8px] border border-[#E8EAF0] bg-white"
              aria-label="Color personalizado de la tarjeta"
            />
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Acento de los sellos (opcional)
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={stampColor || theme.accent}
              disabled={!canMutate}
              onChange={(e) => setStampColor(e.target.value.toUpperCase())}
              className="h-9 w-14 cursor-pointer rounded-[8px] border border-[#E8EAF0] bg-white"
              aria-label="Acento de los sellos"
            />
            {stampColor ? (
              <button
                type="button"
                onClick={() => setStampColor("")}
                className="text-xs font-semibold text-[#5C6BC0] hover:underline"
              >
                Usar automático
              </button>
            ) : (
              <span className="text-xs text-[#8891A4]">
                Automático según el color de la tarjeta
              </span>
            )}
          </div>
          {requestedIgnored ? (
            <p className="mt-2 rounded-[10px] bg-[#FFF7EE] px-3 py-2 text-xs text-[#8A520D]">
              Ese acento no contrasta lo suficiente con tu tarjeta, así que
              usamos uno legible. Probá un color más claro u oscuro.
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Sello
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STAMP_ICONS.map((option) => (
              <button
                key={option.key}
                type="button"
                disabled={!canMutate}
                onClick={() => setIcon(option.key)}
                className={`rounded-[8px] border px-3 py-2 text-xs font-semibold transition-colors ${
                  icon === option.key
                    ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#5C6BC0]"
                    : "border-[#E8EAF0] bg-white text-[#8891A4] hover:border-[#5C6BC0]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-[#C0392B]">{error}</p> : null}

        {canMutate ? (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar diseño
            </button>
          </div>
        ) : null}
      </section>

      <aside className="lg:sticky lg:top-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
          Vista previa
        </p>
        <LoyaltyCard
          rewardName={rewardName}
          progress={Math.min(2, stampsRequired)}
          target={stampsRequired}
          appearance={{
            cardColor,
            stampColor: stampColor || null,
            stampIcon: icon,
            logoUrl: appearance.logoUrl,
            businessName,
          }}
        />
        <p className="mt-3 text-xs text-[#8891A4]">
          Es el mismo componente que ve tu cliente, con datos de ejemplo.
        </p>
      </aside>
    </div>
  );
}
