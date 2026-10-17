// src/components/RevisarImportacaoPdfModal.tsx
//
// Tela de revisão: recebe um PDF, roda o parser + associação de extras,
// mostra tudo para edição e salva (lista OU simulado).

import { useState, useEffect, useMemo } from 'react';
import { importarPdf, type ExtracaoCompleta } from '@/services/pdfImportService';
import type { ParseResult } from '@/services/parseQuestoesPdf';
import {
  associarExtras,
  juntarImagensVerticais,
  blobParaBase64,
  type ResultadoAssociacao,
} from '@/services/pdfExtrasService';
import { marcarCompleto } from '@/services/pdfExtracaoAvancada';
import { importarLista } from '@/services/listaService';
import { importarSimulado } from '@/services/simuladoService';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import type {
  QuestaoImportLista,
  AlternativaLista,
} from '@/lib/listas-types';
import type { SimuladoImport, QuestaoImport } from '@/lib/simulados-types';
import { useToast } from '@/hooks/useToast';
import {
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Trash2,
  Save,
  Plus,
  Merge,
  Image as ImageIcon,
  Upload,
} from 'lucide-react';

type Modo = 'lista' | 'simulado';
type TipoQuestao = 'multipla_escolha' | 'certo_errado';

interface Discipline { id: string; name: string; }
interface PastaResumo { id: string; name: string; discipline_id: string; }

interface SimuladoDefaults {
  area?: string;
  nivel?: 'Básico' | 'Intermediário' | 'Avançado';
  banca?: string;
  ano?: number;
  tempo_total?: number;
  descricao?: string;
}

interface Props {
  file: File;
  userId: string;
  modo: Modo;
  disciplinaInicial?: string;
  pastaInicial?: string | null;
  pastasDisponiveis?: PastaResumo[];
  simuladoDefaults?: SimuladoDefaults;
  onClose: () => void;
  onSuccess: (id: string) => void;
}

async function getDisciplinesAuth(userId: string) {
  try {
    const client = await getSupabaseWithToken();
    const { data, error } = await client
      .from('disciplines').select('*')
      .eq('user_id', userId).eq('isDeleted', false)
      .order('name', { ascending: true });
    if (error) throw error;
    return { success: true, data: (data || []) as Discipline[] };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export function RevisarImportacaoPdfModal({
  file,
  userId,
  modo,
  disciplinaInicial,
  pastaInicial,
  pastasDisponiveis = [],
  simuladoDefaults,
  onClose,
  onSuccess,
}: Props) {
  const toast = useToast();

  const [parsing, setParsing] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const [extracao, setExtracao] = useState<ExtracaoCompleta | null>(null);

  const [titulo, setTitulo] = useState('');
  const [questoes, setQuestoes] = useState<QuestaoImportLista[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [associacao, setAssociacao] = useState<ResultadoAssociacao | null>(null);

  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [disciplineId, setDisciplineId] = useState<string>(disciplinaInicial || '');
  const [folderId, setFolderId] = useState<string | null>(pastaInicial ?? null);
  const [loadingDisciplines, setLoadingDisciplines] = useState(modo === 'lista');

  const [descricao, setDescricao] = useState(simuladoDefaults?.descricao || '');
  const [area, setArea] = useState(simuladoDefaults?.area || 'Não categorizada');
  const [nivel, setNivel] = useState<'Básico' | 'Intermediário' | 'Avançado'>(
    simuladoDefaults?.nivel || 'Intermediário'
  );
  const [banca, setBanca] = useState(simuladoDefaults?.banca || '');
  const [ano, setAno] = useState<number>(simuladoDefaults?.ano || new Date().getFullYear());
  const [tempoTotal, setTempoTotal] = useState<number>(simuladoDefaults?.tempo_total || 60);

  const [importing, setImporting] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { extracao, resultado } = await importarPdf(file);
        if (cancelled) return;

        const assoc = associarExtras(
          resultado.questoes,
          extracao.linhas,
          extracao.imagens
        );

        setExtracao(extracao);
        setTitulo(resultado.titulo || file.name.replace(/\.pdf$/i, ''));
        setQuestoes(resultado.questoes);
        setWarnings([...(resultado.warnings || []), ...assoc.avisos]);
        setAssociacao(assoc);
      } catch (e: any) {
        if (!cancelled) setParseError(e?.message || String(e));
      } finally {
        if (!cancelled) setParsing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    if (modo !== 'lista') return;
    (async () => {
      const r = await getDisciplinesAuth(userId);
      if (r.success && r.data) {
        setDisciplines(r.data);
        if (!disciplinaInicial && r.data.length > 0) setDisciplineId(r.data[0].id);
      }
      setLoadingDisciplines(false);
    })();
  }, [userId, disciplinaInicial, modo]);

  const pastasDaDisciplina = useMemo(
    () => pastasDisponiveis.filter((p) => p.discipline_id === disciplineId),
    [pastasDisponiveis, disciplineId]
  );

  const problemas = useMemo(() => {
    const p: string[] = [];
    questoes.forEach((q, i) => {
      const n = q.numero || i + 1;
      if (!q.enunciado?.trim()) p.push(`Q${n}: sem enunciado.`);
      if (q.tipo === 'multipla_escolha') {
        const alts = q.alternativas || [];
        if (alts.length < 2) p.push(`Q${n}: menos de 2 alternativas.`);
        const corretas = alts.filter((a) => a.correta).length;
        if (corretas !== 1) p.push(`Q${n}: ${corretas} alternativas corretas (precisa de 1).`);
      } else if (q.tipo === 'certo_errado') {
        if (q.correta !== true && q.correta !== false)
          p.push(`Q${n}: gabarito certo/errado não definido.`);
      }
    });
    return p;
  }, [questoes]);

  const removerQuestao = (idx: number) => {
    setQuestoes((prev) => prev.filter((_, i) => i !== idx));
  };

  const juntarComAnterior = (idx: number) => {
    if (idx <= 0) return;
    setQuestoes((prev) => {
      const copia = [...prev];
      const anterior = { ...copia[idx - 1] };
      const atual = copia[idx];
      anterior.enunciado = `${anterior.enunciado}\n\n${atual.enunciado}`;
      if (anterior.tipo === 'multipla_escolha' && atual.tipo === 'multipla_escolha' && atual.alternativas) {
        anterior.alternativas = [...(anterior.alternativas || []), ...atual.alternativas];
      }
      copia[idx - 1] = anterior;
      copia.splice(idx, 1);
      return copia;
    });
  };

  const salvarEdicao = (idx: number, nova: QuestaoImportLista) => {
    setQuestoes((prev) => prev.map((q, i) => (i === idx ? nova : q)));
    setEditingIdx(null);
  };

  const handleSalvar = async () => {
    if (!titulo.trim()) return toast.error('Dê um título à lista/simulado');
    if (questoes.length === 0) return toast.error('Não há questões para salvar');
    if (problemas.length > 0)
      return toast.error(`Corrija ${problemas.length} problema(s) antes de salvar`, {
        description: problemas[0],
      });

    if (modo === 'lista') {
      if (!disciplineId) return toast.error('Escolha uma disciplina');
    } else {
      if (!area.trim()) return toast.error('Informe a área do simulado');
      if (!banca.trim()) return toast.error('Informe a banca do simulado');
    }

    setImporting(true);
    try {
      const questoesFinais = [...questoes];
      if (associacao) {
        for (let i = 0; i < questoesFinais.length; i++) {
          const q = questoesFinais[i];
          const imgs = associacao.imagensPorQuestao.get(q.numero);
          if (!imgs || imgs.length === 0) continue;
          const junta = await juntarImagensVerticais(imgs);
          if (junta) {
            const b64 = await blobParaBase64(junta.blob);
            (q as any).imagem_base64 = b64;
          }
        }
      }

      let result: { success: boolean; listaId?: string; simuladoId?: string; error?: string };

      if (modo === 'lista') {
        result = await importarLista(
          { titulo: titulo.trim(), questoes: questoesFinais },
          userId,
          disciplineId,
          undefined,
          folderId
        );
      } else {
        const questoesSimulado: QuestaoImport[] = questoesFinais.map((q) => ({
          numero: q.numero,
          tipo: q.tipo,
          enunciado: q.enunciado,
          area: q.area || area,
          imagem_base64: (q as any).imagem_base64 || null,
          comentario_geral: q.comentario_geral,
          sublinhados_enunciado: q.sublinhados_enunciado,
          sublinhados_comentario: q.sublinhados_comentario,
          negritos_enunciado: q.negritos_enunciado,
          negritos_comentario: q.negritos_comentario,
          italicos_enunciado: q.italicos_enunciado,
          italicos_comentario: q.italicos_comentario,
          alternativas: q.tipo === 'multipla_escolha' ? q.alternativas : undefined,
          correta: q.tipo === 'certo_errado' ? q.correta : undefined,
        }));

        const dadosSimulado: SimuladoImport = {
          titulo: titulo.trim(),
          descricao: descricao.trim() || undefined,
          area: area.trim(),
          nivel,
          banca: banca.trim(),
          ano,
          tempo_total: tempoTotal,
          questoes: questoesSimulado,
        };

        result = await importarSimulado(dadosSimulado, userId);
      }

      const id = result.listaId || result.simuladoId;
      if (!result.success || !id) {
        toast.error('Erro ao salvar', { description: result.error });
        return;
      }
      toast.success(modo === 'lista' ? 'Lista importada com sucesso!' : 'Simulado importado com sucesso!');
      onSuccess(id);
    } catch (e: any) {
      toast.error('Erro inesperado', { description: e?.message || String(e) });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-surface shadow-elevated">
        <header className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">
              Revisar importação de PDF {modo === 'simulado' ? '— Simulado' : '— Lista'}
            </h3>
            <p className="text-xs text-foreground/50 truncate">{file.name}</p>
          </div>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground" disabled={importing}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {parsing && (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-foreground/60">Lendo o PDF, associando sublinhados e imagens…</p>
            </div>
          )}

          {parseError && (
            <div className="rounded-lg border border-accent/20 bg-accent/10 p-4 text-sm text-accent">
              <p className="font-semibold mb-1">Não consegui ler o PDF:</p>
              <p>{parseError}</p>
            </div>
          )}

          {!parsing && !parseError && (
            <div className="space-y-5">
              {extracao && associacao && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-foreground/50">
                  <span>📄 {extracao.totalPaginas} páginas</span>
                  <span>✅ {questoes.length} questões</span>
                  <span>✍️ {associacao.totalSublinhados} sublinhados</span>
                  {(associacao.totalNegritos ?? 0) > 0 && (
                    <span>🅱️ {associacao.totalNegritos} negritos</span>
                  )}
                  {(associacao.totalItalicos ?? 0) > 0 && (
                    <span>𝘐 {associacao.totalItalicos} itálicos</span>
                  )}
                  <span>🖼️ {associacao.questoesComImagem} questões com imagem</span>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-foreground/70">Título *</label>
                <input
                  type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)}
                  disabled={importing}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />
              </div>

              {modo === 'lista' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-foreground/70">Disciplina *</label>
                    {loadingDisciplines ? (
                      <div className="mt-1 flex items-center gap-2 text-xs text-foreground/50">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                      </div>
                    ) : disciplines.length === 0 ? (
                      <div className="mt-1 rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">
                        Sem disciplinas cadastradas.
                      </div>
                    ) : (
                      <select
                        value={disciplineId}
                        onChange={(e) => { setDisciplineId(e.target.value); setFolderId(null); }}
                        disabled={importing}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                      >
                        {disciplines.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground/70">Pasta (opcional)</label>
                    <select
                      value={folderId || ''}
                      onChange={(e) => setFolderId(e.target.value || null)}
                      disabled={importing}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="">Sem pasta (direto na disciplina)</option>
                      {pastasDaDisciplina.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-foreground/70">Área *</label>
                      <input
                        type="text" value={area} onChange={(e) => setArea(e.target.value)}
                        disabled={importing}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                        placeholder="Ex: Português"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground/70">Nível</label>
                      <select
                        value={nivel}
                        onChange={(e) => setNivel(e.target.value as any)}
                        disabled={importing}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                      >
                        <option value="Básico">Básico</option>
                        <option value="Intermediário">Intermediário</option>
                        <option value="Avançado">Avançado</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="text-sm font-medium text-foreground/70">Banca *</label>
                      <input
                        type="text" value={banca} onChange={(e) => setBanca(e.target.value)}
                        disabled={importing}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                        placeholder="Ex: FGV"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground/70">Ano</label>
                      <input
                        type="number" value={ano} onChange={(e) => setAno(parseInt(e.target.value) || 0)}
                        disabled={importing}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground/70">Tempo total (min)</label>
                      <input
                        type="number" value={tempoTotal} onChange={(e) => setTempoTotal(parseInt(e.target.value) || 0)}
                        disabled={importing}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground/70">Descrição (opcional)</label>
                    <textarea
                      value={descricao} onChange={(e) => setDescricao(e.target.value)}
                      disabled={importing} rows={2}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
                    />
                  </div>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-warning mb-2">
                    <AlertTriangle className="h-3.5 w-3.5" /> Avisos ({warnings.length})
                  </p>
                  <ul className="text-[11px] text-foreground/70 space-y-0.5 max-h-40 overflow-y-auto">
                    {warnings.map((w, i) => (<li key={i}>• {w}</li>))}
                  </ul>
                </div>
              )}

              {problemas.length > 0 && (
                <div className="rounded-lg border border-accent/30 bg-accent/10 p-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-accent mb-2">
                    <AlertTriangle className="h-3.5 w-3.5" /> Corrija antes de salvar ({problemas.length})
                  </p>
                  <ul className="text-[11px] text-foreground/70 space-y-0.5 max-h-40 overflow-y-auto">
                    {problemas.map((p, i) => (<li key={i}>• {p}</li>))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Questões ({questoes.length})</h4>
                {questoes.map((q, idx) => (
                  <QuestaoResumoCard
                    key={idx}
                    q={q}
                    idx={idx}
                    imagens={associacao?.imagensPorQuestao.get(q.numero) ?? []}
                    onEdit={() => setEditingIdx(idx)}
                    onRemove={() => removerQuestao(idx)}
                    onMerge={idx > 0 ? () => juntarComAnterior(idx) : undefined}
                    disabled={importing}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-4 shrink-0">
          <button
            onClick={onClose} disabled={importing}
            className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 disabled:opacity-50"
          >
            {parseError ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            onClick={handleSalvar}
            disabled={
              parsing || !!parseError || importing || !titulo.trim() ||
              questoes.length === 0 || problemas.length > 0 ||
              (modo === 'lista' && !disciplineId) ||
              (modo === 'simulado' && (!area.trim() || !banca.trim()))
            }
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</>
            ) : (
              <><Save className="h-4 w-4" /> {modo === 'lista' ? 'Salvar lista' : 'Salvar simulado'}</>
            )}
          </button>
        </footer>
      </div>

      {editingIdx !== null && questoes[editingIdx] && (
        <EditarQuestaoInline
          questao={questoes[editingIdx]}
          onSave={(nova) => salvarEdicao(editingIdx, nova)}
          onClose={() => setEditingIdx(null)}
        />
      )}
    </div>
  );
}

function QuestaoResumoCard({
  q, idx, imagens, onEdit, onRemove, onMerge, disabled,
}: {
  q: QuestaoImportLista;
  idx: number;
  imagens: { blob: Blob; largura: number; altura: number }[];
  onEdit: () => void;
  onRemove: () => void;
  onMerge?: () => void;
  disabled: boolean;
}) {
  const temErro = !q.enunciado?.trim();
  const temSublinhado = (q.sublinhados_enunciado?.length ?? 0) > 0;

  return (
    <div
      className={[
        'rounded-lg border bg-surface/40 p-3',
        temErro ? 'border-accent/40' : 'border-border',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              Q{q.numero || idx + 1}
            </span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-foreground/50">
              {q.tipo === 'multipla_escolha' ? 'Múltipla escolha' : 'Certo/Errado'}
            </span>
            {temSublinhado && (
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                ✍️ {q.sublinhados_enunciado?.length} sublinhado(s)
              </span>
            )}
            {(q.negritos_enunciado?.length ?? 0) > 0 && (
              <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                🅱️ {q.negritos_enunciado?.length} negrito(s)
              </span>
            )}
            {(q.italicos_enunciado?.length ?? 0) > 0 && (
              <span className="rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] font-semibold text-pink-400">
                𝘐 {q.italicos_enunciado?.length} itálico(s)
              </span>
            )}
            {imagens.length > 0 && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                🖼️ {imagens.length} imagem(ns)
              </span>
            )}
            {temErro && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                Erro
              </span>
            )}
          </div>

          <p
            className="text-xs text-foreground/80 line-clamp-3 leading-snug"
            dangerouslySetInnerHTML={{
              __html: marcarCompleto(
                q.enunciado,
                q.sublinhados_enunciado ?? [],
                q.negritos_enunciado ?? [],
                q.italicos_enunciado ?? [],
                'html'
              ),
            }}
          />

          {q.tipo === 'multipla_escolha' && q.alternativas && (
            <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
              {q.alternativas.map((a) => (
                <span
                  key={a.letra}
                  className={[
                    'rounded-full px-2 py-0.5',
                    a.correta
                      ? 'bg-green-500/15 text-green-500 font-semibold'
                      : 'bg-white/5 text-foreground/40',
                  ].join(' ')}
                >
                  {a.letra}{a.correta && ' ✓'}
                </span>
              ))}
            </div>
          )}

          {q.tipo === 'certo_errado' && (
            <p className="mt-1 text-[10px] text-foreground/50">
              Gabarito: <b className={q.correta ? 'text-green-500' : 'text-accent'}>
                {q.correta ? 'Certo' : 'Errado'}
              </b>
            </p>
          )}

          {imagens.length > 0 && (
            <div className="mt-2 flex gap-2">
              {imagens.slice(0, 3).map((img, i) => (
                <MiniaturaImagem key={i} blob={img.blob} />
              ))}
              {imagens.length > 3 && (
                <div className="grid place-items-center h-16 w-16 rounded border border-border bg-background/40 text-[10px] text-foreground/40">
                  +{imagens.length - 3}
                </div>
              )}
            </div>
          )}

          {q.comentario_geral && (
            <p className="mt-1 text-[10px] text-foreground/40">
              Comentário: {q.comentario_geral.length} caracteres
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 shrink-0">
          <button
            onClick={onEdit} disabled={disabled}
            className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface text-foreground/50 hover:text-primary hover:border-primary/40 disabled:opacity-40"
            title="Editar"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {onMerge && (
            <button
              onClick={onMerge} disabled={disabled}
              className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface text-foreground/50 hover:text-primary hover:border-primary/40 disabled:opacity-40"
              title="Juntar com a anterior"
            >
              <Merge className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={onRemove} disabled={disabled}
            className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface text-foreground/50 hover:text-accent hover:border-accent/40 disabled:opacity-40"
            title="Remover"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniaturaImagem({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? (
    <img src={url} alt="" className="h-16 w-16 object-cover rounded border border-border" />
  ) : (
    <div className="h-16 w-16 rounded border border-border bg-background/40" />
  );
}

function EditarQuestaoInline({
  questao, onSave, onClose,
}: {
  questao: QuestaoImportLista;
  onSave: (q: QuestaoImportLista) => void;
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState<TipoQuestao>(questao.tipo);
  const [enunciado, setEnunciado] = useState(questao.enunciado);
  const [comentario, setComentario] = useState(questao.comentario_geral || '');
  const [alternativas, setAlternativas] = useState<AlternativaLista[]>(
    questao.tipo === 'multipla_escolha' && questao.alternativas
      ? questao.alternativas
      : [
          { letra: 'A', texto: '', correta: false, comentario: null },
          { letra: 'B', texto: '', correta: false, comentario: null },
          { letra: 'C', texto: '', correta: false, comentario: null },
          { letra: 'D', texto: '', correta: false, comentario: null },
        ]
  );
  const [corretaCE, setCorretaCE] = useState<boolean>(
    questao.tipo === 'certo_errado' ? questao.correta === true : true
  );

  const [imagemBase64, setImagemBase64] = useState<string | null>(
    (questao as any).imagem_base64 || null
  );
  const [imagemPreview, setImagemPreview] = useState<string | null>(
    (questao as any).imagem_base64 || null
  );
  const [imagemErro, setImagemErro] = useState<string | null>(null);

  const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;

  const marcarCorreta = (i: number) =>
    setAlternativas(alternativas.map((a, j) => ({ ...a, correta: j === i })));
  const atualizarAlternativa = (i: number, texto: string) =>
    setAlternativas(alternativas.map((a, j) => (j === i ? { ...a, texto } : a)));
  const adicionarAlternativa = () => {
    if (alternativas.length >= 5) return;
    setAlternativas([
      ...alternativas,
      { letra: LETRAS[alternativas.length], texto: '', correta: false, comentario: null },
    ]);
  };
  const removerAlternativa = (i: number) => {
    if (alternativas.length <= 2) return;
    setAlternativas(alternativas.filter((_, j) => j !== i).map((a, j) => ({ ...a, letra: LETRAS[j] })));
  };

  const handleImagemChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImagemErro(null);

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImagemErro('Formato inválido. Use JPEG, PNG ou WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setImagemErro('Imagem maior que 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setImagemBase64(b64);
      setImagemPreview(b64);
    };
    reader.onerror = () => setImagemErro('Falha ao ler a imagem.');
    reader.readAsDataURL(file);
  };

  const removerImagem = () => {
    setImagemBase64(null);
    setImagemPreview(null);
    setImagemErro(null);
  };

  const handleSalvar = () => {
    if (!enunciado.trim()) return;
    const nova: QuestaoImportLista = {
      numero: questao.numero,
      tipo,
      enunciado: enunciado.trim(),
      area: questao.area || 'Não categorizada',
      comentario_geral: comentario.trim() || undefined,
      sublinhados_enunciado: questao.sublinhados_enunciado,
      sublinhados_comentario: questao.sublinhados_comentario,
      negritos_enunciado: questao.negritos_enunciado,
      negritos_comentario: questao.negritos_comentario,
      italicos_enunciado: questao.italicos_enunciado,
      italicos_comentario: questao.italicos_comentario,
    };
    if (tipo === 'multipla_escolha') nova.alternativas = alternativas;
    else nova.correta = corretaCE;

    if (imagemBase64) (nova as any).imagem_base64 = imagemBase64;

    onSave(nova);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-surface">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <h3 className="font-semibold">Editar questão {questao.numero}</h3>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 p-6">
          <div>
            <label className="text-sm font-medium text-foreground/70">Tipo</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => setTipo('multipla_escolha')}
                className={[
                  'rounded-lg border px-3 py-2 text-sm font-medium',
                  tipo === 'multipla_escolha' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground/60',
                ].join(' ')}
              >Múltipla escolha</button>
              <button
                type="button" onClick={() => setTipo('certo_errado')}
                className={[
                  'rounded-lg border px-3 py-2 text-sm font-medium',
                  tipo === 'certo_errado' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground/60',
                ].join(' ')}
              >Certo / Errado</button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground/70">Enunciado</label>
            <textarea
              value={enunciado}
              onChange={(e) => setEnunciado(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground/70 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Imagem da questão
            </label>

            {imagemPreview ? (
              <div className="mt-2 space-y-2">
                <img
                  src={imagemPreview}
                  alt="Prévia"
                  className="max-h-48 rounded-lg border border-border object-contain"
                />
                <div className="flex gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/65 hover:text-primary hover:border-primary/40 transition-colors">
                    <Upload className="h-3.5 w-3.5" /> Trocar imagem
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImagemChange}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={removerImagem}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/65 hover:text-accent hover:border-accent/40 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </button>
                </div>
              </div>
            ) : (
              <label className="mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-foreground/50 hover:border-primary hover:text-primary transition-colors">
                <Upload className="h-3.5 w-3.5" />
                Adicionar imagem (JPEG, PNG ou WebP, máx. 2 MB)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImagemChange}
                  className="hidden"
                />
              </label>
            )}

            {imagemErro && (
              <p className="mt-1 text-[11px] text-accent">{imagemErro}</p>
            )}
          </div>

          {tipo === 'multipla_escolha' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground/70">Alternativas</label>
                {alternativas.length < 5 && (
                  <button type="button" onClick={adicionarAlternativa}
                    className="inline-flex items-center gap-1 text-[11px] text-primary">
                    <Plus className="h-3 w-3" /> Adicionar
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {alternativas.map((a, i) => (
                  <div key={i}
                    className={[
                      'flex items-start gap-2 rounded-lg border p-2',
                      a.correta ? 'border-primary/50 bg-primary/5' : 'border-border bg-background',
                    ].join(' ')}>
                    <button type="button" onClick={() => marcarCorreta(i)}
                      className={[
                        'grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold',
                        a.correta ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground/55',
                      ].join(' ')}>
                      {a.letra}
                    </button>
                    <textarea value={a.texto} onChange={(e) => atualizarAlternativa(i, e.target.value)} rows={2}
                      className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs resize-y" />
                    {alternativas.length > 2 && (
                      <button type="button" onClick={() => removerAlternativa(i)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-foreground/30 hover:text-accent">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tipo === 'certo_errado' && (
            <div>
              <label className="text-sm font-medium text-foreground/70">Gabarito</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCorretaCE(true)}
                  className={[
                    'rounded-lg border px-3 py-2 text-sm font-semibold',
                    corretaCE ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground/60',
                  ].join(' ')}>Certo</button>
                <button type="button" onClick={() => setCorretaCE(false)}
                  className={[
                    'rounded-lg border px-3 py-2 text-sm font-semibold',
                    !corretaCE ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground/60',
                  ].join(' ')}>Errado</button>
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-foreground/70">Comentário geral</label>
            <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={6}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y" />
          </div>
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-6 py-4">
          <button onClick={onClose}
            className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2">
            Cancelar
          </button>
          <button onClick={handleSalvar} disabled={!enunciado.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <CheckCircle2 className="h-4 w-4" /> Salvar alterações
          </button>
        </footer>
      </div>
    </div>
  );
}