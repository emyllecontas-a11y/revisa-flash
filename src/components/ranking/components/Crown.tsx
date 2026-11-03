import type { CrownType } from "../types";

/** Cores de cada coroa (tokens definidos em ranking.css). */
export const CROWN_COLORS: Record<CrownType, { main: string; deep: string; gem: string }> = {
  ouro: { main: "var(--rk-gold)", deep: "var(--rk-gold-deep)", gem: "var(--rk-ruby)" },
  prata: { main: "var(--rk-silver)", deep: "var(--rk-silver-deep)", gem: "var(--rk-sapphire)" },
  bronze: { main: "var(--rk-bronze)", deep: "var(--rk-bronze-deep)", gem: "var(--rk-gold)" },
  rubi: { main: "var(--rk-gold)", deep: "var(--rk-gold-deep)", gem: "var(--rk-ruby)" },
  safira: { main: "var(--rk-silver)", deep: "var(--rk-silver-deep)", gem: "var(--rk-sapphire)" },
  diamante: { main: "var(--rk-diamond)", deep: "var(--rk-diamond-deep)", gem: "var(--rk-diamond)" },
};

/** Cor do anel ao redor do avatar para cada coroa. */
export const CROWN_RING: Record<CrownType, string> = {
  ouro: "var(--rk-gold)",
  prata: "var(--rk-silver)",
  bronze: "var(--rk-bronze)",
  rubi: "var(--rk-ruby)",
  safira: "var(--rk-sapphire)",
  diamante: "var(--rk-diamond)",
};

interface CrownProps {
  type: CrownType;
  size?: number;
  className?: string;
}

/**
 * Coroa vetorial inspirada nas molduras de jogo enviadas como referência.
 * "diamante" ganha 5 pontas; as demais, 3 pontas com joia central.
 */
export function Crown({ type, size = 28, className }: CrownProps) {
  const c = CROWN_COLORS[type];
  const gid = `crown-${type}`;
  const fivePoints = type === "diamante" || type === "rubi";
  const body = fivePoints
    ? "M4 26 L2 10 L10 17 L13 5 L20 14 L27 5 L30 17 L38 10 L36 26 Z"
    : "M5 26 L3 9 L12 17 L20 4 L28 17 L37 9 L35 26 Z";

  return (
    <svg
      width={size}
      height={(size * 34) / 40}
      viewBox="0 0 40 34"
      className={className}
      aria-label={`Coroa ${type}`}
      role="img"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: c.main }} />
          <stop offset="100%" style={{ stopColor: c.deep }} />
        </linearGradient>
      </defs>
      <path d={body} fill={`url(#${gid})`} stroke={c.deep} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="4" y="25" width="32" height="6" rx="2" fill={c.deep} />
      <rect x="4" y="25" width="32" height="2.4" rx="1.2" fill={c.main} opacity="0.6" />
      {/* joias */}
      <circle cx="20" cy="20" r="3.4" fill={c.gem} stroke="var(--background)" strokeOpacity="0.35" />
      <circle cx="19" cy="19" r="1" fill="var(--foreground)" opacity="0.8" />
      <circle cx="11" cy="22" r="1.8" fill={c.gem} opacity="0.9" />
      <circle cx="29" cy="22" r="1.8" fill={c.gem} opacity="0.9" />
      {/* pontas */}
      {fivePoints ? (
        <>
          <circle cx="2" cy="10" r="2" fill={c.main} />
          <circle cx="13" cy="5" r="2" fill={c.main} />
          <circle cx="27" cy="5" r="2" fill={c.main} />
          <circle cx="38" cy="10" r="2" fill={c.main} />
        </>
      ) : (
        <>
          <circle cx="3" cy="9" r="2.2" fill={c.main} />
          <circle cx="20" cy="4" r="2.4" fill={c.gem} stroke={c.main} strokeWidth="1" />
          <circle cx="37" cy="9" r="2.2" fill={c.main} />
        </>
      )}
    </svg>
  );
}
