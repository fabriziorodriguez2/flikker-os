"use client";

import { useState } from "react";

interface CampaignStatusToggleProps {
  campaignId: string;
  initialStatus: string;
}

export default function CampaignStatusToggle({
  campaignId,
  initialStatus,
}: CampaignStatusToggleProps) {
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const active = status === "ACTIVE";

  async function toggle() {
    setSaving(true);
    const nextStatus = active ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/proxy/campaigns/${campaignId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) setStatus(nextStatus);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={saving}
      aria-pressed={active}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-60 ${
        active ? "bg-[#639922]" : "bg-[#D2D8E5]"
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
          active ? "translate-x-[22px]" : "translate-x-1"
        }`}
      />
    </button>
  );
}
