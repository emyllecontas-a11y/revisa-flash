import { BookOpen, CheckCircle2, Clock, Sparkles } from "lucide-react";
import type { CurrentUser } from "../types";
import { fmtNum } from "../format";
import { RankingAvatar } from "./RankingAvatar";

/** Card de destaque com a posição do próprio estudante. */
export function UserHighlightCard({ user }: { user: CurrentUser }) {
  const next = user.posicao - 1;
  return (
    <section className="card-lip rk-hero relative overflow-hidden p-5 sm:p-6" style={{ ["--lip" as string]: "var(--primary)" }}>
      <div className="flex items-center gap-4">
        {/* 🔥 CORREÇÃO AQUI: Passando avatarTipo e avatarId */}
        <RankingAvatar 
          id={user.id} 
          name={user.name} 
          avatarUrl={user.avatar_url} 
          avatarTipo={user.avatar_tipo}
          avatarId={user.avatar_id}
          crown={user.coroa} 
          size={64} 
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{user.name}</p>
          <h3 className="font-display text-xl font-bold sm:text-2xl">
            Você está em <span className="text-primary">{user.posicao}º lugar!</span>
          </h3>
        </div>
        <div className="hidden text-right sm:block">
          <p className="font-display text-3xl font-extrabold text-primary">{fmtNum(user.pontos)}</p>
          <p className="text-xs text-muted-foreground">pontos</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat icon={<Clock className="h-4 w-4" />} value={`${user.horasEstudadas}h`} label="estudadas" />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} value={fmtNum(user.questoesResolvidas)} label="questões" />
        <Stat icon={<BookOpen className="h-4 w-4" />} value={String(user.simuladosRealizados)} label="simulados" />
      </div>

      {next >= 1 ? (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs font-semibold">
            <span className="sm:hidden text-primary">{fmtNum(user.pontos)} pts</span>
            <span className="hidden sm:inline text-muted-foreground">{user.posicao}º</span>
            <span className="text-muted-foreground">{next}º</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-background/60">
            <div className="bg-progress h-full rounded-full" style={{ width: `${Math.round(user.progressoProximo * 100)}%` }} />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Faltam <strong className="text-primary">{fmtNum(user.pontosParaProximo)} pontos</strong> para alcançar o {next}º lugar.
          </p>
        </div>
      ) : (
        <p className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-rk-gold">
          <Sparkles className="h-4 w-4" /> Você lidera o ranking. Continue firme!
        </p>
      )}
    </section>
  );
}

function Stat({ icon, value, label }: { icon: import("react").ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-background/50 px-3 py-2.5 ring-1 ring-border">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[11px] sm:text-xs">{label}</span></div>
      <p className="mt-0.5 font-display text-lg font-bold">{value}</p>
    </div>
  );
}