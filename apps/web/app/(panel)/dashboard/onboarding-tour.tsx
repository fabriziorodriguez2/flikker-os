"use client";

import { useEffect, useRef, useState } from "react";
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
    buttonText: "Vamos",
    highlight: null,
  },
  {
    pose: "normal",
    title: null,
    text: "El Panel es tu vista del día. Acá marcás los clientes que atendiste y Flikker hace el resto.",
    buttonText: "Siguiente",
    highlight: "panel",
  },
  {
    pose: "guino",
    title: null,
    text: "Acá vivé tu base de contactos. Cada cliente que pasa por Flikker queda guardado para siempre.",
    buttonText: "Siguiente",
    highlight: "clientes",
  },
  {
    pose: "normal",
    title: null,
    text: "Este es tu QR para el local. Poné el cartelito en el mostrador y los clientes se registran solos.",
    buttonText: "Siguiente",
    highlight: "qr",
  },
  {
    pose: "guino",
    title: null,
    text: "Desde acá mandás mensajes a toda tu base cuando quieras. Promos, recordatorios, novedades.",
    buttonText: "Siguiente",
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
  document
    .querySelectorAll("[data-onboarding].onboarding-highlight")
    .forEach((el) => el.classList.remove("onboarding-highlight"));
  if (key) {
    document
      .querySelectorAll(`[data-onboarding="${key}"]`)
      .forEach((el) => el.classList.add("onboarding-highlight"));
  }
}

interface OnboardingTourProps {
  alreadyCompleted?: boolean;
}

interface TravelerCoords {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
}

export default function OnboardingTour({
  alreadyCompleted = false,
}: OnboardingTourProps) {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [traveler, setTraveler] = useState<TravelerCoords | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (alreadyCompleted) {
      window.localStorage.setItem(STORAGE_KEY, "true");
      return;
    }
    window.localStorage.removeItem(STORAGE_KEY);
    setVisible(true);
  }, [alreadyCompleted]);

  useEffect(() => {
    if (!visible) {
      applyHighlight(null);
      setTraveler(null);
      return;
    }
    const key = STEPS[index]?.highlight ?? null;
    applyHighlight(key);

    if (!key) {
      setTraveler(null);
      return;
    }

    function computeTraveler() {
      const target = document.querySelector<HTMLElement>(
        `[data-onboarding="${key}"]`,
      );
      const card = cardRef.current;
      if (!target || !card) return;
      const targetRect = target.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const targetCx = targetRect.left + targetRect.width / 2;
      const targetCy = targetRect.top + targetRect.height / 2;
      const startCx = cardRect.left + cardRect.width / 2;
      const startCy = cardRect.top + cardRect.height / 2;
      const startX =
        targetCx < startCx ? cardRect.left : cardRect.right;
      setTraveler({
        startX,
        startY: startCy,
        targetX: targetCx,
        targetY: targetCy,
      });
    }

    computeTraveler();
    window.addEventListener("resize", computeTraveler);
    return () => {
      window.removeEventListener("resize", computeTraveler);
      applyHighlight(null);
    };
  }, [visible, index]);

  function finish() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "true");
    }
    applyHighlight(null);
    setVisible(false);
    void fetch("/api/proxy/auth/me/onboarding-complete", {
      method: "POST",
    }).catch(() => {});
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
    <>
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
          ref={cardRef}
          style={{
            width: "100%",
            maxWidth: 480,
            backgroundColor: "#ffffff",
            borderRadius: 16,
            padding: 28,
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

          <div className="flex justify-center" style={{ minHeight: 140 }}>
            <Flik pose={step.pose} size={140} />
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

          <div
            style={{ marginTop: 24, display: "flex", justifyContent: "center" }}
          >
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

      {/* Traveler dot — flies from card edge to highlighted section */}
      {traveler && !fading && (
        <div
          className="onboarding-traveler"
          style={
            {
              "--start-x": `${traveler.startX}px`,
              "--start-y": `${traveler.startY}px`,
              "--target-x": `${traveler.targetX}px`,
              "--target-y": `${traveler.targetY}px`,
            } as React.CSSProperties
          }
        />
      )}
    </>
  );
}
