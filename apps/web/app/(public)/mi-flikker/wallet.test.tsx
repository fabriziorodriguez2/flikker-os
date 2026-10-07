import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlacePass, type MyFlikkerPlace } from "./mi-flikker-client";
import AccountTab from "./account-tab";
import BottomNav from "@/components/public/bottom-nav";
import MiFlikkerHeader from "@/components/public/mi-flikker-header";
import WalletChallengeCard, {
  challengeDaysLeft,
} from "@/components/public/wallet-challenge-card";
import type { ReturnChallengeCard, MissionChallenge } from "./challenges-tab";

const place: MyFlikkerPlace = {
  businessId: "real-business",
  businessName: "Negocio de prueba",
  logoUrl: "/real-logo.svg",
  primaryColor: "#F08027",
  loyaltyCardColor: "#F08027",
  loyaltyCardTextColor: null,
  loyaltyCardBackgroundImage: null,
  loyaltyStampAreaColor: null,
  loyaltyStampColor: null,
  loyaltyStampIcon: null,
  loyaltyShowBusinessName: true,
  loyaltyStampBackgroundPattern: null,
  loyaltyStampBackgroundOpacity: null,
  visitsTotal: 3,
  lastVisitAt: null,
  rewardGoal: {
    incentiveName: "Un café",
    progressVisits: 3,
    targetAdditionalVisits: 6,
    remainingVisits: 3,
  },
  benefitAvailable: null,
};
const challenge: ReturnChallengeCard = {
  kind: "return_challenge",
  businessId: "real-business",
  businessName: "Negocio de prueba",
  logoUrl: "/real-logo.svg",
  challengeId: "rc",
  deadlineDayKey: "2026-10-11",
  timezone: "America/Montevideo",
};
const now = new Date("2026-10-07T12:00:00Z");
const renderPass = (override: Partial<MyFlikkerPlace> = {}) =>
  renderToStaticMarkup(<PlacePass place={{ ...place, ...override }} />);

describe("Wallet passes", () => {
  it("uses the actual logo, configured color, goal progress and destination", () => {
    const html = renderPass();
    expect(html).toContain("/real-logo.svg");
    expect(html).toContain("background-color:#F08027");
    expect(html).toContain('aria-label="3 de 6 sellos"');
    expect(html).toContain('href="/mi-flikker/real-business"');
    expect(html).toContain("Te faltan 3 para tu premio");
    expect(html.match(/h-2 w-2 rounded-full border/g)).toHaveLength(6);
  });
  it("chooses contrasting text on both light and dark business colors", () => {
    expect(renderPass({ loyaltyCardColor: "#FFFFFF" })).toContain(
      "color:#171A2B",
    );
    expect(
      renderPass({
        loyaltyCardColor: "#19191F",
        loyaltyCardTextColor: "#111111",
      }),
    ).toContain("color:#FFFFFF");
  });
  it("never creates a goal for a place without visits", () => {
    const html = renderPass({ visitsTotal: 0, rewardGoal: null });
    expect(html).toContain("Todavía no registraste visitas");
    expect(html).not.toContain("aria-label=");
    expect(html).not.toContain("/6");
  });
  it("counts each available issuance, including other benefits", () => {
    expect(
      renderPass({
        benefitAvailable: { name: "Un café", code: "secret", expiresAt: null },
        otherBenefits: [{ title: "Un café", code: "another-secret" }],
      }),
    ).toContain("2 premios disponibles");
    expect(
      renderPass({ otherBenefits: [{ title: "Otro", code: "secret" }] }),
    ).not.toContain("secret");
  });
  it("keeps long and untrusted names as escaped text", () => {
    expect(
      renderPass({ businessName: "<script>un nombre largo</script>" }),
    ).toContain("&lt;script&gt;");
  });
});

describe("Wallet challenges", () => {
  it("derives remaining days from the business calendar", () => {
    expect(challengeDaysLeft(challenge, now)).toBe(4);
    expect(challengeDaysLeft(challenge, new Date("2026-10-08T01:00:00Z"))).toBe(
      4,
    );
    expect(
      challengeDaysLeft({ ...challenge, timezone: undefined }, now),
    ).toBeNull();
  });
  it("shows urgency only when supported by the deadline", () => {
    const active = renderToStaticMarkup(
      <WalletChallengeCard challenge={challenge} now={now} />,
    );
    expect(active).toContain("4 días");
    expect(active).not.toContain("Vence pronto");
    expect(active).toContain("+1 sello extra");
    expect(
      renderToStaticMarkup(
        <WalletChallengeCard
          challenge={challenge}
          now={new Date("2026-10-10T12:00Z")}
        />,
      ),
    ).toContain("Vence pronto");
  });
  it("renders completed missions from status and reward fields", () => {
    const mission: MissionChallenge = {
      ...challenge,
      kind: "mission",
      missionId: "m",
      name: "Misión real",
      description: null,
      status: "COMPLETED",
      progress: { current: 3, target: 3, remaining: 0, complete: true },
      endsAt: "2026-10-12T03:00Z",
      lastDayKey: "2026-10-11",
      timezone: "America/Montevideo",
      rewardName: "Premio real",
      rewardHidden: false,
      rewardCode: "REAL",
    };
    const html = renderToStaticMarkup(
      <WalletChallengeCard challenge={mission} now={now} />,
    );
    expect(html).toContain("Completado");
    expect(html).toContain("Premio real");
    expect(html).not.toContain("Vence pronto");
  });
});

describe("Shared wallet header, identity and navigation", () => {
  it("uses the real wordmark and contextual header", () => {
    const html = renderToStaticMarkup(
      <MiFlikkerHeader tab="lugares" chip="8 lugares" />,
    );
    expect(html).toContain("Tus pases");
    expect(html).toContain("8 lugares");
    expect(html).toContain("/flikker-wordmark.svg");
  });
  it("shows verified identity and real metrics, with logout outside the card", () => {
    const html = renderToStaticMarkup(
      <AccountTab
        profile={{ name: "Valentina", phone: "+59891234567" }}
        metrics={{ places: 8, rewards: 2, challenges: 3 }}
        onLogout={() => undefined}
        loggingOut={false}
      />,
    );
    expect(html).toContain("Valentina");
    expect(html).toContain("+598 91 234 567");
    expect(html).toContain("Tu resumen");
    expect(html).toContain("Cerrar sesión");
    expect(html.indexOf("Cerrar sesión")).toBeGreaterThan(
      html.indexOf("</section>"),
    );
  });
  it("does not fabricate identity or metrics while reads are pending", () => {
    const html = renderToStaticMarkup(
      <AccountTab
        profile={null}
        metrics={null}
        onLogout={() => undefined}
        loggingOut
      />,
    );
    expect(html).toContain("Cargando");
    expect(html).toContain("Cerrando");
    expect(html).not.toContain("Tu resumen");
    expect(html).not.toContain("Valentina");
  });
  it.each(["lugares", "desafios", "premios", "cuenta"] as const)(
    "marks only %s active and retains the existing links",
    (active) => {
      const html = renderToStaticMarkup(
        <BottomNav active={active} rewardsBadge={2} />,
      );
      expect(html.match(/data-active="true"/g)).toHaveLength(1);
      expect(html).toContain(`data-tab="${active}" data-active="true"`);
      expect(html).toContain('href="/mi-flikker?tab=premios"');
      expect(html).toContain("bg-[#19191F]");
      expect(html).toContain("background-color:#FFFFFF");
    },
  );
});
