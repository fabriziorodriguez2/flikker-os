"use client";

import { useEffect, useState } from "react";
import Flik, { type FlikPose } from "@/components/ui/flik";

const STORAGE_KEY = "flikker-onboarding-completed";

interface Step {
  pose: FlikPose;
  title: string | null;
  text: string;
  buttonText: string;
  highlight: string | null;
}

const STEPS: Step[] = [
  {
    pose: "celebrando",
    title: "¡Bienvenido a Flikker!",
    text: "Soy Flik, tu asistente. Te muestro en 1 minuto cómo sacarle el jugo al sistema.",
    buttonText: "Vamos →",
    highlight: null,
  },
  {
    pose: "normal",
    title: null,
    text: "El Panel es tu vista del día. Acá marcás los clientes que atendiste y Flikker hace el resto.",
    buttonText: "Siguiente →",
    highlight: "panel",
  },
  {
    pose: "guino",
    title: null,
    text: "Acá vivé tu base de contactos. Cada cliente que pasa por Flikker queda guardado para siempre.",
    buttonText: "Siguiente →",
    highlight: "clientes",
  },
  {
    pose: "normal",
    title: null,
    text: "Este es tu QR para el local. Poné el cartelito en el mostrador y los clientes se registran solos.",
    buttonText: "Siguiente →",
    highlight: "qr",
  },
  {
    pose: "guino",
    title: null,
    text: "Desde acá mandás mensajes a toda tu base cuando quieras. Promos, recordatorios, novedades.",
    buttonText: "Siguiente →",
    highlight: "campaigns",
  },
  {
    pose: "celebrando",
    title: "¡Todo listo!",
    text: "Empezá marcando tu primer cliente atendido. El sistema se encarga del resto.",
    buttonText: "Ir al Panel",
    highlight: null,
  },
];

function applyHighlight(key: string | null) {
  document.querySelectorAll("[data-onboarding].onboarding-highlight").forEach((el) => {
    el.classList.remove("onboarding-highlight");
  });
  if (key) {
    document
      .querySelectorAll(`[data-onboarding="${key}"]`)
      .forEach((el) => el.classList.add("onboarding-highlight"));
  }
}

interface OnboardingTourProps {
  alreadyCompleted?: boolean;
}

export default function OnboardingTour({
  alreadyCompleted = false,
}: OnboardingTourProps) {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (alreadyCompleted) {
      // Server is the source of truth — keep the local cache in sync.
      window.localStorage.setItem(STORAGE_KEY, "true");
      return;
    }
    // Server says not completed → clear any stale local cache (e.g. after
    // an admin reset from the platform panel) and show the tour.
    window.localStorage.removeItem(STORAGE_KEY);
    setVisible(true);
  }, [alreadyCompleted]);

  useEffect(() => {
    if (!visible) {
      applyHighlight(null);
      return;
    }
    applyHighlight(STEPS[index]?.highlight ?? null);
    return () => applyHighlight(null);
  }, [visible, index]);

  function finish() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "true");
    }
    applyHighlight(null);
    setVisible(false);
    void fetch("/api/proxy/auth/me/onboarding-complete", {
      method: "POST",
    }).catch(() => {
      // Server-side persistence is best-effort. localStorage already covers
      // the same browser; cross-device will retry on next dashboard load.
    });
  }

  function next() {
    if (index === STEPS.length - 1) {
      finish();
      return;
    }
    setFading(true);
    window.setTimeout(() => {
      setIndex((i) => Math.min(i + 1, STEPS.length - 1));
      setFading(false);
    }, 160);
  }

  if (!visible) return null;

  const step = STEPS[index]!;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Guía de bienvenida"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          backgroundColor: "#ffffff",
          borderRadius: 16,
          padding: 24,
          position: "relative",
          boxShadow: "0 24px 48px rgba(13,27,42,0.28)",
          opacity: fading ? 0 : 1,
          transition: "opacity 0.16s ease",
        }}
      >
        <button
          type="button"
          onClick={finish}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "transparent",
            border: "none",
            color: "#8891A4",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Saltar
        </button>

        <div className="flex justify-center">
          <Flik pose={step.pose} size={96} />
        </div>

        {step.title && (
          <h2
            className="font-display"
            style={{
              marginTop: 24,
              fontSize: 20,
              fontWeight: 700,
              color: "#1A202C",
              textAlign: "center",
            }}
          >
            {step.title}
          </h2>
        )}

        <p
          style={{
            marginTop: step.title ? 8 : 24,
            fontSize: 14,
            color: "#4A5568",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          {step.text}
        </p>

        <div
          style={{
            marginTop: 24,
            display: "flex",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 9999,
                backgroundColor: i === index ? "#5C6BC0" : "#E8EAF0",
                transition: "background-color 0.2s ease",
              }}
            />
          ))}
        </div>

        <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={next}
            className="hover:bg-[#4e5db0]"
            style={{
              minWidth: 140,
              padding: "10px 20px",
              borderRadius: 10,
              backgroundColor: "#5C6BC0",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            {step.buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}
