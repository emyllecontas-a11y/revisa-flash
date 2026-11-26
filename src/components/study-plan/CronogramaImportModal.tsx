import React, { useState } from "react";
import { Upload, FileSpreadsheet, Copy, Check, ArrowRight, ArrowLeft, X, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CRONOGRAMA_IMPORT_PROMPT } from "@/services/cronogramaPrompt";
import { parseCronogramaExcel, validateCronograma, buildImportPreview, type ValidationResult, type ImportPreview } from "@/services/cronogramaImporter";
import { upsertStudyTaskByName, upsertStudyWeeklyBlock, upsertStudyThemeTimeline } from "@/services/studyPlanService";
import {
  carregarConteudoExistente,
  calcularConteudoNovo,
  criarConteudoSelecionado,
  normalizarNome,
  type EntradaConteudo,
  type ConteudoNovo,
  type SelecaoConteudo,
  type MapaIds,
} from "@/services/conteudoSugestaoService";

interface CronogramaImportModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = ["Pegue o template", "Envie o Excel", "Preview e confirmar"];

export function CronogramaImportModal({ userId, isOpen, onClose }: CronogramaImportModalProps) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [validatedData, setValidatedData] = useState<ValidationResult | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Novos estados para sugestão de criação de disciplinas/tópicos
  const [conteudoNovo, setConteudoNovo] = useState<ConteudoNovo | null>(null);
  const [selecaoConteudo, setSelecaoConteudo] = useState<SelecaoConteudo>({ disciplinas: [], topicos: [] });
  const [isLoadingConteudo, setIsLoadingConteudo] = useState(false);

  if (!isOpen) return null;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CRONOGRAMA_IMPORT_PROMPT);
      setCopied(true);
      toast.success("Prompt copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o prompt");
    }
  };

  const pickFile = (f?: File | null) => {
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      toast.error("Envie um arquivo .xlsx ou .xls");
      return;
    }
    setFile(f);
  };

  const handleValidate = async () => {
    if (!file) {
      toast.error("Escolha um arquivo primeiro");
      return;
    }
    setIsProcessing(true);
    try {
      const parsed = await parseCronogramaExcel(file);
      if (parsed.errors.length > 0) {
        toast.error(`Erro na leitura: ${parsed.errors.join('; ')}`);
        setIsProcessing(false);
        return;
      }
      const validated = await validateCronograma(parsed, userId);
      setValidatedData(validated);
      const previewData = buildImportPreview(validated);
      setPreview(previewData);

      // Calcular conteúdos novos (disciplinas/tópicos que não existem)
      try {
        setIsLoadingConteudo(true);
        const { disciplinas, topicos } = await carregarConteudoExistente(userId);

        // Construir entradas a partir de timelines e blocks
        const entradas: EntradaConteudo[] = [];

        // Timelines têm disciplina e tópico
        for (const tl of validated.timelines) {
          entradas.push({ disciplina: tl.discipline, topico: tl.topic });
        }

        // Blocks têm disciplina e tópico opcional
        for (const bl of validated.blocks) {
          entradas.push({ disciplina: bl.discipline, topico: bl.topic });
        }

        const novo = calcularConteudoNovo(entradas, disciplinas, topicos);
        setConteudoNovo(novo);

        // Inicializar seleção com tudo marcado
        if (novo.disciplinasNovas.length > 0 || novo.topicosNovos.length > 0) {
          setSelecaoConteudo({
            disciplinas: [...novo.disciplinasNovas],
            topicos: novo.topicosNovos.map(t => ({ disciplina: t.disciplina, nome: t.nome })),
          });
        }
      } catch (err) {
        // Se falhar, segue sem a seção de sugestão
        console.warn('[CronogramaImportModal] Falha ao calcular conteúdos novos:', err);
        setConteudoNovo(null);
      } finally {
        setIsLoadingConteudo(false);
      }

      toast.success("Validação concluída!");
    } catch (err: any) {
      toast.error(`Erro ao validar: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async () => {
    if (!validatedData || !preview) {
      toast.error("Valide o arquivo primeiro");
      return;
    }
    setIsProcessing(true);
    try {
      let createdTasks = 0, updatedTasks = 0, skippedTasks = 0;
      let createdTimelines = 0, updatedTimelines = 0, skippedTimelines = 0;
      let createdBlocks = 0, updatedBlocks = 0, skippedBlocks = 0;
      let createdDisciplinas = 0, createdTopicos = 0;

      // 0. Criar disciplinas e tópicos selecionados (se houver).
      // Chamado sempre: com seleção vazia ele só devolve o mapa do que já existe,
      // e esse mapa é usado para ligar a linha do tempo aos tópicos certos.
      const selecaoParaCriar: SelecaoConteudo = conteudoNovo ? selecaoConteudo : { disciplinas: [], topicos: [] };
      const mapaIds: MapaIds = await criarConteudoSelecionado(userId, selecaoParaCriar);
      createdDisciplinas = mapaIds.criadas?.disciplinas ?? 0;
      createdTopicos = mapaIds.criadas?.topicos ?? 0;

      // O mapa de tópicos usa a chave `${idDaDisciplina}::${tópicoNormalizado}`
      const buscarTopicoId = (disciplina: string, topico: string): string | undefined => {
        const discId = mapaIds.disciplinas.get(normalizarNome(disciplina));
        if (!discId) return undefined;
        return mapaIds.topicos.get(`${discId}::${normalizarNome(topico)}`);
      };

      // 1. Tasks (biblioteca)
      for (const task of validatedData.tasks) {
        const result = await upsertStudyTaskByName({
          name: task.name,
          activity_type: task.activity_type,
          duration_min: task.duration_min,
          color: task.color,
          theme_rule: task.theme_rule,
        });
        if (result.action === 'created') createdTasks++;
        else if (result.action === 'updated') updatedTasks++;
        else skippedTasks++;
      }

      // 2. Timelines (linha do tempo) - topic_ids via mapaIds (disciplina+tópico) ou topicMatches (fallback)
      for (const timeline of validatedData.timelines) {
        let topicIds: string[] = [];

        const topicIdFromMap = buscarTopicoId(timeline.discipline, timeline.topic);
        if (topicIdFromMap) {
          topicIds = [topicIdFromMap];
        } else {
          // Fallback para o match solto original
          const topicIdFromMatch = validatedData.topicMatches.get(timeline.topic);
          if (topicIdFromMatch) topicIds = [topicIdFromMatch];
        }

        const result = await upsertStudyThemeTimeline({
          period_type: timeline.period_type,
          period_start: timeline.period_start,
          themes: [timeline.topic], // themes é array de strings
          topic_ids: topicIds,
        });
        if (result.id) {
          createdTimelines++;
        }
      }

      // 3. Blocks (rotina semanal) - precisam da task criada/achada
      const hoje = new Date().toISOString().split('T')[0];
      for (const block of validatedData.blocks) {
        // Primeiro garantir que a task existe (pelo nome da disciplina + tipo)
        const taskName = `${block.activity_type.charAt(0).toUpperCase() + block.activity_type.slice(1)} - ${block.discipline}`;
        const taskResult = await upsertStudyTaskByName({
          name: taskName,
          activity_type: block.activity_type,
          duration_min: Math.round((parseTimeToMinutes(block.end_time) - parseTimeToMinutes(block.start_time)) || 60),
          color: block.color ?? '#3B82F6',
          theme_rule: 'period',
        });
        if (taskResult.action === 'created') createdTasks++;
        else if (taskResult.action === 'updated') updatedTasks++;
        else skippedTasks++;

        // Agora o bloco semanal
        const blockResult = await upsertStudyWeeklyBlock({
          task_id: taskResult.task.id,
          weekday: block.weekday,
          start_time: block.start_time.slice(0, 5), // HH:MM
          end_time: block.end_time.slice(0, 5),
          effective_from: hoje,
        });
        if (blockResult.action === 'created') createdBlocks++;
        else if (blockResult.action === 'updated') updatedBlocks++;
        else skippedBlocks++;
      }

      let toastMsg = `Importação concluída! ` +
        `Tarefas: ${createdTasks}C/${updatedTasks}A/${skippedTasks}P | ` +
        `Períodos: ${createdTimelines}C/${updatedTimelines}A/${skippedTimelines}P | ` +
        `Blocos: ${createdBlocks}C/${updatedBlocks}A/${skippedBlocks}P`;

      if (createdDisciplinas > 0 || createdTopicos > 0) {
        toastMsg += ` | Conteúdos: ${createdDisciplinas} disciplinas e ${createdTopicos} tópicos criados`;
      }

      toast.success(toastMsg);
      onClose();
    } catch (err: any) {
      toast.error(`Erro ao importar: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const parseTimeToMinutes = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  // Helpers para checkboxes da seção de conteúdos novos
  // (comparação por nome normalizado: "matemática" e "Matemática" são a mesma disciplina)
  const mesmoNome = (a: string, b: string) => normalizarNome(a) === normalizarNome(b);
  const ehDisciplinaNova = (nome: string) =>
    !!conteudoNovo?.disciplinasNovas.some(d => mesmoNome(d, nome));

  const toggleDisciplina = (nome: string) => {
    setSelecaoConteudo(prev => {
      const isSelected = prev.disciplinas.some(d => mesmoNome(d, nome));
      if (isSelected) {
        // Desmarcar disciplina desmarca os tópicos dela
        return {
          disciplinas: prev.disciplinas.filter(d => !mesmoNome(d, nome)),
          topicos: prev.topicos.filter(t => !mesmoNome(t.disciplina, nome)),
        };
      }
      // Marcar disciplina marca os tópicos novos dela
      const topicosDela = (conteudoNovo?.topicosNovos ?? []).filter(t => mesmoNome(t.disciplina, nome));
      const jaMarcados = new Set(prev.topicos.map(t => `${normalizarNome(t.disciplina)}::${normalizarNome(t.nome)}`));
      const acrescentar = topicosDela
        .filter(t => !jaMarcados.has(`${normalizarNome(t.disciplina)}::${normalizarNome(t.nome)}`))
        .map(t => ({ disciplina: t.disciplina, nome: t.nome }));
      return {
        disciplinas: [...prev.disciplinas, nome],
        topicos: [...prev.topicos, ...acrescentar],
      };
    });
  };

  const toggleTopico = (disciplina: string, nome: string) => {
    setSelecaoConteudo(prev => {
      const igual = (t: { disciplina: string; nome: string }) => mesmoNome(t.disciplina, disciplina) && mesmoNome(t.nome, nome);
      const isSelected = prev.topicos.some(igual);
      const novosTopicos = isSelected
        ? prev.topicos.filter(t => !igual(t))
        : [...prev.topicos, { disciplina, nome }];

      let novasDisciplinas = prev.disciplinas;
      if (!isSelected) {
        // Marcar tópico garante a disciplina marcada (se já existir, o serviço só reaproveita)
        if (!prev.disciplinas.some(d => mesmoNome(d, disciplina))) {
          novasDisciplinas = [...prev.disciplinas, disciplina];
        }
      } else {
        // Desmarcar o último tópico de uma disciplina NOVA desmarca a disciplina
        const restantes = novosTopicos.filter(t => mesmoNome(t.disciplina, disciplina));
        if (restantes.length === 0 && ehDisciplinaNova(disciplina)) {
          novasDisciplinas = novasDisciplinas.filter(d => !mesmoNome(d, disciplina));
        }
      }

      return { disciplinas: novasDisciplinas, topicos: novosTopicos };
    });
  };

  const isDisciplinaSelecionada = (nome: string) => selecaoConteudo.disciplinas.some(d => mesmoNome(d, nome));
  const isTopicoSelecionado = (disciplina: string, nome: string) =>
    selecaoConteudo.topicos.some(t => mesmoNome(t.disciplina, disciplina) && mesmoNome(t.nome, nome));

  const marcarTodos = () => {
    if (!conteudoNovo) return;
    setSelecaoConteudo({
      disciplinas: [...conteudoNovo.disciplinasNovas],
      topicos: conteudoNovo.topicosNovos.map(t => ({ disciplina: t.disciplina, nome: t.nome })),
    });
  };

  const desmarcarTodos = () => {
    setSelecaoConteudo({ disciplinas: [], topicos: [] });
  };

  const totalSelecionados = () => {
    if (!conteudoNovo) return { disciplinas: 0, topicos: 0 };
    return {
      // só conta disciplinas realmente novas (as que já existem só recebem tópicos)
      disciplinas: selecaoConteudo.disciplinas.filter(d => ehDisciplinaNova(d)).length,
      topicos: selecaoConteudo.topicos.length,
    };
  };

  const btn = "rf-button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors";
  const primary = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
  const outline = `${btn} border border-border hover:bg-muted`;

  return (
    <div className="rf-modal fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="rf-card w-full max-w-lg rounded-2xl bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Importar cronograma</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-md p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`hidden text-xs sm:inline ${i === step ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`h-px flex-1 ${i < step ? "bg-primary" : "bg-border"}`} />}
            </React.Fragment>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Baixe o template e preencha manualmente, OU copie o prompt e cole no ChatGPT/Claude com seu cronograma.
            </p>
            <a href="/templates/cronograma-template.xlsx" target="_blank" rel="noopener noreferrer" download className={`${primary} w-full py-3 text-base`}>
              <FileSpreadsheet className="h-5 w-5" /> Baixar template Excel
            </a>
            <button onClick={copyPrompt} className={`${outline} w-full`}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copiar prompt de IA
            </button>
            <div className="flex justify-end pt-2">
              <button onClick={() => setStep(1)} className={primary}>Próximo <ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <label
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">{file ? file.name : "Arraste o Excel aqui ou clique para escolher"}</span>
              <span className="text-xs text-muted-foreground">.xlsx ou .xls</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
            <div className="flex justify-between">
              <button onClick={() => setStep(0)} className={outline}><ArrowLeft className="h-4 w-4" /> Voltar</button>
              <div className="flex gap-2">
                <button
                  onClick={handleValidate}
                  disabled={!file || isProcessing}
                  className={`${outline} disabled:opacity-50`}
                >
                  Validar
                </button>
                <button onClick={() => setStep(2)} className={primary}>Próximo <ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {preview ? (
                [
                  [String(preview.taskCount), "tarefas"],
                  [String(preview.timelineCount), "períodos de temas"],
                  [String(preview.blockCount), "blocos semanais"],
                ].map(([n, l]) => (
                  <div key={l} className="rf-card rounded-xl border border-border p-3 text-center">
                    <div className="font-display text-xl font-bold">{n}</div>
                    <div className="text-xs text-muted-foreground">{l}</div>
                  </div>
                ))
              ) : (
                [
                  ["X", "tarefas"],
                  ["Y", "períodos de temas"],
                  ["Z", "blocos semanais"],
                ].map(([n, l]) => (
                  <div key={l} className="rf-card rounded-xl border border-border p-3 text-center">
                    <div className="font-display text-xl font-bold">{n}</div>
                    <div className="text-xs text-muted-foreground">{l}</div>
                  </div>
                ))
              )}
            </div>
            {(preview && (preview.topicMissCount > 0 || preview.warnings.length > 0)) && (
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                {preview.topicMissCount > 0 && (
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <span>{preview.topicMissCount} tópico(s) não encontrados na aba Conteúdos → serão texto livre</span>
                  </div>
                )}
                {preview.warnings.length > 0 && preview.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm mt-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Seção: Conteúdos novos para a aba Conteúdos */}
            {conteudoNovo && (conteudoNovo.disciplinasNovas.length > 0 || conteudoNovo.topicosNovos.length > 0) && (
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-foreground">Conteúdos novos para a aba Conteúdos</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {totalSelecionados().disciplinas} disciplinas e {totalSelecionados().topicos} tópicos selecionados
                    </span>
                    <button onClick={marcarTodos} className="text-xs text-primary hover:underline" disabled={isLoadingConteudo}>
                      Marcar todos
                    </button>
                    <button onClick={desmarcarTodos} className="text-xs text-primary hover:underline" disabled={isLoadingConteudo}>
                      Desmarcar todos
                    </button>
                  </div>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {/* Disciplinas novas, cada uma com seus tópicos novos */}
                  {conteudoNovo.disciplinasNovas.map((discNome) => {
                    const topicosDaDisc = conteudoNovo.topicosNovos.filter(t => mesmoNome(t.disciplina, discNome));
                    return (
                      <div key={discNome} className="space-y-2 pl-2 border-l-2 border-border">
                        <ItemConteudo
                          marcado={isDisciplinaSelecionada(discNome)}
                          onClick={() => toggleDisciplina(discNome)}
                          forte
                        >
                          {discNome} <span className="text-xs font-normal text-muted-foreground">(disciplina nova)</span>
                        </ItemConteudo>
                        {topicosDaDisc.length > 0 && (
                          <div className="space-y-1 ml-6">
                            {topicosDaDisc.map((tp) => (
                              <ItemConteudo
                                key={tp.nome}
                                marcado={isTopicoSelecionado(tp.disciplina, tp.nome)}
                                onClick={() => toggleTopico(tp.disciplina, tp.nome)}
                              >
                                {tp.nome}
                              </ItemConteudo>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Tópicos novos em disciplinas que você já tem */}
                  {(() => {
                    const topicosEmExistentes = conteudoNovo.topicosNovos.filter(t => !ehDisciplinaNova(t.disciplina));
                    if (topicosEmExistentes.length === 0) return null;
                    return (
                      <div className="space-y-2 pl-2 border-l-2 border-border">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Tópicos novos em disciplinas que você já tem
                        </p>
                        <div className="space-y-1 ml-1">
                          {topicosEmExistentes.map((tp) => (
                            <ItemConteudo
                              key={`${tp.disciplina}::${tp.nome}`}
                              marcado={isTopicoSelecionado(tp.disciplina, tp.nome)}
                              onClick={() => toggleTopico(tp.disciplina, tp.nome)}
                            >
                              {tp.nome} <span className="text-muted-foreground">({tp.disciplina})</span>
                            </ItemConteudo>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className={outline}><ArrowLeft className="h-4 w-4" /> Voltar</button>
              <button
                onClick={handleImport}
                disabled={isProcessing}
                className={`${primary} disabled:opacity-50`}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Importar tudo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Linha clicável com caixinha, usada na seção "Conteúdos novos". */
function ItemConteudo({
  marcado,
  onClick,
  forte = false,
  children,
}: {
  marcado: boolean;
  onClick: () => void;
  forte?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcado}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/60"
    >
      <span
        className={`h-4 w-4 shrink-0 rounded ${forte ? 'border-2' : 'border'} flex items-center justify-center transition-colors`}
        style={{
          backgroundColor: marcado ? 'var(--primary)' : 'transparent',
          borderColor: marcado ? 'var(--primary)' : 'var(--border)',
          color: marcado ? 'var(--primary-foreground)' : 'transparent',
        }}
      >
        {marcado && <Check className="h-3 w-3" />}
      </span>
      <span className={`text-sm text-foreground ${forte ? 'font-medium' : ''}`}>{children}</span>
    </button>
  );
}