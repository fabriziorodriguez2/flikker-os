import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FeedbackLanding from "./feedback-landing";

const googleReviewUrl = "https://google.com/review/example";

function render(score: 1 | 2 | 3 | 4 | 5) {
  return renderToStaticMarkup(
    <FeedbackLanding
      token="token-1"
      businessName="Clinica Test"
      googleReviewUrl={googleReviewUrl}
      initialScore={score}
    />,
  );
}

function googleLinks(html: string) {
  return Array.from(html.matchAll(/href="([^"]+)"/g))
    .map((match) => match[1])
    .filter((href) => href.includes("google.com") || href.includes("g.page"));
}

describe("FeedbackLanding anti-gating compliance", () => {
  it.each([1, 2, 3] as const)(
    "does not render any Google link for score=%s",
    (score) => {
      expect(googleLinks(render(score))).toHaveLength(0);
    },
  );

  it.each([4, 5] as const)(
    "renders exactly one Google link for score=%s",
    (score) => {
      expect(googleLinks(render(score))).toHaveLength(1);
    },
  );
});
