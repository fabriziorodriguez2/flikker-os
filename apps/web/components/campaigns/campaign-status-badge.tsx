interface CampaignStatusBadgeProps {
  status: string;
}

function getStatusClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-[color:var(--success-bg)] text-[color:var(--success-text)]";
    case "PAUSED":
      return "bg-[color:var(--warning-bg)] text-[color:var(--warning-text)]";
    case "COMPLETED":
      return "bg-[color:rgba(145,136,245,0.14)] text-[color:var(--brand-primary)]";
    case "ARCHIVED":
      return "bg-[color:var(--danger-bg)] text-[color:var(--danger-text)]";
    default:
      return "border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)]";
  }
}

export default function CampaignStatusBadge({
  status,
}: CampaignStatusBadgeProps) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${getStatusClass(
        status,
      )}`}
    >
      {status}
    </span>
  );
}
