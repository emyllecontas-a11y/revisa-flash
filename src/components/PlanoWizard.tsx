// src/components/PlanoWizard.tsx
import { useState } from "react";
import { ArrowRight, ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { PlanoBloco, PlanoSemana } from "@/lib/planoEnareData";
import { salvarPlanoCustomizado } from "@/services/planoService";
import { useToast } from "@/hooks/useToast";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export function PlanoWizard({ userId, onCancel, onSuccess }: { userId: string, onCancel: () => void, onSuccess: () => void }) {
  const toast = useToast();
  const [passo, setPasso] = useState(1);
  const [nomePlano, setNomePlano] = useState("Meu Plano de Estudos");
  const [qtdSemanas, setQtdSemanas] = useState(4);
  const [semanaAtual, setSemanaAtual] = useState(1);
  const [saving, setSaving] = useState(false);

  // Estrutura base da Semana 1
  const [semanaBase, setSemanaBase] = useState<Record<number, PlanoBloco[]>>({
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []
  });

  const [novoBloco, setNovoBloco] = useState<{ dia: number | null, materia: string, tema: string }>({
    dia: null, materia: "", tema: ""
  });

  const handleAddBloco = (dia: number) => {
    if (!novoBloco.materia.trim() || !novoBloco.tema.trim()) return;
    setSemanaBase(prev => ({
      ...prev,
      [dia]: [...prev[dia], { k: novoBloco.materia.substring(0,4).toUpperCase(), t: novoBloco.tema }]
    }));
    setNovoBloco({ dia: null, materia: "", tema: "" });
  };

  const handleRemoveBloco = (dia: number, index: number) => {
    setSemanaBase(prev => ({
      ...prev,
      [dia]: prev[dia].filter((_, i) => i !== index)
    }));
  };

  const handleSalvar = async () => {
    setSaving(true);
    try {
      // Calcula data de início (segunda-feira da semana escolhida)
      const hoje = new Date();
      const diaDaSemana = hoje.getDay();
      const diffParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
      const segundaDestaSemana = new Date(hoje);
      segundaDestaSemana.setDate(hoje.getDate() + diffParaSegunda);
      
      const dataInicio = new Date(segundaDestaSemana);
      dataInicio.setDate(segundaDestaSemana.getDate() - (semanaAtual - 1) * 7);
      
      const y = dataInicio.getFullYear();
      const m = String(dataInicio.getMonth() + 1).padStart(2, '0');
      const d = String(dataInicio.getDate()).padStart(2, '0');
      const dataInicioStr = `${y}-${m}-${d}`;

      // Monta as semanas replicando a semana base
      const semanas: PlanoSemana[] = [];
      for (let s = 1; s <= qtdSemanas; s++) {
        const dias = [];
        for (let d = 0; d < 7; d++) {
          dias.push([...semanaBase[d]]);
        }
        semanas.push({ n: s, dias });
      }

      await salvarPlanoCustomizado(userId, nomePlano, dataInicioStr, semanas);
      toast.success("Plano criado com sucesso!");
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao criar plano.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {passo === 1 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Passo 1: Informações Básicas</h3>
          <div>
            <label className="block text-sm mb-1">Nome do plano</label>
            <input value={nomePlano} onChange={e => setNomePlano(e.target.value)} className="w-full p-2 rounded-lg bg-background border border-border" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Duração (semanas)</label>
              <input type="number" min={1} max={52} value={qtdSemanas} onChange={e => setQtdSemanas(Number(e.target.value))} className="w-full p-2 rounded-lg bg-background border border-border" />
            </div>
            <div>
              <label className="block text-sm mb-1">Semana atual</label>
              <input type="number" min={1} max={qtdSemanas} value={semanaAtual} onChange={e => setSemanaAtual(Number(e.target.value))} className="w-full p-2 rounded-lg bg-background border border-border" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button onClick={onCancel} className="btn-ghost px-4 py-2">Cancelar</button>
            <button onClick={() => setPasso(2)} className="btn-sun px-4 py-2 flex items-center gap-2">Avançar <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {passo === 2 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Passo 2: Estrutura da Semana</h3>
          <p className="text-sm text-muted-foreground">Defina o que você estuda em cada dia. Esta rotina será repetida pelas próximas semanas.</p>
          
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
            {DIAS.map((diaNome, diaIdx) => (
              <div key={diaIdx} className="border border-border p-3 rounded-xl bg-background/50">
                <div className="font-medium text-sm mb-2">{diaNome}</div>
                <ul className="space-y-1 mb-2">
                  {semanaBase[diaIdx].map((bloco, idx) => (
                    <li key={idx} className="flex justify-between items-center text-sm bg-surface p-2 rounded border border-border/50">
                      <span><b>{bloco.k}:</b> {bloco.t}</span>
                      <button onClick={() => handleRemoveBloco(diaIdx, idx)} className="text-destructive"><Trash2 className="h-3 w-3" /></button>
                    </li>
                  ))}
                  {semanaBase[diaIdx].length === 0 && <li className="text-xs text-muted-foreground">Nenhuma matéria.</li>}
                </ul>
                
                <div className="flex gap-2">
                  <input placeholder="Matéria (ex: Matemática)" value={novoBloco.dia === diaIdx ? novoBloco.materia : ""} onChange={e => setNovoBloco({ dia: diaIdx, materia: e.target.value, tema: novoBloco.dia === diaIdx ? novoBloco.tema : "" })} className="flex-1 p-1.5 text-xs rounded border border-border bg-background" />
                  <input placeholder="Tema" value={novoBloco.dia === diaIdx ? novoBloco.tema : ""} onChange={e => setNovoBloco({ dia: diaIdx, materia: novoBloco.dia === diaIdx ? novoBloco.materia : "", tema: e.target.value })} className="flex-1 p-1.5 text-xs rounded border border-border bg-background" />
                  <button onClick={() => handleAddBloco(diaIdx)} className="bg-primary/20 text-primary p-1.5 rounded"><Plus className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={() => setPasso(1)} className="btn-ghost px-4 py-2 flex items-center gap-2"><ArrowLeft className="h-4 w-4" /> Voltar</button>
            <button onClick={handleSalvar} disabled={saving} className="btn-sun px-4 py-2 flex items-center gap-2">
              {saving ? "Salvando..." : <><Save className="h-4 w-4" /> Salvar Plano</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}