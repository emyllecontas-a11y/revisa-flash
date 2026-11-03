// src/components/ranking/RankingTab.tsx
import { useState, useEffect } from "react";
import type { PeriodoTipo, RankingViewState, UserIndicators, Medal } from "./types";
import { RankingHeader } from "./components/RankingHeader";
import { UserHighlightCard } from "./components/UserHighlightCard";
import { Podium } from "./components/Podium";
import { RankingList } from "./components/RankingList";
import { PerformanceIndicators } from "./components/PerformanceIndicators";
import { MedalsSection } from "./components/MedalsSection";
import { RankingEmpty, RankingError, RankingSkeleton } from "./components/RankingStates";
import { calcularRanking, getIndicadoresReais, getMedalhas, type RankingUser } from "@/services/rankingService";
import { useAppUser } from "@/contexts/UserContext";

export function RankingTab() {
  const { user } = useAppUser();
  const [tipo, setTipo] = useState<PeriodoTipo>("semanal");
  const [state, setState] = useState<RankingViewState>("carregando");
  
  // Estados de Dados
  const [rankingData, setRankingData] = useState<RankingUser[]>([]);
  const [indicadores, setIndicadores] = useState<UserIndicators | null>(null);
  const [medalhas, setMedalhas] = useState<{ semanais: Medal[], mensais: Medal[] }>({ semanais: [], mensais: [] });

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setState("carregando");
      try {
        const [data, ind, meds] = await Promise.all([
          calcularRanking(user.id, tipo),
          getIndicadoresReais(user.id),
          getMedalhas(user.id)
        ]);
        
        setRankingData(data);
        setIndicadores(ind);
        setMedalhas(meds);
        
        setState(data.length === 0 ? "vazio" : "preenchido");
      } catch (e) {
        console.error(e);
        setState("erro");
      }
    }
    load();
  }, [tipo, user?.id]);

  const currentUserIndex = rankingData.findIndex(u => u.id === user?.id);
  const currentUser = currentUserIndex >= 0 ? rankingData[currentUserIndex] : null;
  
  const userHighlight = currentUser ? {
    ...currentUser,
    posicao: currentUserIndex + 1,
    pontosParaProximo: currentUserIndex > 0 ? rankingData[currentUserIndex - 1].pontos - currentUser.pontos : 0,
    progressoProximo: currentUserIndex > 0 ? (currentUser.pontos / rankingData[currentUserIndex - 1].pontos) : 1
  } : {
    id: user?.id || "me", name: user?.fullName || "Você", avatar_url: null,
    pontos: 0, variacao: 0, horasEstudadas: 0, questoesResolvidas: 0, simuladosRealizados: 0,
    posicao: 0, pontosParaProximo: 0, progressoProximo: 0
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

      {state === "preenchido" && indicadores && (
        <div key={tipo} className="space-y-5 sm:space-y-6">
          <UserHighlightCard user={userHighlight as any} />
          
          <div className="grid gap-5">
            <Podium top={rankingData.slice(0, 3)} currentUserId={user?.id} />
            {rankingData.length > 3 && (
              <RankingList participants={rankingData.slice(3)} startAt={4} currentUserId={user?.id} />
            )}
          </div>

          {/* Indicadores Reais */}
          <PerformanceIndicators data={indicadores} />

          {/* Medalhas Reais */}
          <MedalsSection semanais={medalhas.semanais} mensais={medalhas.mensais} defaultCategoria={tipo} />
        </div>
      )}
    </div>
  );
}