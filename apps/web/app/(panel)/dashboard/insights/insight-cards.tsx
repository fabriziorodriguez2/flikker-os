import HighlightedText from "./highlighted-text";

export interface InsightStatement {
  id: string;
  statement: string;
  kind: "positive" | "warning" | "neutral";
  hasEnoughData: boolean;
}

const KIND_STYLES: Record<InsightStatement["kind"], string> = {
  positive: "border-[#1D9E75]/20 bg-[#EFF9F5] text-[#12795A]",
  warning: "border-[#F5842A]/25 bg-[#FFF6ED] text-[#B5540E]",
  neutral: "border-[#E5E6EC] bg-white text-[#4A5568]",
};

/**
 * Afirmaciones ya narradas por el backend (`insights-narrator.ts`) — nunca
 * un gráfico sin explicación. Cuando `hasEnoughData` es `false`, la
 * afirmación lo dice explícitamente en vez de mostrar un número dudoso.
 */
export default function InsightCards({
  insights,
}: {
  insights: InsightStatement[];
}) {
  if (insights.length === 0) {
    return (
      <div className="rounded-[16px] border border-[#E5E6EC] bg-white p-6 text-sm text-[#8891A4]">
        Todavía no hay suficiente actividad registrada para mostrar insights.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {insights.map((insight) => (
        <div
          key={insight.id}
          className={`rounded-[14px] border p-4 text-sm leading-relaxed ${KIND_STYLES[insight.kind]} ${
            insight.hasEnoughData ? "" : "opacity-80"
          }`}
        >
          {!insight.hasEnoughData && (
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8891A4]">
              Todavía no hay suficiente información
            </span>
          )}
          <HighlightedText text={insight.statement} />
        </div>
      ))}
    </div>
  );
}
