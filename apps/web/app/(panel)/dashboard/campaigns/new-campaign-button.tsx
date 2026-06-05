"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import ManualCampaignModal from "../manual-campaign-modal";

export default function NewCampaignButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#9188F5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7a70e0]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Nueva campaña
      </button>

      {open && (
        <ManualCampaignModal
          initialRecipients={[]}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
