import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LoyaltyCard from "./loyalty-card";
import { PersonalScreen } from "@/app/(public)/check-in/[token]/checkin-client";
import type { CheckinLanding } from "@/app/(public)/check-in/[token]/page";
import ProgramDesignTab from "@/app/(panel)/dashboard/programa/program-design-tab";
import ProgramCardSection from "@/app/(panel)/dashboard/programa/program-card-section";
import type { LoyaltyAppearance } from "@/app/(panel)/dashboard/programa/types";

const business = {
  businessName: "Panadería Real",
  logoUrl: "https://assets.example.com/logo.png",
  primaryColor: "#ED842B",
  checkinBackgroundColor: null,
  googleBusinessProfileUrl: null,
  loyaltyCardColor: "#ED842B",
  loyaltyCardTextColor: "#171A2B",
  loyaltyCardBackgroundImage: null,
  loyaltyStampAreaColor: "#FFFFFF",
  loyaltyStampColor: "#ED842B",
  loyaltyStampIcon: "coffee",
  loyaltyShowBusinessName: true,
  loyaltyStampBackgroundPattern: "none",
  loyaltyStampBackgroundOpacity: null,
};
const landing: CheckinLanding = {
  business,
  source: { name: "Entrada", type: "qr" },
  benefit: null,
  benefitText: null,
  welcomeMessage: null,
};
type Personal = Parameters<typeof PersonalScreen>[0]["personal"];
const personal: Personal = {
  customer: { name: "Ana García" },
  visits: { total: 8, lastAt: null },
  benefit: null,
  rewardGoal: {
    goal: {
      incentiveName: "Una merienda para compartir",
      progressVisits: 3,
      targetAdditionalVisits: 6,
      remainingVisits: 3,
    },
    unlockedNow: false,
    benefit: null,
  },
  reviewPrompt: { show: false, googleUrl: null },
  otherBenefits: [],
  missions: [],
};
const appearance: LoyaltyAppearance = {
  ...business,
  checkinWelcomeMessage: null,
};
function customer(
  data = personal,
  screenLanding = landing,
  status: "checked_in" | "duplicate" = "duplicate",
) {
  return renderToStaticMarkup(
    <PersonalScreen
      landing={screenLanding}
      personal={data}
      token="token-fixture"
      checkinStatus={status}
      onSwitchAccount={() => undefined}
    />,
  );
}
const header = (html: string) => html.match(/<header[\s\S]*?<\/header>/)?.[0];
const stampStates = (html: string) =>
  [...html.matchAll(/data-stamp-state="(completed|empty)"/g)].map(
    (match) => match[1],
  );

describe("Customer loyalty experience — real branding and states", () => {
  it("uses the configured logo, name and exact brand/stamp colors", () => {
    const html = customer();
    expect(header(html)).toContain(business.logoUrl);
    expect(header(html)).toContain(business.businessName);
    expect(html).toContain("background-color:#ED842B");
    expect(html).toContain("lucide-coffee");
    expect(html).not.toContain("Bar Fraternidad");
    expect(html).toContain('data-loyalty-layout="experience"');
  });
  it("has an initial fallback without inventing a logo or putting it in a circle", () => {
    const html = customer(personal, {
      ...landing,
      business: { ...business, logoUrl: null },
    });
    expect(header(html)).toContain("data-business-fallback");
    expect(header(html)).not.toContain("<img");
    expect(header(html)).not.toContain("rounded-full");
  });
  it("separates visit status from greeting and preserves the secondary duplicate message", () => {
    const html = customer();
    expect(html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0]).toContain("Hola, Ana");
    expect(html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0]).not.toContain("contada");
    expect(html).toContain('role="status"');
    expect(html).toContain("Tu visita de hoy ya está contada");
    expect(html).toContain("Tu tarjeta no cambió con esta visita.");
    expect(html).toContain("8 visitas");
  });
  it("a new counted visit does not claim the card stayed unchanged", () => {
    const html = customer(personal, landing, "checked_in");
    expect(html).toContain("Tu visita quedó guardada");
    expect(html).not.toContain("Tu tarjeta no cambió");
  });
  it("uses current/target and the reward exactly as supplied", () => {
    const html = customer();
    expect(stampStates(html)).toEqual([
      "completed",
      "completed",
      "completed",
      "empty",
      "empty",
      "empty",
    ]);
    expect(html).toContain("3 de 6 sellos");
    expect(html).toContain(personal.rewardGoal!.goal!.incentiveName);
    expect(html).not.toMatch(/>0[456]</);
  });
  it("stamps OFF does not invent progress or a reward", () => {
    const html = customer({ ...personal, rewardGoal: null });
    expect(stampStates(html)).toHaveLength(0);
    expect(html).not.toContain("data-loyalty-reward");
    expect(html).toContain('href="/mi-flikker"');
    expect(html).toContain("Cambiar de cuenta");
    expect(html).toContain("Powered by Flikker");
  });
  it("unlocked reward remains actionable without a fake next goal or duplicate benefit", () => {
    const reward = {
      name: "Premio desbloqueado real",
      code: "real-emission",
      expiresAt: null,
    };
    const html = customer({
      ...personal,
      rewardGoal: { goal: null, unlockedNow: true, benefit: reward },
      otherBenefits: [
        {
          type: "gift",
          title: reward.name,
          description: null,
          terms: null,
          redemption: { code: reward.code, redeemed: false },
        },
      ],
    });
    expect(html.match(/Premio desbloqueado real/g)).toHaveLength(1);
    expect(html).toContain("Completaste la tarjeta");
    expect(html).toContain("Deslizá para reclamar");
    expect(stampStates(html)).toHaveLength(0);
  });
  it("long reward and business text can wrap instead of truncating", () => {
    const html = renderToStaticMarkup(
      <LoyaltyCard
        rewardName={"Premio muy extenso ".repeat(12)}
        progress={6}
        target={6}
        appearance={{
          businessName: "Nombre extenso ".repeat(8),
          cardColor: "#173C32",
          textColor: "#FFFFFF",
        }}
      />,
    );
    expect(html).toContain("break-words");
    expect(html).not.toContain("truncate");
    expect(html).toContain("6 de 6 sellos");
    expect(html).toContain("background-color:#173C32");
  });
});

describe("Panel preview — same shared customer composition", () => {
  it("uses exactly the customer header/branding and configured reward", () => {
    const preview = renderToStaticMarkup(
      <ProgramDesignTab
        appearance={appearance}
        businessName={business.businessName}
        rewardName={personal.rewardGoal!.goal!.incentiveName}
        stampsRequired={6}
        canMutate
        onSave={async () => undefined}
      />,
    );
    expect(header(preview)).toBe(header(customer()));
    expect(preview).toContain('data-loyalty-layout="experience"');
    expect(preview).toContain("inert");
    expect(preview).toContain("Tu visita de hoy ya está contada");
    expect(preview).toContain(personal.rewardGoal!.goal!.incentiveName);
    expect(preview).toContain("Color principal / encabezado");
    expect(preview).toContain("Los pendientes se muestran en contorno");
  });
  it("benefits-only also allows branding edits and has no invented stamps/reward", () => {
    const props = {
      overview: { enabled: false, reward: null, stampsRequired: 0, stats: {} },
      benefits: [],
      appearance,
      businessName: business.businessName,
      canMutate: true,
      onToggle: async () => undefined,
      onSaveConfig: async () => undefined,
      onSaveDesign: async () => undefined,
      onReload: async () => undefined,
      onGoToPremios: () => undefined,
    };
    const html = renderToStaticMarkup(
      <ProgramCardSection
        {...(props as unknown as Parameters<typeof ProgramCardSection>[0])}
      />,
    );
    expect(html).toContain("Color principal / encabezado");
    expect(html).toContain('data-loyalty-layout="experience"');
    expect(stampStates(html)).toHaveLength(0);
    expect(html).not.toContain("data-loyalty-reward");
  });
});
