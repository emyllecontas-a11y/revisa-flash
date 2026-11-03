// src/components/ranking/components/RankingStates.tsx
import { AlertTriangle, RotateCcw, Trophy, UserPlus, Users } from "lucide-react";
import type { ReactNode } from "react";

export function RankingSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando ranking">
      <div className="rf-card space-y-4 p-5">
        <div className="flex items-center gap-4">
          <div className="rk-skeleton h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="rk-skeleton h-3 w-24" />
            <div className="rk-skeleton h-6 w-56 max-w-full" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="rk-skeleton h-16" />)}</div>
        <div className="rk-skeleton h-3 w-full rounded-full" />
      </div>
      <div className="rf-card grid grid-cols-3 items-end gap-3 px-6 pt-10">
        {["h-24", "h-36", "h-16"].map((h, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="rk-skeleton h-14 w-14 rounded-full" />
            <div className="rk-skeleton h-3 w-16" />
            <div className={`rk-skeleton w-full rounded-b-none ${h}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StateBox({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rf-card rk-hero rf-fade-in flex flex-col items-center px-6 py-14 text-center">
      <div className="rk-float mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-surface-2 ring-1 ring-border">{icon}</div>
      <h3 className="max-w-sm font-display text-xl font-bold">{title}</h3>
      {text && <p className="mt-2 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function RankingEmpty() {
  return (
    <StateBox
      icon={<Trophy className="h-10 w-10 text-rk-gold" />}
      title="Seu ranking está esperando os primeiros participantes!"
      text="Assim que alguém começar a estudar neste período, a classificação aparece aqui."
    />
  );
}

export function RankingError({ onRetry }: { onRetry?: (() => void) | undefined }) {
  return (
    <StateBox
      icon={<AlertTriangle className="h-10 w-10 text-destructive" />}
      title="Não foi possível carregar o ranking"
      text="Verifique sua conexão e tente novamente em instantes."
      action={
        <button onClick={onRetry} className="btn-sun inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold">
          <RotateCcw className="h-4 w-4" /> Tentar novamente
        </button>
      }
    />
  );
}

export function RankingNoFriends({ onFindFriends }: { onFindFriends?: (() => void) | undefined }) {
  return (
    <StateBox
      icon={<Users className="h-10 w-10 text-primary" />}
      title="Você ainda não tem amigos para acompanhar no ranking."
      text="Adicione amigos na aba Amizades e estudem juntos para subir na classificação."
      action={
        <button onClick={onFindFriends} className="btn-sun inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold">
          <UserPlus className="h-4 w-4" /> Conhecer amigos
        </button>
      }
    />
  );
}