import type { MiFlikkerTab } from "./bottom-nav";

export function MiFlikkerMark({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold ${light ? "text-white" : "text-[#17171D]"}`}
      aria-label="Mi Flikker"
    >
      Mi{/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/flikker-wordmark.svg"
        alt="Flikker"
        className={`h-3 w-auto ${light ? "brightness-0 invert" : ""}`}
      />
    </span>
  );
}

const sections: Record<MiFlikkerTab, [string, string]> = {
  lugares: ["Tus pases", "Tus lugares, progreso y premios en un solo lugar."],
  desafios: ["Desafíos", "Lo que tenés en curso en tus locales."],
  premios: ["Premios", "Tus beneficios, de todos tus lugares."],
  cuenta: ["Cuenta", "Con qué número estás identificado."],
};

export default function MiFlikkerHeader({
  tab,
  chip,
}: {
  tab: MiFlikkerTab;
  chip?: string | null;
}) {
  return (
    <header className="mb-4">
      <div className="mb-5 flex min-w-0 items-center justify-between gap-3">
        <MiFlikkerMark />
        {chip ? (
          <span
            className="max-w-[55%] truncate rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-[#33333E]"
            title={chip}
          >
            {chip}
          </span>
        ) : null}
      </div>
      <h1 className="text-[25px] font-bold leading-tight tracking-[-0.045em]">
        {sections[tab][0]}
      </h1>
      <p className="mt-1 text-[11px] leading-relaxed text-[#777780]">
        {sections[tab][1]}
      </p>
    </header>
  );
}
