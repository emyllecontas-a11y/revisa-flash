// src/routes/comunidade.tsx
//
// Tela única "Comunidade" com duas sub-abas:
//  - Compartilhado comigo (padrão, primeiro)
//  - Amizades
// A aba ativa fica na URL (?tab=compartilhado | ?tab=amizades), então
// o botão "voltar" do celular e links compartilhados funcionam.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { AmizadesConteudo } from "./amigas";
import { CompartilhadosConteudo } from "./compartilhados";
import { useAppUser } from "@/contexts/UserContext";
import { loadFriendsOverview } from "@/services/friendService";
import { getDb } from "@/lib/db";

type Tab = "compartilhado" | "amizades";

const TAB_PADRAO: Tab = "compartilhado";

function isTab(v: string | null): v is Tab {
  return v === "compartilhado" || v === "amizades";
}

export default function ComunidadePage() {
  const { userId } = useAppUser();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get("tab");
  const tab: Tab = isTab(rawTab) ? rawTab : TAB_PADRAO;

  const [invitesCount, setInvitesCount] = useState(0);
  const [sharedCount, setSharedCount] = useState(0);

  // Carrega contadores para os badges (leves, tolerantes a falha)
  useEffect(() => {
    if (!userId) return;
    let cancelado = false;

    const carregar = async () => {
      // Contagem de convites recebidos
      try {
        const overview = await loadFriendsOverview(userId);
        if (!cancelado) setInvitesCount(overview.recebidos?.length || 0);
      } catch { /* ignora */ }

      // Contagem de itens compartilhados comigo
      try {
        const db: any = await getDb();
        const [disciplines, listas, simulados] = await Promise.all([
          db.collections.disciplines.find().exec(),
          db.collections.listas.find().exec(),
          db.collections.simulados.find().exec(),
        ]);
        const apagado = (r: any) => r.isDeleted === true || r.isdeleted === true;
        const deOutro = (r: any, campo: string) => {
          const v = r[campo];
          return typeof v === "string" && v !== "" && v !== userId;
        };

        let total = 0;
        for (const d of disciplines) {
          const j = d.toJSON();
          if (!apagado(j) && deOutro(j, "user_id")) total++;
        }
        for (const l of listas) {
          const j = l.toJSON();
          if (!apagado(j) && deOutro(j, "user_id")) total++;
        }
        for (const s of simulados) {
          const j = s.toJSON();
          if (!apagado(j) && deOutro(j, "created_by")) total++;
        }
        if (!cancelado) setSharedCount(total);
      } catch { /* ignora */ }
    };

    void carregar();

    const onVisible = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  const trocarTab = (nova: Tab) => {
    if (nova === tab) return;
    setSearchParams({ tab: nova }, { replace: true });
  };

  return (
    <AppShell breadcrumb="Comunidade" title="Comunidade">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex gap-1 border-b border-border">
          <BotaoTab
            ativo={tab === "compartilhado"}
            onClick={() => trocarTab("compartilhado")}
            label="Compartilhado comigo"
            badge={sharedCount}
          />
          <BotaoTab
            ativo={tab === "amizades"}
            onClick={() => trocarTab("amizades")}
            label="Amizades"
            badge={invitesCount}
            badgeTone="primary"
          />
        </div>

        {tab === "compartilhado" ? <CompartilhadosConteudo /> : <AmizadesConteudo />}
      </div>
    </AppShell>
  );
}

function BotaoTab({
  ativo,
  onClick,
  label,
  badge,
  badgeTone = "muted",
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  badgeTone?: "muted" | "primary";
}) {
  const mostrarBadge = typeof badge === "number" && badge > 0;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
        ativo
          ? "border-primary text-primary"
          : "border-transparent text-foreground/50 hover:text-foreground"
      }`}
    >
      {label}
      {mostrarBadge && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
            badgeTone === "primary"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground/60"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}