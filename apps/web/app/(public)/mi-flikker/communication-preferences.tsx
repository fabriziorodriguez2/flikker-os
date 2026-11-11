"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export interface ConsentPreference {
  businessId: string;
  businessName: string;
  whatsapp: { status: string; text: string };
  email: { available: boolean; status: string; text: string };
}

type Channel = "WHATSAPP" | "EMAIL";

/**
 * Mi Flikker → Cuenta → Comunicaciones. Por comercio, qué promociones acepta
 * recibir el cliente. Cambiar de opinión es tan fácil como aceptar. Una
 * supresión (pidió no ser contactado nunca) se muestra, pero no se puede
 * levantar desde acá: eso lo resuelve el comercio.
 */
export default function CommunicationPreferences() {
  const [items, setItems] = useState<ConsentPreference[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/mi-flikker/consents");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as ConsentPreference[];
        if (!cancelled) {
          setItems(data);
          setStatus("ok");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function change(businessId: string, channel: Channel, granted: boolean) {
    const key = `${businessId}:${channel}`;
    setSaving(key);
    setSaveError(null);
    try {
      const res = await fetch("/api/mi-flikker/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, channel, granted }),
      });
      if (!res.ok) throw new Error();
      const result = (await res.json()) as { status: string };
      setItems((current) =>
        (current ?? []).map((item) =>
          item.businessId !== businessId
            ? item
            : channel === "WHATSAPP"
              ? { ...item, whatsapp: { ...item.whatsapp, status: result.status } }
              : { ...item, email: { ...item.email, status: result.status } },
        ),
      );
    } catch {
      setSaveError(key);
    } finally {
      setSaving(null);
    }
  }

  if (status === "loading") {
    return (
      <p className="mt-3 flex items-center gap-2 text-[13px] text-[#8A90A6]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Cargando tus preferencias…
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="mt-3 text-[13px] text-[#8A90A6]">
        No pudimos cargar tus preferencias de comunicación.
      </p>
    );
  }
  if (!items?.length) return null;

  return (
    <div className="mt-3 rounded-[18px] border border-[#E7E8F1] bg-white p-4">
      <p className="text-[14px] font-bold text-[#1A1A24]">Comunicaciones</p>
      <p className="mt-0.5 text-[12px] leading-5 text-[#8A90A6]">
        Elegí de qué lugares querés recibir promociones. Tus visitas, sellos y
        premios no cambian.
      </p>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={item.businessId} className="border-t border-[#F0F1F6] pt-3 first:border-0 first:pt-0">
            <p className="text-[13px] font-semibold text-[#1A1A24]">{item.businessName}</p>
            <PreferenceRow
              id={`${item.businessId}:WHATSAPP`}
              text={item.whatsapp.text}
              status={item.whatsapp.status}
              saving={saving === `${item.businessId}:WHATSAPP`}
              failed={saveError === `${item.businessId}:WHATSAPP`}
              onChange={(granted) => void change(item.businessId, "WHATSAPP", granted)}
            />
            {item.email.available ? (
              <PreferenceRow
                id={`${item.businessId}:EMAIL`}
                text={item.email.text}
                status={item.email.status}
                saving={saving === `${item.businessId}:EMAIL`}
                failed={saveError === `${item.businessId}:EMAIL`}
                onChange={(granted) => void change(item.businessId, "EMAIL", granted)}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PreferenceRow({
  id,
  text,
  status,
  saving,
  failed,
  onChange,
}: {
  id: string;
  text: string;
  status: string;
  saving: boolean;
  failed: boolean;
  onChange: (granted: boolean) => void;
}) {
  const suppressed = status === "SUPPRESSED";
  return (
    <div className="mt-2">
      <label
        htmlFor={id}
        className="flex items-start gap-2.5 text-left text-[12px] leading-5 text-[#5A5A6E]"
      >
        <input
          id={id}
          type="checkbox"
          checked={status === "GRANTED"}
          disabled={saving || suppressed}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#5C6BC0]"
        />
        <span>{text}</span>
      </label>
      {suppressed ? (
        <p className="mt-1 pl-[26px] text-[12px] text-[#8A90A6]">
          Pediste no recibir mensajes de este lugar. Si querés volver a
          recibirlos, avisale al local.
        </p>
      ) : null}
      {failed ? (
        <p className="mt-1 pl-[26px] text-[12px] text-red-600">
          No pudimos guardarlo. Probá de nuevo.
        </p>
      ) : null}
    </div>
  );
}
