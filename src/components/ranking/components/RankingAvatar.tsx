import type { CrownType } from "../types";
import { Crown, CROWN_RING } from "./Crown";

const AV_COLORS = ["var(--rk-av-1)", "var(--rk-av-2)", "var(--rk-av-3)", "var(--rk-av-4)", "var(--rk-av-5)"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

interface RankingAvatarProps {
  id: string;
  name: string;
  avatarUrl: string | null;
  size?: number;
  crown?: CrownType | null | undefined;
  /** Cor do anel quando não há coroa (ex.: posição do pódio). */
  ringColor?: string;
  className?: string;
}

/**
 * Avatar com coroa opcional. A coroa fica inclinada no canto superior direito,
 * acima da borda da foto, sem cobrir o rosto.
 */
export function RankingAvatar({ id, name, avatarUrl, size = 44, crown, ringColor, className }: RankingAvatarProps) {
  const ring = crown ? CROWN_RING[crown] : ringColor;
  const ringW = Math.max(2, Math.round(size / 18));
  return (
    <div className={`relative shrink-0 ${className ?? ""}`} style={{ width: size, height: size }}>
      <div
        className="h-full w-full overflow-hidden rounded-full"
        style={{
          boxShadow: ring
            ? `0 0 0 ${ringW}px ${ring}, 0 0 0 ${ringW + 2}px var(--background)`
            : "0 0 0 2px var(--border)",
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-display font-bold text-primary-foreground"
            style={{ background: colorFor(id), fontSize: size * 0.36 }}
          >
            {initials(name)}
          </div>
        )}
      </div>
      {crown && (
        <span
          className="pointer-events-none absolute drop-shadow-md"
          style={{ top: -size * 0.36, right: -size * 0.18, transform: "rotate(18deg)" }}
        >
          <Crown type={crown} size={Math.round(size * 0.58)} />
        </span>
      )}
    </div>
  );
}
