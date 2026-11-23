import React, { useState } from "react";
import { Upload, FileSpreadsheet, Copy, Check, ArrowRight, ArrowLeft, X, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CRONOGRAMA_IMPORT_PROMPT } from "@/services/cronogramaPrompt";
import { parseCronogramaExcel, validateCronograma, buildImportPreview, type ValidationResult, type ImportPreview } from "@/services/cronogramaImporter";
import { upsertStudyTaskByName, upsertStudyWeeklyBlock, upsertStudyThemeTimeline } from "@/services/studyPlanService";

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

      // 2. Timelines (linha do tempo) - topic_ids via match
      for (const timeline of validatedData.timelines) {
        const topicId = validatedData.topicMatches.get(timeline.topic);
        const topicIds = topicId ? [topicId] : [];
        const result = await upsertStudyThemeTimeline({
          period_type: timeline.period_type,
          period_start: timeline.period_start,
          themes: [timeline.topic], // themes é array de strings
          topic_ids: topicIds,
        });
        if (result.id) {
          // upsertStudyThemeTimeline não retorna action, vamos assumir created se novo
          // A função cria ou atualiza baseado em period_type + period_start
          // Para simplificar, contamos como created (pode ter atualizado)
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

      toast.success(
        `Importação concluída! ` +
        `Tarefas: ${createdTasks}C/${updatedTasks}A/${skippedTasks}P | ` +
        `Períodos: ${createdTimelines}C/${updatedTimelines}A/${skippedTimelines}P | ` +
        `Blocos: ${createdBlocks}C/${updatedBlocks}A/${skippedBlocks}P`
      );
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
