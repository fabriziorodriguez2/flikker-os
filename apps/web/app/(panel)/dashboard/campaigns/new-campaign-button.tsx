"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import ManualCampaignModal from "../manual-campaign-modal";

interface BusinessInfo {
  name: string;
  vertical?: string | null;
}

export default function NewCampaignButton() {
  const [open, setOpen] = useState(false);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);

  function handleOpen() {
    setOpen(true);
    if (!businessInfo) {
      void fetch("/api/proxy/businesses/current")
        .then((r) => r.json())
        .then((data: BusinessInfo) => {
          setBusinessInfo({ name: data.name ?? "", vertical: data.vertical ?? null });
        })
        .catch(() => {});
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(92,107,192,0.2)] transition-all hover:-translate-y-px hover:bg-[#5261B4]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Nueva campaña
      </button>

      {open && (
        <ManualCampaignModal
          initialRecipients={[]}
          onClose={() => setOpen(false)}
          businessName={businessInfo?.name}
          vertical={businessInfo?.vertical ?? undefined}
        />
      )}
    </>
  );
}
