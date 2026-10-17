// src/components/PlanoEditorSemanas.tsx
import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { type Plano, type PlanoSemana, type PlanoBloco, atualizarSemanasPlano } from "@/services/planoService";
import { useToast } from "@/hooks/useToast";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export function PlanoEditorSemanas({ plano, onSuccess, onCancel }: { plano: Plano, onSuccess: () => void, onCancel: () => void }) {
  const toast = useToast();
  const [semanaAtiva, setSemanaAtiva] = useState(1);
  const [semanas, setSemanas] = useState<PlanoSemana[]>(JSON.parse(JSON.stringify(plano.semanas))); // Cópia profunda
  const [saving, setSaving] = useState(false);

  // Estado para os inputs de adicionar nova matéria
  const [novaMateria, setNovaMateria] = useState<Record<number, { materia: string, tema: string }>>({});

  const handleAdicionar = (diaIdx: number) => {
    const form = novaMateria[diaIdx];
    if (!form || !form.materia.trim() || !form.tema.trim()) return;

    const novasSemanas = [...semanas];
    const semanaIndex = novasSemanas.findIndex(s => s.n === semanaAtiva);
    if (semanaIndex === -1) return;

    const bloco: PlanoBloco = {
      k: form.materia.trim().substring(0, 4).toUpperCase(),
      t: form.tema.trim(),
    };

    novasSemanas[semanaIndex].dias[diaIdx].push(bloco);
    setSemanas(novasSemanas);
    
    // Limpa o input deste dia
    setNovaMateria(prev => ({ ...prev, [diaIdx]: { materia: "", tema: "" } }));
  };

  const handleRemover = (diaIdx: number, blocoIdx: number) => {
    const novasSemanas = [...semanas];
    const semanaIndex = novasSemanas.findIndex(s => s.n === semanaAtiva);
    if (semanaIndex === -1) return;

    novasSemanas[semanaIndex].dias[diaIdx].splice(blocoIdx, 1);
    setSemanas(novasSemanas);
  };

  const handleSalvar = async () => {
    setSaving(true);
    try {
      await atualizarSemanasPlano(plano.id, semanas);
      toast.success("Plano atualizado com sucesso!");
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  };

  const semanaAtualData = semanas.find(s => s.n === semanaAtiva);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-muted p-3 rounded-xl">
        <label className="text-sm font-semibold">Editando a semana:</label>
        <select 
          value={semanaAtiva} 
          onChange={e => setSemanaAtiva(Number(e.target.value))}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium outline-none"
        >
          {semanas.map(s => (
            <option key={s.n} value={s.n}>Semana {s.n}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
        {DIAS.map((diaNome, diaIdx) => (
          <div key={diaIdx} className="border border-border p-3 rounded-xl bg-background/50">
            <div className="font-medium text-sm mb-2 text-primary">{diaNome}</div>
            
            {/* Lista de matérias do dia */}
            <ul className="space-y-1 mb-3">
              {semanaAtualData?.dias[diaIdx].map((bloco, idx) => (
                <li key={idx} className="flex justify-between items-center text-sm bg-surface p-2 rounded border border-border/50">
                  <span><b className="text-xs text-muted-foreground mr-1">{bloco.k}</b> {bloco.t}</span>
                  <button onClick={() => handleRemover(diaIdx, idx)} className="text-destructive hover:bg-destructive/10 p-1 rounded">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              {semanaAtualData?.dias[diaIdx].length === 0 && (
                <li className="text-xs text-muted-foreground italic">Nenhuma matéria neste dia.</li>
              )}
            </ul>

            {/* Adicionar nova */}
            <div className="flex gap-2">
              <input 
                placeholder="Matéria" 
                value={novaMateria[diaIdx]?.materia || ""} 
                onChange={e => setNovaMateria({ ...novaMateria, [diaIdx]: { ...novaMateria[diaIdx], materia: e.target.value } })} 
                className="w-1/3 p-1.5 text-xs rounded border border-border bg-background" 
              />
              <input 
                placeholder="Tema" 
                value={novaMateria[diaIdx]?.tema || ""} 
                onChange={e => setNovaMateria({ ...novaMateria, [diaIdx]: { ...novaMateria[diaIdx], tema: e.target.value } })} 
                className="flex-1 p-1.5 text-xs rounded border border-border bg-background" 
              />
              <button onClick={() => handleAdicionar(diaIdx)} className="bg-primary/20 text-primary p-1.5 rounded hover:bg-primary/30">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between pt-4 border-t border-border">
        <button onClick={onCancel} className="btn-ghost px-4 py-2 text-sm">Cancelar</button>
        <button onClick={handleSalvar} disabled={saving} className="btn-sun px-4 py-2 flex items-center gap-2 text-sm">
          {saving ? "Salvando..." : <><Save className="h-4 w-4" /> Salvar Alterações</>}
        </button>
      </div>
    </div>
  );
}