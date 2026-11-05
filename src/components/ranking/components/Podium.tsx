import type { RankingParticipant } from "../types";
import { firstName, fmtNum } from "../format";
import { RankingAvatar } from "./RankingAvatar";

const PLACES = [
  { pos: 2, emoji: "🥈", color: "var(--rk-silver)", h: "h-24 sm:h-32", av: 60 },
  { pos: 1, emoji: "🥇", color: "var(--rk-gold)", h: "h-32 sm:h-44", av: 76 },
  { pos: 3, emoji: "🥉", color: "var(--rk-bronze)", h: "h-16 sm:h-24", av: 56 },
] as const;

/** Pódio físico: 2º à esquerda, 1º ao centro (mais alto), 3º à direita. */
export function Podium({ top, currentUserId }: { top: RankingParticipant[]; currentUserId?: string }) {
  return (
    <section aria-label="Pódio" className="rf-card rk-hero overflow-hidden px-3 pt-10 sm:px-8 sm:pt-12">
      <div className="mx-auto grid max-w-xl grid-cols-3 items-end gap-2 sm:gap-4">
        {PLACES.map((p) => {
          const person = top[p.pos - 1];
          if (!person) return <div key={p.pos} />;
          const isMe = person.id === currentUserId;
          return (
            <div key={p.pos} className="rf-fade-in flex flex-col items-center" style={{ animationDelay: `${(3 - p.pos) * 90}ms` }}>
              <div className={p.pos === 1 ? "rk-float" : ""}>
                {/* 🔥 CORREÇÃO AQUI: Passando avatarTipo e avatarId */}
                <RankingAvatar
                  id={person.id}
                  name={person.name}
                  avatarUrl={person.avatar_url}
                  avatarTipo={person.avatar_tipo}
                  avatarId={person.avatar_id}
                  size={p.av}
                  crown={person.coroa}
                  ringColor={p.color}
                />
              </div>
              <p className={`mt-2 max-w-full truncate text-center text-sm font-bold sm:text-base ${isMe ? "text-primary" : ""}`}>
                {isMe ? "Você" : firstName(person.name)}
              </p>
              <p className="text-xs font-semibold text-muted-foreground sm:text-sm">{fmtNum(person.pontos)} pts</p>

              <div className={`rk-podium-col mt-3 flex w-full flex-col items-center justify-start pt-2 ${p.h}`} style={{ borderTop: `4px solid ${p.color}` }}>
                <span className="text-2xl sm:text-3xl" aria-hidden>{p.emoji}</span>
                <span className="font-display text-2xl font-extrabold sm:text-4xl" style={{ color: p.color }}>
                  {p.pos}º
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}