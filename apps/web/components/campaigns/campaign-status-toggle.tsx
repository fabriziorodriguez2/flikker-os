"use client";

import Switch from "@/components/ui/switch";

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
    <Switch
      checked={active}
      onCheckedChange={onToggle}
      disabled={saving}
      label={active ? "Desactivar campaña" : "Activar campaña"}
    />
  );
}
