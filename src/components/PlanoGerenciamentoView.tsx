// src/components/PlanoGerenciamentoView.tsx
import { useState, useMemo } from "react";
import { CalendarClock, Edit3, Upload, PlusCircle, Trash2, ArrowLeft, Archive } from "lucide-react";
import { type Plano, definirDataInicio, excluirPlano, chaveBloco, obterDataDoBloco } from "@/services/planoService";
import { PlanoEditorSemanas } from "@/components/PlanoEditorSemanas";
import { PlanoImportCsv } from "@/components/PlanoImportCsv";
import { PlanoWizard } from "@/components/PlanoWizard";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { usePlano } from "@/hooks/usePlano";

type Aba = "geral" | "editar" | "excel" | "wizard";

export function PlanoGerenciamentoView({ 
  userId, 
  onBackToAgenda,
  onPlanoAlterado
}: { 
  userId: string;
  onBackToAgenda: () => void;
  onPlanoAlterado: () => void;
}) {
  const { plano, feitos, recarregar } = usePlano(userId);
  const toast = useToast();
  const confirmDialog = useConfirm();
  
  const [abaAtiva, setAbaAtiva] = useState<Aba>("geral");
  const [adiando, setAdiando] = useState(false);

  // Calcula as pendências para mostrar na visão geral
  const pendencias = useMemo(() => {
    if (!plano) return [];
    const lista: any[] = [];
    const hoje = new Date().toISOString().split('T')[0];
    
    for (const semana of plano.semanas) {
      for (let d = 0; d < 7; d++) {
        const dataStr = obterDataDoBloco(plano.data_inicio, semana.n, d);
        if (dataStr >= hoje) continue; 
        for (const bloco of semana.dias[d]) {
          const chave = chaveBloco(semana.n, d, bloco.k);
          if (!feitos.has(chave)) lista.push({ chave, bloco, dataStr });
        }
      }
    }
    return lista.sort((a, b) => a.dataStr.localeCompare(b.dataStr));
  }, [plano, feitos]);

  const handleAdiar = async (dias: number) => {
    if (!plano) return;
    setAdiando(true);
    try {
      const novaData = new Date(plano.data_inicio + "T12:00:00");
      novaData.setDate(novaData.getDate() + dias);
      const y = novaData.getFullYear();
      const m = String(novaData.getMonth() + 1).padStart(2, '0');
      const d = String(novaData.getDate()).padStart(2, '0');
      
      await definirDataInicio(plano.id, `${y}-${m}-${d}`);
      await recarregar();
      toast.success(`Plano adiado em ${dias} dias.`);
      onPlanoAlterado();
    } catch (err) {
      toast.error("Erro ao adiar plano.");
    } finally {
      setAdiando(false);
    }
  };

  const handleExcluir = async () => {
    if (!plano) return;
    const ok = await confirmDialog({
      title: "Excluir plano?",
      description: "O plano será apagado. Seus registros de estudo não serão afetados.",
      confirmText: "Sim, excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    
    try {
      await excluirPlano(plano.id);
      toast.success("Plano excluído.");
      onPlanoAlterado();
      onBackToAgenda();
    } catch (err) {
      toast.error("Erro ao excluir plano.");
    }
  };

  const finalizarAcao = () => {
    recarregar();
    onPlanoAlterado();
    setAbaAtiva("geral");
    toast.success("Plano atualizado!");
  };

  // Se não houver plano, força a aba de criação
  const abaReal = plano ? abaAtiva : (abaAtiva === 'geral' || abaAtiva === 'editar' ? 'excel' : abaAtiva);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <button onClick={onBackToAgenda} className="p-2 bg-surface rounded-full hover:bg-muted transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-display text-2xl font-bold">Plano de Estudos</h1>
          <p className="text-sm text-muted-foreground">
            {plano ? plano.nome : "Nenhum plano ativo"}
          </p>
        </div>
      </div>

      {/* Sub-abas (Estilo Simulados) */}
      <div className="flex border-b border-border gap-6 overflow-x-auto">
        {plano && (
          <button onClick={() => setAbaAtiva("geral")} className={`pb-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${abaReal === "geral" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            Visão Geral & Adiar
          </button>
        )}
        {plano && (
          <button onClick={() => setAbaAtiva("editar")} className={`pb-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${abaReal === "editar" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            Editar Conteúdo
          </button>
        )}
        <button onClick={() => setAbaAtiva("excel")} className={`pb-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${abaReal === "excel" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {plano ? "Substituir via Excel" : "Importar Excel"}
        </button>
        <button onClick={() => setAbaAtiva("wizard")} className={`pb-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${abaReal === "wizard" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {plano ? "Criar Novo Passo a Passo" : "Criar Passo a Passo"}
        </button>
      </div>

      {/* Conteúdo da Aba */}
      <div className="pt-2">
        {abaReal === "geral" && plano && (
          <div className="space-y-6 max-w-2xl">
            <div className="rf-card p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" /> Ajustar Cronograma
              </h3>
              <p className="text-sm text-muted-foreground">
                Se você atrasou os estudos e quer empurrar o cronograma inteiro, adie o plano. As matérias de hoje se tornarão as de amanhã.
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => handleAdiar(1)} disabled={adiando} className="btn-ghost border border-border px-3 py-1.5 text-xs">Adiar +1 dia</button>
                <button onClick={() => handleAdiar(3)} disabled={adiando} className="btn-ghost border border-border px-3 py-1.5 text-xs">Adiar +3 dias</button>
                <button onClick={() => handleAdiar(7)} disabled={adiando} className="btn-ghost border border-border px-3 py-1.5 text-xs">Adiar +1 semana</button>
              </div>
            </div>

            <div className="rf-card p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Archive className="h-4 w-4 text-amber-500" /> Baú de Pendências ({pendencias.length})
              </h3>
              {pendencias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tudo em dia! Você não tem matérias atrasadas.</p>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Você tem matérias para trás. Para marcá-las como concluídas, volte para a Agenda e clique no botão amarelo "Ver matérias atrasadas" no card de hoje.
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border/50">
              <button onClick={handleExcluir} className="text-xs text-destructive hover:underline flex items-center gap-1">
                <Trash2 className="h-3.5 w-3.5" /> Apagar este plano
              </button>
            </div>
          </div>
        )}

        {abaReal === "editar" && plano && (
          <PlanoEditorSemanas plano={plano} onCancel={() => setAbaAtiva("geral")} onSuccess={finalizarAcao} />
        )}

        {abaReal === "excel" && (
          <PlanoImportCsv userId={userId} onCancel={() => setAbaAtiva(plano ? "geral" : "excel")} onSuccess={finalizarAcao} />
        )}

        {abaReal === "wizard" && (
          <PlanoWizard userId={userId} onCancel={() => setAbaAtiva(plano ? "geral" : "wizard")} onSuccess={finalizarAcao} />
        )}
      </div>
    </div>
  );
}