import { BookOpen, CalendarCheck, Clock, Flame, Lock, Star, Target, Trophy, Zap, type LucideIcon } from "lucide-react";
import type { MedalIcon, MedalTier, PeriodoTipo } from "../types";

const TIER: Record<MedalTier, { main: string; deep: string }> = {
  bronze: { main: "var(--rk-bronze)", deep: "var(--rk-bronze-deep)" },
  prata: { main: "var(--rk-silver)", deep: "var(--rk-silver-deep)" },
  ouro: { main: "var(--rk-gold)", deep: "var(--rk-gold-deep)" },
  rubi: { main: "var(--rk-ruby)", deep: "var(--rk-ruby-deep)" },
  safira: { main: "var(--rk-sapphire)", deep: "var(--rk-sapphire-deep)" },
  diamante: { main: "var(--rk-diamond)", deep: "var(--rk-diamond-deep)" },
};

const ICONS: Record<MedalIcon, LucideIcon> = {
  flame: Flame,
  clock: Clock,
  target: Target,
  calendar: CalendarCheck,
  book: BookOpen,
  trophy: Trophy,
  zap: Zap,
  star: Star,
};

interface MedalBadgeProps {
  tier: MedalTier;
  icon: MedalIcon;
  categoria: PeriodoTipo;
  locked?: boolean;
  size?: number;
  className?: string;
}

/**
 * Medalha vetorial.
 * - Semanal: escudo hexagonal (inspirado nos emblemas da referência).
 * - Mensal: medalha redonda com fita e borda serrilhada — mais "nobre".
 */
export function MedalBadge({ tier, icon, categoria, locked, size = 72, className }: MedalBadgeProps) {
  const c = locked ? { main: "var(--rk-locked)", deep: "var(--rk-locked-deep)" } : TIER[tier];
  const Icon = locked ? Lock : ICONS[icon];
  const gid = `medal-${categoria}-${tier}-${locked ? "l" : "u"}`;

  return (
    <div className={`relative shrink-0 ${className ?? ""}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: c.main }} />
            <stop offset="100%" style={{ stopColor: c.deep }} />
          </linearGradient>
        </defs>
        {categoria === "semanal" ? (
          <>
            <path d="M50 6 L88 27 L88 73 L50 94 L12 73 L12 27 Z" fill={c.deep} transform="translate(0 4)" />
            <path d="M50 6 L88 27 L88 73 L50 94 L12 73 L12 27 Z" fill={`url(#${gid})`} />
            <path d="M50 17 L78 33 L78 67 L50 83 L22 67 L22 33 Z" fill={c.deep} opacity="0.35" />
            <path d="M50 6 L88 27 L50 30 L12 27 Z" fill="var(--foreground)" opacity="0.18" />
          </>
        ) : (
          <>
            <path d="M30 2 L44 2 L52 36 L38 36 Z" fill="var(--accent)" />
            <path d="M70 2 L56 2 L48 36 L62 36 Z" fill="var(--primary)" />
            <circle cx="50" cy="62" r="34" fill={c.deep} />
            {Array.from({ length: 16 }).map((_, i) => {
              const a = (i / 16) * Math.PI * 2;
              return <circle key={i} cx={50 + Math.cos(a) * 33} cy={62 + Math.sin(a) * 33} r="4" fill={c.deep} />;
            })}
            <circle cx="50" cy="62" r="29" fill={`url(#${gid})`} />
            <circle cx="50" cy="62" r="22" fill="none" stroke={c.deep} strokeOpacity="0.5" strokeWidth="2" />
            <ellipse cx="42" cy="48" rx="12" ry="6" fill="var(--foreground)" opacity="0.2" />
          </>
        )}
      </svg>
      <Icon
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-foreground drop-shadow"
        style={{ top: categoria === "semanal" ? "52%" : "62%", width: size * 0.32, height: size * 0.32 }}
        strokeWidth={2.4}
      />
    </div>
  );
}
