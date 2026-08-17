import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CheckinClient from "./checkin-client";
import type { CheckinLanding } from "./page";

const landing: CheckinLanding = {
  source: { name: "Principal", type: "qr" },
  business: {
    businessName: "Café Uno",
    logoUrl: null,
    primaryColor: "#5C6BC0",
    googleBusinessProfileUrl: "https://g.page/cafe",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  benefit: null,
  benefitText: null,
  welcomeMessage: null,
};

function render(hasSession: boolean) {
  return renderToStaticMarkup(
    <CheckinClient token="tok-1" landing={landing} hasSession={hasSession} />,
  );
}

describe("CheckinClient initial render", () => {
  it("shows the first-visit form when there is no session", () => {
    const html = render(false);
    expect(html).toContain("Tu nombre");
    expect(html).toContain("Registrar mi visita");
    // Recovery is offered without exposing anything private.
    expect(html).toContain("Ya soy cliente");
  });

  it("does not leak a Google review link on the first-visit form", () => {
    const html = render(false);
    const googleLinks = Array.from(html.matchAll(/href="([^"]+)"/g))
      .map((m) => m[1])
      .filter((h) => h.includes("google") || h.includes("g.page"));
    expect(googleLinks).toHaveLength(0);
  });
});
