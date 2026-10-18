// src/hooks/useNotificacoes.ts
//
// Deriva a lista de notificações não lidas a partir dos dados que já existem
// (convites pendentes + itens compartilhados comigo). O estado "lida" fica
// no localStorage — sem tabela nova, sem sync, funciona offline.
import { useCallback, useEffect, useState } from "react";
import { getDb } from "@/lib/db";
import { loadFriendsOverview } from "@/services/friendService";
import { findUsersByIds } from "@/services/clerkService";

export type NotificacaoTipo = "convite" | "discipline" | "lista" | "simulado";

export interface Notificacao {
  id: string;
  tipo: NotificacaoTipo;
  titulo: string;
  descricao?: string;
  timestamp: string; // ISO
  route?: string;
}

const READS_KEY = "revisaflash_notificacoes_lidas";

function getReads(): Set<string> {
  try {
    const raw = localStorage.getItem(READS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveReads(reads: Set<string>): void {
  try {
    localStorage.setItem(READS_KEY, JSON.stringify([...reads]));
  } catch { /* ignore */ }
}

export function useNotificacoes(userId: string | undefined) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [lidas, setLidas] = useState<Set<string>>(getReads());

  const recompute = useCallback(async () => {
    if (!userId) {
      setNotificacoes([]);
      return;
    }

    const result: Notificacao[] = [];

    // 1) Convites pendentes
    try {
      const overview = await loadFriendsOverview(userId);
      const recebidos = overview.recebidos || [];
      for (const r of recebidos) {
        const nome = r.pessoa?.name || r.pessoa?.email || "Alguém";
        result.push({
          id: `convite:${r.friendshipId}`,
          tipo: "convite",
          titulo: `${nome} te convidou para ser amigo`,
          descricao: "Aceite ou recuse na tela Comunidade",
          timestamp: (r as any).created_at || new Date().toISOString(),
          route: "/comunidade?tab=amizades",
        });
      }
    } catch {
      /* offline ou erro de rede — segue sem contar convites */
    }

    // 2) Itens compartilhados comigo
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

      const ownerIds = new Set<string>();
      const disciplineItems: any[] = [];
      const listaItems: any[] = [];
      const simuladoItems: any[] = [];

      for (const d of disciplines) {
        const j = d.toJSON();
        if (!apagado(j) && deOutro(j, "user_id")) {
          disciplineItems.push(j);
          ownerIds.add(String(j.user_id));
        }
      }
      for (const l of listas) {
        const j = l.toJSON();
        if (!apagado(j) && deOutro(j, "user_id")) {
          listaItems.push(j);
          ownerIds.add(String(l.user_id));
        }
      }
      for (const s of simulados) {
        const j = s.toJSON();
        if (!apagado(j) && deOutro(j, "created_by")) {
          simuladoItems.push(j);
          ownerIds.add(String(j.created_by));
        }
      }

      // Nomes dos donos (best-effort)
      const nomes = new Map<string, string>();
      if (ownerIds.size > 0) {
        try {
          const pessoas = await findUsersByIds([...ownerIds]);
          for (const p of pessoas) {
            const nome = p.name || p.email;
            if (nome) nomes.set(p.id, nome);
          }
        } catch { /* segue sem nomes */ }
      }
      const nomeDe = (id: string) => nomes.get(id) || "um amigo";

      for (const d of disciplineItems) {
        result.push({
          id: `discipline:${d.id}`,
          tipo: "discipline",
          titulo: `${nomeDe(String(d.user_id))} compartilhou uma disciplina`,
          descricao: d.name || "Disciplina",
          timestamp: d.updated_at || d.created_at || new Date().toISOString(),
          route: "/comunidade?tab=compartilhado",
        });
      }
      for (const l of listaItems) {
        result.push({
          id: `lista:${l.id}`,
          tipo: "lista",
          titulo: `${nomeDe(String(l.user_id))} compartilhou uma lista`,
          descricao: l.titulo || "Lista de questões",
          timestamp: l.updated_at || l.created_at || new Date().toISOString(),
          route: `/listas/${l.id}`,
        });
      }
      for (const s of simuladoItems) {
        result.push({
          id: `simulado:${s.id}`,
          tipo: "simulado",
          titulo: `${nomeDe(String(s.created_by))} compartilhou um simulado`,
          descricao: s.titulo || "Simulado",
          timestamp: s.updated_at || s.created_at || new Date().toISOString(),
          route: `/simulados/${s.id}?view=resultado`,
        });
      }
    } catch { /* local DB pode falhar na primeira execução */ }

    // Ordenação: convites primeiro (são acionáveis), depois por recência
    result.sort((a, b) => {
      const prioA = a.tipo === "convite" ? 0 : 1;
      const prioB = b.tipo === "convite" ? 0 : 1;
      if (prioA !== prioB) return prioA - prioB;
      return b.timestamp > a.timestamp ? 1 : -1;
    });

    // Limpeza: remove IDs "lidos" que não existem mais (convite aceito, item descompartilhado)
    const currentIds = new Set(result.map((n) => n.id));
    setLidas((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id);
        else changed = true;
      }
      if (changed) {
        saveReads(next);
        return next;
      }
      return prev;
    });

    setNotificacoes(result);
  }, [userId]);

  // Recalcular ao montar + a cada 2 minutos
  useEffect(() => {
    void recompute();
    const interval = setInterval(() => void recompute(), 2 * 60_000);
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

  const marcarComoLida = useCallback((id: string) => {
    setLidas((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReads(next);
      return next;
    });
  }, []);

  const marcarTodasComoLidas = useCallback(() => {
    setLidas(() => {
      const next = new Set(notificacoes.map((n) => n.id));
      saveReads(next);
      return next;
    });
  }, [notificacoes]);

  const naoLidasCount = notificacoes.filter((n) => !lidas.has(n.id)).length;

  return {
    notificacoes,
    lidas,
    naoLidasCount,
    marcarComoLida,
    marcarTodasComoLidas,
    refresh: recompute,
  };
}