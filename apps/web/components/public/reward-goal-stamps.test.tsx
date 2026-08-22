import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RewardGoalStamps from "./reward-goal-stamps";

function render(icon: string) {
  return renderToStaticMarkup(
    <RewardGoalStamps
      progress={2}
      target={8}
      cardColor="#F8F4EE"
      stampAreaColor="#FFFFFF"
      stampColor="#8B5E3C"
      icon={icon}
    />,
  );
}

describe("RewardGoalStamps", () => {
  it.each(["coffee", "gift", "star", "heart", "check"])(
    "renderiza el sello completado %s como ícono solo",
    (icon) => {
      const html = render(icon);
      const completed = html.match(
        /<span data-stamp-state="completed"[^>]*>([\s\S]*?)<\/span>/,
      )?.[0];

      expect(completed).toBeDefined();
      expect(completed).toContain("color:#8B5E3C");
      expect(completed).not.toContain("background-color:#8B5E3C");
      expect(completed).not.toContain("border-color:#8B5E3C");
      expect(completed).toContain("h-[70%]");
    },
  );

  it("mantiene los sellos incompletos como círculos con borde y número", () => {
    const html = render("coffee");
    const empty = html.match(
      /<span data-stamp-state="empty"[^>]*>([\s\S]*?)<\/span>/,
    )?.[0];

    expect(empty).toBeDefined();
    expect(empty).toContain("rounded-full");
    expect(empty).toContain("border-[1.5px]");
    expect(empty).toContain("03");
  });

  it("recolorea también un ícono personalizado usando una máscara", () => {
    const customIcon =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
    const html = render(customIcon);

    expect(html).toContain("mask-image:url(&quot;data:image/svg+xml");
    expect(html).toContain("background-color:#8B5E3C");
    expect(html).not.toContain("<img");
  });
});
