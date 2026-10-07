import Link from "next/link";
import { Check, Hourglass, Target } from "lucide-react";
import {
  toRow,
  type MyFlikkerChallenge,
} from "@/app/(public)/mi-flikker/challenges-tab";

export function challengeDaysLeft(
  challenge: MyFlikkerChallenge,
  now = new Date(),
): number | null {
  if (!challenge.timezone) return null;
  const key =
    challenge.kind === "mission"
      ? challenge.lastDayKey
      : challenge.deadlineDayKey;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: challenge.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return Math.max(
    0,
    Math.round(
      (Date.parse(key + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) /
        86400000,
    ),
  );
}

export default function WalletChallengeCard({
  challenge,
  now = new Date(),
}: {
  challenge: MyFlikkerChallenge;
  now?: Date;
}) {
  const row = toRow(challenge);
  const complete =
    challenge.kind === "mission" && challenge.status === "COMPLETED";
  const expired =
    challenge.kind === "mission" && challenge.status === "EXPIRED";
  const days = challengeDaysLeft(challenge, now);
  const urgent =
    !complete &&
    !expired &&
    ((days !== null && days <= 3) ||
      (challenge.kind === "streak" && challenge.state === "AT_RISK"));
  return (
    <li className="min-w-0">
      <article
        className={`relative overflow-hidden rounded-[20px] p-4 text-white ${complete ? "bg-[#387767]" : expired ? "bg-[#777780]" : "bg-[#7056F5]"}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-white text-[#7056F5]">
              {challenge.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={challenge.logoUrl}
                  alt=""
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <Target className="h-4 w-4" />
              )}
            </span>
            <span className="break-words text-xs font-bold">
              {challenge.businessName}
            </span>
          </span>
          {urgent || complete || expired ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[9px] font-bold text-[#5443B9]">
              {complete ? (
                <Check className="h-3 w-3" />
              ) : urgent ? (
                <Hourglass className="h-3 w-3" />
              ) : null}
              {complete ? "Completado" : expired ? "Vencido" : "Vence pronto"}
            </span>
          ) : null}
        </div>
        <h2 className="mt-5 break-words text-[25px] font-bold leading-tight tracking-[-0.04em]">
          {row.title}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-white/90">
          {row.subtitle}
        </p>
        {challenge.kind === "mission" && !complete ? (
          <p className="mt-1 text-xs text-white/90">{row.deadline}</p>
        ) : null}
        {row.progress && row.progress.target <= 12 ? (
          <div
            className="mt-3 flex gap-1.5"
            role="img"
            aria-label={`${row.progress.current} de ${row.progress.target}`}
          >
            {Array.from({ length: row.progress.target }, (_, i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor:
                    i < row.progress!.current ? "#FFFFFF" : "#FFFFFF55",
                }}
              />
            ))}
          </div>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/25 pt-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.13em]">
              {complete ? "Estado" : "Quedan"}
            </p>
            <p className="mt-1 text-xl font-bold leading-tight">
              {complete
                ? "¡Completado!"
                : expired
                  ? "Vencido"
                  : days === null
                    ? "Ver fecha"
                    : days === 0
                      ? "Hoy"
                      : `${days} ${days === 1 ? "día" : "días"}`}
            </p>
          </div>
          {row.reward ? (
            <div className="min-w-0 border-l border-white/25 pl-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.13em]">
                {complete ? "Tu premio" : "Ganás"}
              </p>
              <p className="mt-1 break-words text-base font-bold leading-tight">
                {row.reward.label}
              </p>
              {"detail" in row.reward && row.reward.detail ? (
                <p className="mt-1 break-words text-[10px] text-white/90">
                  {row.reward.detail}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>
      <Link
        href={`/mi-flikker/${encodeURIComponent(challenge.businessId)}`}
        className="mt-2 flex min-h-11 items-center justify-center rounded-[14px] bg-[#19191F] px-4 py-3 text-xs font-bold text-white"
      >
        Ver mi tarjeta
      </Link>
    </li>
  );
}
