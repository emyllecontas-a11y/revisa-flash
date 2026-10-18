// src/hooks/useComunidadeBadge.ts
//
// Calcula o badge da entrada "Comunidade" no menu.
// Conta:
//   - Convites recebidos pendentes (não aceitos/recusados).
//   - Itens compartilhados comigo que chegaram desde a última visita a /comunidade.
// Some quando o usuário está na própria tela /comunidade.
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getDb } from "@/lib/db";
import { loadFriendsOverview } from "@/services/friendService";

const LS_KEY = "revisaflash_comunidade_last_seen";

function getLastSeen(): string {
  try {
    return localStorage.getItem(LS_KEY) || "1970-01-01T00:00:00Z";
  } catch {
    return "1970-01-01T00:00:00Z";
  }
}

function setLastSeenNow(): void {
  try {
    localStorage.setItem(LS_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export function useComunidadeBadge(userId: string | undefined) {
  const [count, setCount] = useState(0);
  const location = useLocation();
  const isOnComunidade = location.pathname.startsWith("/comunidade");

  const recompute = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }

    let total = 0;

    // 1) Convites pendentes
    try {
      const overview = await loadFriendsOverview(userId);
      total += overview.recebidos?.length || 0;
    } catch {
      /* offline ou erro de rede — segue sem contar convites */
    }

    // 2) Novos itens compartilhados desde a última visita
    try {
      const lastSeen = getLastSeen();
      const db: any = await getDb();
      const [disciplinas, listas, simulados] = await Promise.all([
        db.collections.disciplines.find().exec(),
        db.collections.listas.find().exec(),
        db.collections.simulados.find().exec(),
      ]);

      const apagado = (r: any) => r.isDeleted === true || r.isdeleted === true;
      const deOutro = (r: any, campo: string) => {
        const v = r[campo];
        return typeof v === "string" && v !== "" && v !== userId;
      };
      const maisNovo = (r: any) => {
        const t = r.updated_at || r.created_at || "";
        return t > lastSeen;
      };

      for (const d of disciplinas) {
        const j = d.toJSON();
        if (!apagado(j) && deOutro(j, "user_id") && maisNovo(j)) total++;
      }
      for (const l of listas) {
        const j = l.toJSON();
        if (!apagado(j) && deOutro(j, "user_id") && maisNovo(j)) total++;
      }
      for (const s of simulados) {
        const j = s.toJSON();
        if (!apagado(j) && deOutro(j, "created_by") && maisNovo(j)) total++;
      }
    } catch {
      /* local DB pode falhar na primeira execução — não trava o badge */
    }

    setCount(total);
  }, [userId]);

  // Recalcular ao montar + a cada 2 minutos
  useEffect(() => {
    void recompute();
    const interval = setInterval(() => {
      void recompute();
    }, 2 * 60_000);
    return () => clearInterval(interval);
  }, [recompute]);

  // Recalcular quando a aba volta a ficar visível
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void recompute();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [recompute]);

  // Ao entrar em /comunidade, marca como "visto" e recalcula
  useEffect(() => {
    if (!isOnComunidade) return;
    setLastSeenNow();
    void recompute();
  }, [isOnComunidade, recompute]);

  // Suprime o badge enquanto o usuário está na própria tela
  const displayCount = isOnComunidade ? 0 : count;
  return { count: displayCount };
}