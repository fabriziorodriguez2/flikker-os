"use client";

import { Lock } from "lucide-react";
import ProBadge from "./pro-badge";
import { useUpgradeModal } from "./upgrade-modal-provider";

interface ProFeatureLockedProps {
  title: string;
  description: string;
  feature: string;
  source: string;
}

export default function ProFeatureLocked({
  title,
  description,
  feature,
  source,
}: ProFeatureLockedProps) {
  const { openUpgradeModal } = useUpgradeModal();

  return (
    <section className="rounded-[18px] border border-[#E5E6EC] bg-white px-6 py-10 text-center shadow-[0_8px_24px_rgba(42,40,67,0.06)]">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#F1EDFF] text-[#7258D6]">
        <Lock className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <h2 className="font-display text-lg font-semibold text-[#202333]">
          {title}
        </h2>
        <ProBadge />
      </div>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6F768A]">
        {description}
      </p>
      <button
        type="button"
        onClick={() => openUpgradeModal({ feature, source })}
        data-pro-feature={feature}
        aria-label={`${title}, disponible en Flikker Pro. Mejorar a Pro`}
        className="mt-6 inline-flex h-10 items-center justify-center rounded-[10px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#4F5EAD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5C6BC0]/40 focus-visible:ring-offset-2"
      >
        Mejorar a Pro
      </button>
    </section>
  );
}
