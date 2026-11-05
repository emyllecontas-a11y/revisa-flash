// src/components/FiltroHierarquiaModal.tsx
import { useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight, FolderOpen } from "lucide-react";

interface Props {
  hierarquia: Record<string, Record<string, Set<string>>>;
  fDisciplina: string;
  setFDisciplina: (v: string) => void;
  fMateria: string;
  setFMateria: (v: string) => void;
  fAssunto: string;
  setFAssunto: (v: string) => void;
  bancasDisponiveis: string[];
  fBanca: string;
  setFBanca: (v: string) => void;
  anosDisponiveis: number[];
  fAno: string;
  setFAno: (v: string) => void;
  onClose: () => void;
}

export function FiltroHierarquiaModal({
  hierarquia, fDisciplina, setFDisciplina, fMateria, setFMateria, fAssunto, setFAssunto,
  bancasDisponiveis, fBanca, setFBanca, anosDisponiveis, fAno, setFAno,
  onClose
}: Props) {
  const [materiaAtiva, setMateriaAtiva] = useState(fMateria);

  const disciplinas = Object.keys(hierarquia);
  const discAtual = fDisciplina || disciplinas[0] || "";
  
  const materias = discAtual ? Object.keys(hierarquia[discAtual] || {}) : [];
  
  const topicos = (discAtual && materiaAtiva) ? Array.from(hierarquia[discAtual]?.[materiaAtiva] || []) : [];

  const handleSelecionarMateria = (m: string) => {
    setMateriaAtiva(m);
    setFMateria(m);
    setFAssunto(""); 
  };

  const handleSelecionarTopico = (t: string) => {
    setFAssunto(t);
  };

  // Envolvemos o return inteiro com o createPortal
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl h-[600px] max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-elevated overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-2">
          <div>
            <h3 className="text-lg font-bold font-display">Filtrar Questões</h3>
            <p className="text-xs text-foreground/60">Escolha a banca, o ano, e a matéria para filtrar.</p>
          </div>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* Filtros Rápidos (Banca e Ano) */}
        <div className="flex gap-4 p-4 border-b border-border bg-surface">
          <div className="flex-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-foreground/45 block mb-1">Banca</label>
            <select value={fBanca} onChange={(e) => setFBanca(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary">
              <option value="">Todas as bancas</option>
              {bancasDisponiveis.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-foreground/45 block mb-1">Ano</label>
            <select value={fAno} onChange={(e) => setFAno(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary">
              <option value="">Todos os anos</option>
              {anosDisponiveis.map(a => <option key={a} value={String(a)}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Seletor de Disciplina (se houver mais de uma) */}
        {disciplinas.length > 1 && (
          <div className="flex gap-2 p-3 border-b border-border overflow-x-auto bg-background">
            {disciplinas.map(d => (
              <button
                key={d}
                onClick={() => { setFDisciplina(d); setFMateria(""); setFAssunto(""); setMateriaAtiva(""); }}
                className={["px-4 py-1.5 text-sm font-medium rounded-full transition-colors shrink-0", discAtual === d ? "bg-primary text-primary-foreground" : "bg-surface text-foreground/60 border border-border hover:bg-surface-2"].join(" ")}
              >
                {d}
              </button>
            ))}
          </div>
        )}

        {/* Corpo (Duas Colunas) */}
        <div className="flex flex-1 overflow-hidden">
          {/* Coluna Esquerda: Matérias */}
          <div className="w-1/2 border-r border-border overflow-y-auto bg-background">
            <div className="p-3">
              <button
                onClick={() => { setFMateria(""); setFAssunto(""); setMateriaAtiva(""); }}
                className={["w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors mb-1", !fMateria ? "bg-primary/10 text-primary" : "hover:bg-surface-2 text-foreground/70"].join(" ")}
              >
                Todas as matérias
              </button>
              
              {materias.map(m => {
                const isSelected = fMateria === m;
                const isActive = materiaAtiva === m;
                return (
                  <button
                    key={m}
                    onClick={() => handleSelecionarMateria(m)}
                    className={["w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors mb-1", isSelected ? "bg-primary/10 text-primary" : "hover:bg-surface-2 text-foreground/70"].join(" ")}
                  >
                    <span className="truncate pr-2">{m}</span>
                    <ChevronRight className={["h-4 w-4 shrink-0 transition-transform", isActive ? "text-primary" : "text-foreground/30"].join(" ")} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Coluna Direita: Tópicos */}
          <div className="w-1/2 overflow-y-auto bg-surface/30">
            <div className="p-3">
              {!materiaAtiva ? (
                <div className="flex flex-col items-center justify-center h-full text-foreground/40 mt-20">
                  <FolderOpen className="h-8 w-8 mb-2" />
                  <p className="text-sm">Selecione uma matéria ao lado</p>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setFAssunto("")}
                    className={["w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors mb-1", !fAssunto ? "bg-primary/10 text-primary" : "hover:bg-surface-2 text-foreground/70"].join(" ")}
                  >
                    Todos os tópicos (Matéria inteira)
                  </button>

                  {topicos.map(t => {
                    const isSelected = fAssunto === t;
                    return (
                      <button
                        key={t}
                        onClick={() => handleSelecionarTopico(t)}
                        className={["w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors mb-1 text-left", isSelected ? "bg-primary/10 text-primary" : "hover:bg-surface-2 text-foreground/70"].join(" ")}
                      >
                        <span className="truncate">{t}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 px-6 flex items-center justify-between bg-surface-2">
          <div className="text-xs text-foreground/60 flex flex-wrap gap-2">
            {fBanca && <span className="bg-background px-2 py-1 rounded border border-border">{fBanca}</span>}
            {fAno && <span className="bg-background px-2 py-1 rounded border border-border">Ano: {fAno}</span>}
            {fMateria ? (
              <span>Filtrando por: <strong className="text-foreground">{fMateria}</strong> {fAssunto && <span>› <strong className="text-primary">{fAssunto}</strong></span>}</span>
            ) : (
              <span>Nenhuma matéria selecionada.</span>
            )}
          </div>
          <button onClick={onClose} className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 shrink-0">
            Aplicar Filtro
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}