import Link from "next/link";
import CampaignStatusBadge from "./campaign-status-badge";
import { FEATURES } from "@/src/config/features";

interface CampaignCardProps {
  campaign: {
    id: string;
    name: string;
    slug: string;
    status: string;
    channel: string;
    enableLanding: boolean;
    branch: { id: string; name: string } | null;
    _count: { qrCodes: number; scanEvents: number };
  };
}

function formatChannel(value: string) {
  return value.replace(/_/g, " ");
}

export default function CampaignCard({ campaign }: CampaignCardProps) {
  return (
    <article className="flikker-card rounded-[28px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-semibold text-[color:var(--foreground)]">
              {campaign.name}
            </h3>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2 text-xs uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
            <span>{campaign.slug}</span>
            <span>{formatChannel(campaign.channel)}</span>
            {campaign.enableLanding ? <span>Landing activa</span> : null}
            {FEATURES.MULTI_LOCAL && campaign.branch ? (
              <span>{campaign.branch.name}</span>
            ) : null}
          </div>
        </div>

        <Link
          href={`/dashboard/campaigns/${campaign.id}`}
          className="rounded-full bg-[color:var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)]"
        >
          Ver detalle
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
            Slug trazable
          </p>
          <p className="mt-3 break-all text-sm font-semibold text-[color:var(--foreground)]">
            /r/{campaign.slug}
          </p>
        </div>
        {FEATURES.QR_ADVANCED ? (
          <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
              QRs activos
            </p>
            <p className="mt-3 text-3xl font-semibold text-[color:var(--foreground)]">
              {campaign._count.qrCodes}
            </p>
          </div>
        ) : null}
        <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
            Scans
          </p>
          <p className="mt-3 text-3xl font-semibold text-[color:var(--foreground)]">
            {campaign._count.scanEvents}
          </p>
        </div>
      </div>
    </article>
  );
}
