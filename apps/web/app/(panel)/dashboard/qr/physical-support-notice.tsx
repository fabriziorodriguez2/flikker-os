"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Check,
  Minus,
  Package,
  Palette,
  Plus,
  QrCode,
  X,
} from "lucide-react";

const FLIKKER_WHATSAPP = "59891624988";
const PRICES = { 1: 500, 2: 800, 3: 1000 } as const;

type Quantity = keyof typeof PRICES;
type SupportStyle = "comun" | "personalizado";

interface PhysicalSupportNoticeProps {
  businessId?: string;
  businessName?: string;
}

export default function PhysicalSupportNotice({
  businessId,
  businessName,
}: PhysicalSupportNoticeProps) {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [style, setStyle] = useState<SupportStyle>("comun");
  const [quantity, setQuantity] = useState<Quantity>(1);

  const storageKey = `flikker:physical-support-dismissed:${businessId ?? "business"}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setVisible(window.sessionStorage.getItem(storageKey) !== "true");
      } catch {
        setVisible(true);
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!orderOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOrderOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [orderOpen]);

  const total = PRICES[quantity];
  const whatsappHref = useMemo(() => {
    const variant =
      style === "personalizado"
        ? "personalizado con el logo y color de mi marca"
        : "común con diseño Flikker";
    const message = [
      `Hola, quiero pedir ${quantity} ${quantity === 1 ? "soporte" : "soportes"} QR + NFC para ${businessName ?? "mi negocio"}.`,
      `Diseño: ${variant}.`,
      `Total: $${total.toLocaleString("es-UY")} UYU.`,
      businessId ? `(ref: ${businessId})` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `https://wa.me/${FLIKKER_WHATSAPP}?text=${encodeURIComponent(message)}`;
  }, [businessId, businessName, quantity, style, total]);

  function dismiss() {
    try {
      window.sessionStorage.setItem(storageKey, "true");
    } catch {
      // El aviso igual se puede cerrar aunque el navegador bloquee el storage.
    }
    setOrderOpen(false);
    setVisible(false);
  }

  if (!ready || !visible) return null;

  return (
    <>
      <aside className="relative overflow-hidden rounded-[18px] border border-[#C9D0F4] bg-[linear-gradient(115deg,#F8F8FF_0%,#F0F2FF_55%,#F7F4FF_100%)] shadow-[0_10px_30px_rgba(92,107,192,0.07)]">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar aviso de soporte físico"
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-[#7F879C] hover:bg-white hover:text-[#202333]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex flex-col items-center gap-5 px-5 py-5 pr-12 sm:flex-row sm:px-7 sm:py-6">
          <div className="relative h-36 w-28 shrink-0 sm:h-40 sm:w-32">
            <Image
              src="/qr-nfc-support.png"
              alt="Soporte acrílico de mostrador con QR y NFC"
              fill
              priority
              sizes="128px"
              className="object-contain drop-shadow-[0_12px_14px_rgba(31,22,78,0.18)]"
            />
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5C6BC0] shadow-sm">
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              Soporte para tu local
            </span>
            <h2 className="mt-2.5 font-display text-xl font-semibold tracking-[-0.02em] text-[#202333]">
              QR + NFC listo para el mostrador
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#5F6780]">
              Elegí el diseño Flikker o personalizalo con tu logo y color de
              marca. Ambos incluyen QR y NFC, al mismo precio.
            </p>
            <p className="mt-3 text-sm font-semibold text-[#202333]">
              1 por $500 <span className="text-[#B0B8C9]">·</span> 2 por $800{" "}
              <span className="text-[#B0B8C9]">·</span> 3 por $1.000
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-2">
            <WhatsAppBadge />
            <button
              type="button"
              onClick={() => setOrderOpen(true)}
              className="flk-glossy inline-flex h-11 items-center gap-2 rounded-[11px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4F5EB0]"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Pedir por WhatsApp
            </button>
          </div>
        </div>
      </aside>

      {orderOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#111633]/45 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOrderOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="physical-support-title"
            className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-[20px] border border-[#E3E5F0] bg-white p-5 shadow-[0_28px_80px_rgba(17,22,59,0.24)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6BC0]">
                    Soporte QR + NFC
                  </p>
                  <WhatsAppBadge />
                </div>
                <h2
                  id="physical-support-title"
                  className="mt-1 font-display text-xl font-semibold text-[#202333]"
                >
                  Elegí cómo lo querés
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOrderOpen(false)}
                aria-label="Cerrar pedido"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#7F879C] hover:bg-[#F3F4F8] hover:text-[#202333]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <StyleOption
                active={style === "comun"}
                icon={QrCode}
                title="Común"
                description="Diseño Flikker listo para usar en tu local."
                onClick={() => setStyle("comun")}
              />
              <StyleOption
                active={style === "personalizado"}
                icon={Palette}
                title="Personalizado"
                description="Con el logo y color de marca de tu negocio."
                onClick={() => setStyle("personalizado")}
              />
            </div>

            <div className="mt-6 rounded-[14px] bg-[#F7F8FC] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#202333]">Cantidad</p>
                  <p className="mt-0.5 text-xs text-[#8891A4]">
                    El precio incluye QR y NFC.
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-[11px] border border-[#E3E5F0] bg-white p-1">
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((current) => Math.max(1, current - 1) as Quantity)
                    }
                    disabled={quantity === 1}
                    aria-label="Quitar un soporte"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#5C6BC0] hover:bg-[#EEF0FB] disabled:text-[#C8D0E0]"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-5 text-center text-sm font-bold text-[#202333]">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((current) => Math.min(3, current + 1) as Quantity)
                    }
                    disabled={quantity === 3}
                    aria-label="Agregar un soporte"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#5C6BC0] hover:bg-[#EEF0FB] disabled:text-[#C8D0E0]"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4 border-t border-[#EFF1F7] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-[#8891A4]">
                  {quantity} {quantity === 1 ? "soporte" : "soportes"} ·{" "}
                  {style === "personalizado" ? "Personalizado" : "Común"}
                </p>
                <p className="mt-0.5 text-2xl font-bold tracking-[-0.03em] text-[#202333]">
                  ${total.toLocaleString("es-UY")}
                </p>
              </div>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flk-glossy inline-flex h-11 items-center justify-center gap-2 rounded-[11px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4F5EB0]"
              >
                <WhatsAppIcon className="h-4 w-4" />
                Pedir por WhatsApp
              </a>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function WhatsAppBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F7ED] px-2.5 py-1 text-[10px] font-bold text-[#147A5B] ring-1 ring-inset ring-[#25D366]/20">
      <WhatsAppIcon className="h-3.5 w-3.5" />
      Se coordina por WhatsApp
    </span>
  );
}

function WhatsAppIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${className} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.3a8.5 8.5 0 1 1 15.6-4.6Z" />
      <path d="M8.2 7.9c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.8 1.8c.1.3 0 .5-.2.7l-.6.7c-.2.2-.1.4 0 .6.6 1.1 1.5 1.9 2.6 2.5.2.1.4.1.6-.1l.8-1c.2-.2.4-.3.7-.2l1.8.9c.3.1.4.3.4.6 0 .4-.2 1.3-.8 1.8-.6.5-1.4.8-2.4.6-1-.2-2.3-.7-3.9-2.1-1.3-1.1-2.4-2.6-2.8-3.8-.4-1.2 0-2.3.4-2.8l.9-.2Z" />
    </svg>
  );
}

function StyleOption({
  active,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: typeof QrCode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative rounded-[14px] border p-4 text-left transition-colors ${
        active
          ? "border-[#5C6BC0] bg-[#F4F5FD]"
          : "border-[#E3E5F0] bg-white hover:border-[#BFC5EA]"
      }`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-[11px] ${
          active ? "bg-[#5C6BC0] text-white" : "bg-[#F3F4F8] text-[#7F879C]"
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      {active ? (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#5C6BC0] text-white">
          <Check className="h-3 w-3" aria-hidden="true" />
        </span>
      ) : null}
      <span className="mt-3 block text-sm font-semibold text-[#202333]">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-[#8891A4]">
        {description}
      </span>
    </button>
  );
}
