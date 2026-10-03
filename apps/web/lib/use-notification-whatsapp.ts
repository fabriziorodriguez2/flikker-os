"use client";

import { useCallback, useState } from "react";
import { isValidNationalPhone } from "@/components/ui/phone-input";
import {
  buildNotificationWhatsAppRequestBody,
  parseNotificationWhatsAppError,
  NOTIFICATION_WHATSAPP_GENERIC_ERROR,
} from "@/lib/notification-whatsapp";

export interface UseNotificationWhatsAppResult {
  /** Dígitos nacionales (sin +598) — el formato que maneja `PhoneInput`. */
  phone: string;
  setPhone: (value: string) => void;
  saving: boolean;
  error: string | null;
  /** Valida, guarda en `User.notificationWhatsapp` y devuelve si quedó guardado. */
  save: () => Promise<boolean>;
}

/**
 * Captura de WhatsApp compartida entre `/upgrade` (pre-onboarding) y
 * `UpgradePlanModal` (upgrade de un Business FREE ya existente) — las dos
 * únicas superficies que lo piden, siempre ANTES de abrir el checkout.
 *
 * Guarda en el User, nunca en el body del checkout — `lib/pro-checkout.ts`
 * documenta explícitamente que ese body nunca lleva teléfono.
 */
export function useNotificationWhatsApp(
  initialPhone: string,
): UseNotificationWhatsAppResult {
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (!isValidNationalPhone(phone)) {
      setError("Ingresá un WhatsApp válido.");
      return false;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/proxy/auth/me/notification-whatsapp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildNotificationWhatsAppRequestBody(phone)),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        setError(parseNotificationWhatsAppError(data));
        return false;
      }
      return true;
    } catch {
      setError(NOTIFICATION_WHATSAPP_GENERIC_ERROR);
      return false;
    } finally {
      setSaving(false);
    }
  }, [phone]);

  return { phone, setPhone, saving, error, save };
}
