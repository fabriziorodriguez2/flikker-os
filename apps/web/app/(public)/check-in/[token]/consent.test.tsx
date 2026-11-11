import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CheckinClient, {
  MarketingConsentPrompt,
  whatsappConsentText,
} from "./checkin-client";
import type { CheckinLanding } from "./page";
import { PreferenceRow } from "../../mi-flikker/communication-preferences";

/**
 * Consentimiento promocional: la casilla nunca viene marcada, nunca bloquea
 * el registro, dice de qué comercio se trata y una supresión no se levanta
 * desde la pantalla del cliente.
 */
const landing: CheckinLanding = {
  source: { name: "Principal", type: "qr" },
  business: {
    businessName: "Café Uno",
    logoUrl: null,
    primaryColor: "#5C6BC0",
    checkinBackgroundColor: null,
    googleBusinessProfileUrl: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  benefit: null,
  benefitText: null,
  welcomeMessage: null,
};

const checkboxes = (html: string) => html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];

describe("casilla del registro", () => {
  it("muestra el texto del servidor, desmarcada, y no es obligatoria", () => {
    const html = renderToStaticMarkup(
      <CheckinClient
        token="tok-1"
        landing={{
          ...landing,
          consentText:
            "Quiero recibir promociones y beneficios de Café Uno por WhatsApp. Puedo darme de baja cuando quiera respondiendo BAJA.",
        }}
        hasSession={false}
      />,
    );
    expect(html).toContain("Quiero recibir promociones y beneficios de Café Uno por WhatsApp");
    const [box] = checkboxes(html);
    expect(box).toBeDefined();
    expect(box).not.toContain("checked");
    expect(box).not.toContain("required");
  });

  it("sin texto del servidor (preview del panel) arma el mismo con el nombre del comercio", () => {
    const html = renderToStaticMarkup(
      <CheckinClient token="tok-1" landing={landing} hasSession={false} />,
    );
    expect(html).toContain(whatsappConsentText("Café Uno"));
  });
});

describe("casilla después del check-in (clientes que ya existían)", () => {
  it("arranca desmarcada y con el texto del comercio", () => {
    const html = renderToStaticMarkup(
      <MarketingConsentPrompt text="Quiero recibir promociones y beneficios de Café Uno por WhatsApp." />,
    );
    expect(html).toContain("Café Uno");
    expect(checkboxes(html)[0]).not.toContain("checked");
  });
});

describe("Mi Flikker → Comunicaciones", () => {
  const row = (status: string) =>
    renderToStaticMarkup(
      <PreferenceRow
        id="biz:WHATSAPP"
        text="Quiero recibir promociones y beneficios de Café Uno por WhatsApp."
        status={status}
        saving={false}
        failed={false}
        onChange={() => undefined}
      />,
    );

  it("marcada solo si hay un sí vigente", () => {
    expect(checkboxes(row("GRANTED"))[0]).toContain("checked");
    expect(checkboxes(row("UNKNOWN"))[0]).not.toContain("checked");
    expect(checkboxes(row("REVOKED"))[0]).not.toContain("checked");
  });

  it("una supresión se muestra bloqueada, con el motivo", () => {
    const html = row("SUPPRESSED");
    expect(checkboxes(html)[0]).toContain("disabled");
    expect(html).toContain("Pediste no recibir mensajes de este lugar");
  });
});
