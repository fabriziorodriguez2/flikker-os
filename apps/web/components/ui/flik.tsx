export type FlikPose = "normal" | "celebrando" | "guino" | "esperando";

interface FlikProps {
  pose?: FlikPose;
  size?: number;
}

const FLIK_SRC = "/flik.svg";

export default function Flik({ pose = "normal", size = 80 }: FlikProps) {
  const celebrating = pose === "celebrando";
  const dotSize = Math.max(3, Math.round(size * 0.08));

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-block",
        verticalAlign: "bottom",
      }}
      aria-hidden="true"
    >
      {/* Base mascot SVG. The original asset is never modified. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={FLIK_SRC}
        alt=""
        className={celebrating ? "flik-bounce" : undefined}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />

      {/* Wink overlay (guino): closed-eye path roughly over right eye */}
      {pose === "guino" && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <path
            d="M 56 39 Q 60 43 64 39"
            fill="none"
            stroke="#1a1040"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* Confetti (celebrando) — sits in the surrounding box, stays upright */}
      {celebrating && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            top: "-18%",
            left: "-18%",
            width: "136%",
            height: "136%",
            pointerEvents: "none",
          }}
        >
          <circle cx="8" cy="22" r="2.6" fill="#FAAB4B" />
          <circle cx="92" cy="26" r="2.2" fill="#DCE2F0" />
          <circle cx="93" cy="70" r="2.2" fill="#9188F5" />
          <circle cx="7" cy="66" r="2.6" fill="#FAAB4B" />
          <circle cx="56" cy="5" r="2.2" fill="#DCE2F0" />
          <circle cx="34" cy="4" r="1.8" fill="#FAAB4B" />
          <line
            x1="4"
            y1="44"
            x2="0"
            y2="38"
            stroke="#FAAB4B"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <line
            x1="96"
            y1="46"
            x2="100"
            y2="40"
            stroke="#DCE2F0"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <line
            x1="78"
            y1="90"
            x2="84"
            y2="96"
            stroke="#FAAB4B"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* Waiting dots (esperando) */}
      {pose === "esperando" && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: `-${Math.round(size * 0.2)}px`,
            transform: "translateX(-50%)",
            display: "flex",
            gap: Math.round(size * 0.06),
          }}
        >
          <span
            className="flik-dot flik-dot-1"
            style={{ width: dotSize, height: dotSize }}
          />
          <span
            className="flik-dot flik-dot-2"
            style={{ width: dotSize, height: dotSize }}
          />
          <span
            className="flik-dot flik-dot-3"
            style={{ width: dotSize, height: dotSize }}
          />
        </div>
      )}
    </div>
  );
}
