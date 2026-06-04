export type FlikPose = "normal" | "celebrando" | "guino" | "esperando";

interface FlikProps {
  pose?: FlikPose;
  size?: number;
}

const BODY =
  "M0,-52 C4,-30 26,-26 48,-20 C28,-14 30,8 24,30 C14,14 -14,14 -24,30 C-30,8 -28,-14 -48,-20 C-26,-26 -4,-30 0,-52Z";

export default function Flik({ pose = "normal", size = 80 }: FlikProps) {
  const celebrating = pose === "celebrando";
  const bigEye = celebrating ? 5.5 : 4.5;
  const bigPupil = celebrating ? 2.8 : 2.2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="-70 -70 140 128"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Confetti — rendered before rotation so it stays upright */}
      {celebrating && (
        <g>
          <circle cx="-55" cy="-48" r="3.5" fill="#FAAB4B" />
          <circle cx="56" cy="-40" r="3" fill="#DCE2F0" />
          <circle cx="52" cy="20" r="2.5" fill="#9188F5" />
          <circle cx="-53" cy="15" r="3" fill="#FAAB4B" />
          <circle cx="16" cy="-62" r="3" fill="#DCE2F0" />
          <circle cx="-17" cy="-63" r="2.5" fill="#FAAB4B" />
          <line
            x1="-58"
            y1="-20"
            x2="-65"
            y2="-29"
            stroke="#FAAB4B"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line
            x1="59"
            y1="-16"
            x2="65"
            y2="-25"
            stroke="#DCE2F0"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line
            x1="42"
            y1="33"
            x2="48"
            y2="41"
            stroke="#FAAB4B"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Body + face */}
      <g transform={celebrating ? "rotate(10)" : undefined}>
        <path d={BODY} fill="#9188F5" stroke="#7a70e0" strokeWidth="1" />

        {/* Left eye (always open) */}
        <circle cx="-13" cy="-14" r={bigEye} fill="white" />
        <circle cx="-13" cy="-14" r={bigPupil} fill="#1a1040" />

        {/* Right eye */}
        {pose === "guino" ? (
          <path
            d="M 9,-18 Q 13,-12 17,-18"
            fill="none"
            stroke="#1a1040"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : (
          <>
            <circle cx="13" cy="-14" r={bigEye} fill="white" />
            <circle cx="13" cy="-14" r={bigPupil} fill="#1a1040" />
          </>
        )}

        {/* Cheeks */}
        <ellipse cx="-19" cy="-5" rx="6" ry="3.5" fill="#FAAB4B" opacity="0.55" />
        <ellipse cx="19" cy="-5" rx="6" ry="3.5" fill="#FAAB4B" opacity="0.55" />

        {/* Mouth */}
        {pose === "normal" && (
          <path
            d="M -7,7 Q 0,13 7,7"
            fill="none"
            stroke="#1a1040"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}
        {celebrating && (
          <path
            d="M -10,7 Q 0,17 10,7"
            fill="none"
            stroke="#1a1040"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
        {pose === "guino" && (
          <path
            d="M -7,7 Q 1,14 8,9"
            fill="none"
            stroke="#1a1040"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}
        {pose === "esperando" && (
          <path
            d="M -7,9 Q 0,5 7,9"
            fill="none"
            stroke="#1a1040"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}

        {/* Raised left eyebrow (esperando) */}
        {pose === "esperando" && (
          <path
            d="M -20,-21 Q -13,-27 -7,-21"
            fill="none"
            stroke="#1a1040"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        )}
      </g>

      {/* Waiting dots (esperando) */}
      {pose === "esperando" && (
        <g>
          <circle cx="-9" cy="43" r="3" fill="#9188F5" opacity="0.4" />
          <circle cx="0" cy="43" r="3" fill="#9188F5" opacity="0.25" />
          <circle cx="9" cy="43" r="3" fill="#9188F5" opacity="0.12" />
        </g>
      )}
    </svg>
  );
}
