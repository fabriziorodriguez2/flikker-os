"use client";

interface CampaignStatusToggleProps {
  active: boolean;
  saving?: boolean;
  onToggle: () => void;
}

export default function CampaignStatusToggle({
  active,
  saving = false,
  onToggle,
}: CampaignStatusToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={saving}
      aria-pressed={active}
      aria-label={active ? "Desactivar campaña" : "Activar campaña"}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        active ? "bg-[#639922]" : "bg-[#D2D8E5]"
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          active ? "translate-x-[22px]" : "translate-x-1"
        }`}
      />
    </button>
  );
}
