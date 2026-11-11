import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PlaceActivity, {
  activityGroup,
  type PlaceActivityItem,
  type PlaceActivityPage,
} from "./place-activity";
import LoyaltyCard from "./loyalty-card";

const now = new Date("2026-10-07T20:00:00Z");
const item: PlaceActivityItem = {
  id: "visit:a",
  type: "VISIT",
  occurredAt: now.toISOString(),
  title: "Registraste una visita",
  description: "Visitaste Café A",
};
const page: PlaceActivityPage = {
  items: [item],
  total: 1,
  timezone: "America/Montevideo",
  nextCursor: null,
  snapshot: now.toISOString(),
};
const render = (value: PlaceActivityPage | null, extra = {}) =>
  renderToStaticMarkup(
    <PlaceActivity businessName="Café A" page={value} now={now} {...extra} />,
  );

describe("Business activity", () => {
  it("groups by the business date, including UTC midnight", () => {
    expect(
      activityGroup("2026-10-08T01:00:00Z", page.timezone, now).label,
    ).toBe("Hoy");
    expect(
      activityGroup("2026-10-07T01:00:00Z", page.timezone, now).label,
    ).toBe("Ayer");
    expect(
      activityGroup(
        "2026-08-05T12:00:00Z",
        page.timezone,
        now,
      ).label.toLowerCase(),
    ).toBe("agosto");
    expect(
      activityGroup("2025-08-05T12:00:00Z", page.timezone, now).label,
    ).toContain("2025");
  });
  it("handles yesterday across month boundaries and daylight saving", () => {
    expect(
      activityGroup(
        "2026-02-28T20:00:00Z",
        "UTC",
        new Date("2026-03-01T02:00:00Z"),
      ).label,
    ).toBe("Ayer");
    expect(
      activityGroup(
        "2026-03-08T05:30:00Z",
        "America/New_York",
        new Date("2026-03-09T04:15:00Z"),
      ).label,
    ).toBe("Ayer");
  });
  it("shows the real total rather than the number loaded", () => {
    const html = render({ ...page, total: 47, nextCursor: "next" });
    expect(html).toContain("47 movimientos");
    expect(html).toContain("Ver más");
  });
  it("has a quiet footer for few events and no fabricated rows for zero", () => {
    expect(render(page)).toContain("1 movimiento");
    expect(render({ ...page, total: 2 })).toContain("Tus próximos sellos");
    const empty = render({ ...page, total: 0, items: [] });
    expect(empty).toContain("Todavía no hay actividad");
    expect(empty).not.toContain("Registraste una visita");
  });
  it("distinguishes failed reads from empty history", () => {
    expect(render(null, { loading: true })).toContain("Cargando tu actividad");
    const html = render(null, { error: true });
    expect(html).toContain("Reintentar");
    expect(html).not.toContain("Todavía no hay actividad");
  });
  it("renders all event types with status chips and configured stamp icons", () => {
    const types: PlaceActivityItem["type"][] = [
      "VISIT",
      "STAMP_EARNED",
      "BENEFIT_UNLOCKED",
      "BENEFIT_REDEEMED",
      "BENEFIT_EXPIRED",
      "MISSION_COMPLETED",
      "FEEDBACK_SENT",
    ];
    const html = render(
      {
        ...page,
        total: 7,
        items: types.map((type) => ({ ...item, type, id: type })),
      },
      { stampIcon: "coffee", stampColor: "#ED842B" },
    );
    expect(html).toContain("Canjeado");
    expect(html).toContain("Vencido");
    expect(html).toContain("lucide-coffee");
    expect(html).toContain("line-through");
    expect(html.match(/<li /g)).toHaveLength(7);
  });
  it("escapes long persisted text and keeps time separate from title", () => {
    const html = render({
      ...page,
      items: [{ ...item, title: "<script>un título muy largo</script>" }],
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("break-words");
    expect(html).toContain("<time");
  });
  it("keeps the compact card separate from the check-in experience", () => {
    const html = renderToStaticMarkup(
      <LoyaltyCard
        compact
        rewardName="Un café"
        progress={3}
        target={6}
        appearance={{ cardColor: "#ED842B", stampIcon: "coffee" }}
      />,
    );
    expect(html).toContain('data-loyalty-layout="compact"');
    expect(html).toContain("Te faltan 3 sellos");
    expect(html).not.toContain("Powered by");
    expect(html.match(/data-stamp-state=/g)).toHaveLength(6);
  });
});
