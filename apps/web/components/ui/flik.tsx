export type FlikPose = "normal" | "celebrando" | "guino" | "esperando";

interface FlikProps {
  pose?: FlikPose;
  size?: number;
}

const FLIK_SRC = "/flik.svg";

interface ConfettiPiece {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  cx: string;
  cy: string;
  color: string;
  size: number;
  delay: number;
}

// Static confetti config — 14 pieces around Flik. Deterministic per-index so
// it doesn't trip React hydration. Values picked to feel organic.
const CONFETTI: ConfettiPiece[] = [
  { top: "8%", left: "12%", cx: "-12px", cy: "-10px", color: "#FAAB4B", size: 8, delay: 0 },
  { top: "5%", left: "48%", cx: "-2px", cy: "-14px", color: "#9188F5", size: 6, delay: 0.15 },
  { top: "10%", right: "10%", cx: "12px", cy: "-10px", color: "#DCE2F0", size: 8, delay: 0.3 },
  { top: "22%", left: "4%", cx: "-16px", cy: "-2px", color: "#9188F5", size: 5, delay: 0.45 },
  { top: "24%", right: "5%", cx: "16px", cy: "-2px", color: "#FAAB4B", size: 7, delay: 0.6 },
  { top: "38%", left: "0%", cx: "-18px", cy: "4px", color: "#DCE2F0", size: 5, delay: 0.1 },
  { top: "40%", right: "0%", cx: "18px", cy: "4px", color: "#9188F5", size: 6, delay: 0.4 },
  { bottom: "30%", left: "2%", cx: "-16px", cy: "8px", color: "#FAAB4B", size: 6, delay: 0.55 },
  { bottom: "28%", right: "3%", cx: "16px", cy: "8px", color: "#DCE2F0", size: 7, delay: 0.2 },
  { bottom: "12%", left: "16%", cx: "-10px", cy: "14px", color: "#9188F5", size: 5, delay: 0.7 },
  { bottom: "10%", left: "44%", cx: "-2px", cy: "16px", color: "#FAAB4B", size: 8, delay: 0.05 },
  { bottom: "14%", right: "14%", cx: "10px", cy: "14px", color: "#DCE2F0", size: 6, delay: 0.35 },
  { top: "16%", left: "30%", cx: "-6px", cy: "-10px", color: "#FAAB4B", size: 4, delay: 0.8 },
  { top: "18%", right: "30%", cx: "6px", cy: "-10px", color: "#9188F5", size: 4, delay: 0.5 },
];

export default function Flik({ pose = "normal", size = 80 }: FlikProps) {
  const celebrating = pose === "celebrando";
  const breathing = !celebrating;

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
      {/* Confetti — rendered first so it sits behind the bouncing Flik */}
      {celebrating && (
        <div className="flik-confetti">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className="flik-confetti-piece"
              style={
                {
                  top: c.top,
                  bottom: c.bottom,
                  left: c.left,
                  right: c.right,
                  width: c.size,
                  height: c.size,
                  background: c.color,
                  animationDelay: `${c.delay}s`,
                  "--cx": c.cx,
                  "--cy": c.cy,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {/* Base mascot SVG. The original asset is never modified. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={FLIK_SRC}
        alt=""
        className={
          celebrating
            ? "flik-bounce"
            : breathing
              ? "flik-breathe"
              : undefined
        }
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          position: "relative",
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
    </div>
  );
}
