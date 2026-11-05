import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { RankingParticipant } from "../types";
import { fmtNum } from "../format";
import { RankingAvatar } from "./RankingAvatar";

interface RankingListProps {
  participants: RankingParticipant[];
  /** Posição do primeiro item da lista (ex.: 4 quando o pódio mostra 1–3). */
  startAt?: number;
  currentUserId?: string;
}

/** Lista de classificação abaixo do pódio, com rolagem vertical. */
export function RankingList({ participants, startAt = 4, currentUserId }: RankingListProps) {
  return (
    <section aria-label="Classificação" className="rf-card p-2 sm:p-3">
      <ol className="max-h-[440px] space-y-1.5 overflow-y-auto pr-1 pt-3">
        {participants.map((p, i) => {
          const isMe = p.id === currentUserId;
          return (
            <li
              key={p.id}
              className={`rf-fade-in flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:gap-4 sm:px-4 ${
                isMe ? "rk-me-row" : "hover:bg-surface-2"
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className={`w-6 text-center font-display text-base font-bold ${isMe ? "text-primary" : "text-muted-foreground"}`}>
                {startAt + i}
              </span>
              {/* 🔥 CORREÇÃO AQUI: Passando avatarTipo e avatarId */}
              <RankingAvatar 
                id={p.id} 
                name={p.name} 
                avatarUrl={p.avatar_url} 
                avatarTipo={p.avatar_tipo}
                avatarId={p.avatar_id}
                crown={p.coroa} 
                size={42} 
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${isMe ? "text-primary" : ""}`}>
                  {p.name}
                  {isMe && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">Você</span>}
                </p>
                <Variation v={p.variacao} />
              </div>
              <span className={`font-display text-sm font-bold sm:text-base ${isMe ? "text-primary" : ""}`}>
                {fmtNum(p.pontos)} <span className="text-xs font-semibold text-muted-foreground">pts</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Variation({ v }: { v: number }) {
  if (v > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-rk-green">
        <ArrowUp className="h-3 w-3" /> +{v}
      </span>
    );
  if (v < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-destructive">
        <ArrowDown className="h-3 w-3" /> {v}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
      <Minus className="h-3 w-3" /> estável
    </span>
  );
}