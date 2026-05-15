"use client";

type ColorSwatchProps = {
  label: string;
  value: string;
  fallbackLabel?: string;
};

export default function ColorSwatch({
  label,
  value,
  fallbackLabel = "Sin definir",
}: ColorSwatchProps) {
  const normalized = value.trim();

  return (
    <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
        {label}
      </p>
      <div className="mt-4 flex items-center gap-4">
        <div
          className="h-12 w-12 shrink-0 rounded-2xl border border-[color:var(--border-strong)]"
          style={{
            backgroundColor: normalized || "transparent",
            backgroundImage: normalized
               undefined
              : "linear-gradient(135deg, rgba(145,136,245,0.16), rgba(220,226,240,0.6))",
          }}
        />
        <div>
          <p className="text-sm font-semibold text-[color:var(--foreground)]">
            {normalized || fallbackLabel}
          </p>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            {normalized  "Aplicado al perfil del negocio" : "Todavía sin configurar"}
          </p>
        </div>
      </div>
    </div>
  );
}
