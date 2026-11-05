// src/components/ranking/components/RankingAvatar.tsx
import type { CrownType } from "../types";
import { Crown, CROWN_RING } from "./Crown";
import { AVATARES_MAP } from "@/components/ui/UserAvatar"; // 🔥 Importando o mapa da Lumi

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
  avatarTipo?: string | null; // 🔥 NOVO
  avatarId?: string | null;   // 🔥 NOVO
  size?: number;
  crown?: CrownType | null | undefined;
  ringColor?: string;
  className?: string;
}

export function RankingAvatar({ id, name, avatarUrl, avatarTipo, avatarId, size = 44, crown, ringColor, className }: RankingAvatarProps) {
  const ring = crown ? CROWN_RING[crown] : ringColor;
  const ringW = Math.max(2, Math.round(size / 18));

  // 🔥 Lógica para escolher a imagem correta
  let finalAvatarUrl = avatarUrl;
  if (avatarTipo === 'avatar' && avatarId && AVATARES_MAP[avatarId]) {
    finalAvatarUrl = AVATARES_MAP[avatarId];
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        boxShadow: ring ? `0 0 0 ${ringW}px ${ring}` : undefined,
      }}
    >
      {finalAvatarUrl ? (
        <img
          src={finalAvatarUrl}
          alt={name}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: colorFor(id) }}
        >
          {initials(name)}
        </div>
      )}

      {crown && (
        <div className="absolute -right-1 -top-2">
          <Crown type={crown} />
        </div>
      )}
    </div>
  );
}