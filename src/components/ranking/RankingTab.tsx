// src/components/ranking/RankingTab.tsx
import { useState, useEffect } from "react";
import type { PeriodoTipo, RankingViewState } from "./types";
import { RankingHeader } from "./components/RankingHeader";
import { UserHighlightCard } from "./components/UserHighlightCard";
import { Podium } from "./components/Podium";
import { RankingList } from "./components/RankingList";
import { PerformanceIndicators } from "./components/PerformanceIndicators";
import { MedalsSection } from "./components/MedalsSection";
import { RankingEmpty, RankingError, RankingNoFriends, RankingSkeleton } from "./components/RankingStates";
import { calcularRanking, type RankingUser } from "@/services/rankingService";
import { useAppUser } from "@/contexts/UserContext";

export function RankingTab() {
  const { user } = useAppUser();
  const [tipo, setTipo] = useState<PeriodoTipo>("semanal");
  const [state, setState] = useState<RankingViewState>("carregando");
  const [rankingData, setRankingData] = useState<RankingUser[]>([]);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setState("carregando");
      try {
        const data = await calcularRanking(user.id, tipo);
        setRankingData(data);
        setState(data.length === 0 ? "vazio" : "preenchido");
      } catch (e) {
        console.error(e);
        setState("erro");
      }
    }
    load();
  }, [tipo, user?.id]);

  // Encontra a posição do usuário logado
  const currentUserIndex = rankingData.findIndex(u => u.id === user?.id);
  const currentUser = currentUserIndex >= 0 ? rankingData[currentUserIndex] : null;
  
  // Card do usuário (se ele não estiver no ranking, mostra zerado)
  const userHighlight = currentUser ? {
    ...currentUser,
    posicao: currentUserIndex + 1,
    pontosParaProximo: currentUserIndex > 0 ? rankingData[currentUserIndex - 1].pontos - currentUser.pontos : 0,
    progressoProximo: currentUserIndex > 0 ? (currentUser.pontos / rankingData[currentUserIndex - 1].pontos) : 1
  } : {
    id: user?.id || "me",
    name: "Você",
    avatar_url: null,
    pontos: 0, variacao: 0, horasEstudadas: 0, questoesResolvidas: 0, simuladosRealizados: 0,
    posicao: 0,
    pontosParaProximo: 0, progressoProximo: 0
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <RankingHeader 
        periodo={{
          tipo: tipo,
          label: tipo === 'semanal' ? "Esta semana" : "Este mês",
          encerramento: tipo === 'semanal' ? "Encerra domingo" : "Encerra no fim do mês"
        }} 
        tipo={tipo} 
        onTipoChange={setTipo} 
      />

      {state === "carregando" && <RankingSkeleton />}
      {state === "erro" && <RankingError onRetry={() => setTipo(tipo)} />}
      {state === "vazio" && <RankingEmpty />}

      {state === "preenchido" && (
        <div key={tipo} className="space-y-5 sm:space-y-6">
          <UserHighlightCard user={userHighlight as any} />
          
          <div className="grid gap-5">
            <Podium top={rankingData.slice(0, 3)} currentUserId={user?.id} />
            {rankingData.length > 3 && (
              <RankingList participants={rankingData.slice(3)} startAt={4} currentUserId={user?.id} />
            )}
          </div>

          {/* Indicadores Básicos */}
          <PerformanceIndicators data={{
            tempo: { dia: 0, semana: Math.round(userHighlight.horasEstudadas * 60), mes: 0 },
            questoes: { dia: 0, semana: userHighlight.questoesResolvidas, mes: 0 },
            simulados: { semana: userHighlight.simuladosRealizados, mes: 0 }
          }} />

          {/* Em breve: Lógica real de Medalhas */}
          <MedalsSection semanais={[]} mensais={[]} />
        </div>
      )}
    </div>
  );
}