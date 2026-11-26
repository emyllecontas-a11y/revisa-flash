// src/components/ListaPadraoConteudoModal.tsx
// Modal para adicionar disciplinas e tópicos da lista padrão (taxonomia)
//
// Como cada área da lista padrão vira conteúdo:
// - Odontologia: cada MATÉRIA vira um fichário (disciplina) e os tópicos viram tópicos.
// - Demais áreas (Português, Matemática, etc.): a ÁREA vira o fichário,
//   as matérias viram tópicos e os tópicos viram subtópicos.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronRight, Search, CheckSquare, Square, MinusSquare, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { getDb } from '@/lib/db';
import { getTaxonomia } from '@/services/taxonomiaService';
import { listarSubtopicos, criarSubtopicos } from '@/services/subtopicService';
import {
  normalizarNome,
  carregarConteudoExistente,
  criarConteudoSelecionado,
  type TaxonomiaDisciplina,
  type TaxonomiaMateria,
  type TaxonomiaTopico,
} from '@/services/conteudoSugestaoService';

interface ListaPadraoConteudoModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSuccess: () => void; // callback para recarregar a lista (loadData)
}

/** Áreas em que cada matéria vira um fichário próprio. Nas outras, a área inteira é um fichário só. */
const AREAS_MATERIA_VIRA_FICHARIO = new Set([normalizarNome('Odontologia')]);

function materiaViraFichario(area: TaxonomiaDisciplina) {
  return AREAS_MATERIA_VIRA_FICHARIO.has(normalizarNome(area.disciplina));
}

// Chaves de seleção (incluem a área para não misturar matérias de mesmo nome em áreas diferentes)
const SEP = '||';
const chaveMateria = (area: TaxonomiaDisciplina, materia: TaxonomiaMateria) =>
  `${normalizarNome(area.disciplina)}${SEP}${normalizarNome(materia.nome)}`;
const chaveTopico = (area: TaxonomiaDisciplina, materia: TaxonomiaMateria, topico: TaxonomiaTopico) =>
  `${chaveMateria(area, materia)}${SEP}${normalizarNome(topico.nome)}`;

interface Existente {
  disciplinas: Set<string>; // normDisc
  topicos: Set<string>; // `${normDisc}::${normTopico}`
  subtopicos: Set<string>; // `${normDisc}::${normTopico}::${normSub}`
}

const EXISTENTE_VAZIO: Existente = { disciplinas: new Set(), topicos: new Set(), subtopicos: new Set() };

async function carregarExistente(userId: string): Promise<Existente> {
  const { disciplinas, topicos } = await carregarConteudoExistente(userId);

  const normDiscPorId = new Map<string, string>();
  for (const d of disciplinas) normDiscPorId.set(d.id, d.normName);

  const chaveTopicoPorId = new Map<string, string>();
  const setTopicos = new Set<string>();
  for (const t of topicos) {
    const normDisc = normDiscPorId.get(t.discipline_id);
    if (!normDisc) continue;
    const chave = `${normDisc}::${t.normName}`;
    setTopicos.add(chave);
    chaveTopicoPorId.set(t.id, chave);
  }

  const setSubtopicos = new Set<string>();
  try {
    const db = await getDb();
    const subs = await db.subtopicos.find({ selector: { user_id: userId, isDeleted: { $ne: true } } }).exec();
    for (const doc of subs) {
      const s = doc.toJSON();
      const chaveTop = chaveTopicoPorId.get(s.topico_id);
      if (chaveTop) setSubtopicos.add(`${chaveTop}::${normalizarNome(s.name)}`);
    }
  } catch (e) {
    console.warn('[ListaPadraoModal] Não foi possível carregar subtópicos existentes:', e);
  }

  return {
    disciplinas: new Set(disciplinas.map(d => d.normName)),
    topicos: setTopicos,
    subtopicos: setSubtopicos,
  };
}

export function ListaPadraoConteudoModal({ isOpen, onClose, userId, onSuccess }: ListaPadraoConteudoModalProps) {
  const toast = useToast();

  // Estados do modal
  const [taxonomia, setTaxonomia] = useState<TaxonomiaDisciplina[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [existente, setExistente] = useState<Existente>(EXISTENTE_VAZIO);

  // Seleção da usuária
  const [materiasSelecionadas, setMateriasSelecionadas] = useState<Set<string>>(new Set()); // chaveMateria
  const [topicosSelecionados, setTopicosSelecionados] = useState<Set<string>>(new Set()); // chaveTopico
  const [areasExpandidas, setAreasExpandidas] = useState<Set<string>>(new Set());
  const [materiasExpandidas, setMateriasExpandidas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');

  // Estados de UI
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Carregar taxonomia e conteúdo existente ao abrir
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;

    const carregar = async () => {
      setCarregando(true);
      setErrorMessage('');
      try {
        const tax = getTaxonomia();
        if (cancelado) return;
        setTaxonomia(tax);
        if (tax.length > 0) setAreasExpandidas(new Set([tax[0].disciplina]));

        const ex = await carregarExistente(userId);
        if (!cancelado) setExistente(ex);
      } catch (e) {
        console.error('[ListaPadraoModal] Erro ao carregar:', e);
        if (!cancelado) setErrorMessage('Falha ao carregar lista padrão.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    };

    carregar();
    return () => { cancelado = true; };
  }, [isOpen, userId]);

  // Reset ao fechar
  useEffect(() => {
    if (!isOpen) {
      setMateriasSelecionadas(new Set());
      setTopicosSelecionados(new Set());
      setAreasExpandidas(new Set());
      setMateriasExpandidas(new Set());
      setBusca('');
      setIsSaving(false);
      setErrorMessage('');
    }
  }, [isOpen]);

  // ------------------------------------------------------------
  // O que já existe (depende do jeito que cada área vira conteúdo)
  // ------------------------------------------------------------

  /** A matéria já existe? (Odontologia: como fichário. Demais: como tópico dentro do fichário da área.) */
  const materiaExiste = useCallback((area: TaxonomiaDisciplina, materia: TaxonomiaMateria) => {
    const nm = normalizarNome(materia.nome);
    if (materiaViraFichario(area)) return existente.disciplinas.has(nm);
    return existente.topicos.has(`${normalizarNome(area.disciplina)}::${nm}`);
  }, [existente]);

  /** O tópico já existe? (Odontologia: como tópico. Demais: como subtópico.) */
  const topicoExiste = useCallback((area: TaxonomiaDisciplina, materia: TaxonomiaMateria, topico: TaxonomiaTopico) => {
    const nm = normalizarNome(materia.nome);
    const nt = normalizarNome(topico.nome);
    if (materiaViraFichario(area)) return existente.topicos.has(`${nm}::${nt}`);
    return existente.subtopicos.has(`${normalizarNome(area.disciplina)}::${nm}::${nt}`);
  }, [existente]);

  const topicosNovosDa = useCallback((area: TaxonomiaDisciplina, materia: TaxonomiaMateria) =>
    materia.topicos.filter(t => !topicoExiste(area, materia, t)),
  [topicoExiste]);

  // ------------------------------------------------------------
  // Seleção
  // ------------------------------------------------------------

  // Toggle área: marca/desmarca todas as matérias da área que ainda não existem (com seus tópicos)
  const toggleArea = useCallback((area: TaxonomiaDisciplina) => {
    const materiasNovas = area.materias.filter(m => !materiaExiste(area, m));
    if (materiasNovas.length === 0) return;

    const todasMarcadas = materiasNovas.every(m => materiasSelecionadas.has(chaveMateria(area, m)));

    setMateriasSelecionadas(prev => {
      const next = new Set(prev);
      for (const m of materiasNovas) {
        if (todasMarcadas) next.delete(chaveMateria(area, m));
        else next.add(chaveMateria(area, m));
      }
      return next;
    });

    setTopicosSelecionados(prev => {
      const next = new Set(prev);
      for (const m of materiasNovas) {
        for (const t of m.topicos) {
          const chave = chaveTopico(area, m, t);
          if (todasMarcadas) next.delete(chave);
          else if (!topicoExiste(area, m, t)) next.add(chave);
        }
      }
      return next;
    });
  }, [materiaExiste, topicoExiste, materiasSelecionadas]);

  // Toggle matéria (só matérias que ainda não existem)
  const toggleMateria = useCallback((area: TaxonomiaDisciplina, materia: TaxonomiaMateria) => {
    if (materiaExiste(area, materia)) return;
    const mk = chaveMateria(area, materia);
    const jaSelecionada = materiasSelecionadas.has(mk);

    setMateriasSelecionadas(prev => {
      const next = new Set(prev);
      if (jaSelecionada) next.delete(mk);
      else next.add(mk);
      return next;
    });

    setTopicosSelecionados(prev => {
      const next = new Set(prev);
      for (const t of materia.topicos) {
        const chave = chaveTopico(area, materia, t);
        if (jaSelecionada) next.delete(chave);
        else if (!topicoExiste(area, materia, t)) next.add(chave);
      }
      return next;
    });
  }, [materiaExiste, topicoExiste, materiasSelecionadas]);

  // Toggle tópico (funciona também dentro de matéria que já existe, para adicionar só o que falta)
  const toggleTopico = useCallback((area: TaxonomiaDisciplina, materia: TaxonomiaMateria, topico: TaxonomiaTopico) => {
    if (topicoExiste(area, materia, topico)) return;
    const chave = chaveTopico(area, materia, topico);
    const marcar = !topicosSelecionados.has(chave);

    setTopicosSelecionados(prev => {
      const next = new Set(prev);
      if (marcar) next.add(chave);
      else next.delete(chave);
      return next;
    });

    if (marcar) {
      setMateriasSelecionadas(prev => {
        const next = new Set(prev);
        next.add(chaveMateria(area, materia));
        return next;
      });
    }
  }, [topicoExiste, topicosSelecionados]);

  const toggleAreaExpandida = useCallback((areaNome: string) => {
    setAreasExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(areaNome)) next.delete(areaNome);
      else next.add(areaNome);
      return next;
    });
  }, []);

  const toggleMateriaExpandida = useCallback((mk: string) => {
    setMateriasExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(mk)) next.delete(mk);
      else next.add(mk);
      return next;
    });
  }, []);

  // Filtro de busca
  const taxonomiaFiltrada = useMemo(() => {
    if (!busca.trim()) return taxonomia;
    const termo = normalizarNome(busca);
    return taxonomia
      .map(area => ({
        ...area,
        materias: area.materias.filter(m =>
          normalizarNome(m.nome).includes(termo) ||
          m.topicos.some(t => normalizarNome(t.nome).includes(termo))
        ),
      }))
      .filter(area => area.materias.length > 0);
  }, [taxonomia, busca]);

  // ------------------------------------------------------------
  // Plano do que será criado (fonte única para contadores e criação)
  // ------------------------------------------------------------
  const plano = useMemo(() => {
    const disciplinas: string[] = [];
    const topicos: Array<{ disciplina: string; nome: string }> = [];
    const subtopicos: Array<{ disciplina: string; topico: string; nome: string }> = [];
    let fichariosNovos = 0;
    let topicosNovos = 0;
    let subtopicosNovos = 0;

    const discVistas = new Set<string>();
    const addDisciplina = (nome: string) => {
      const norm = normalizarNome(nome);
      if (discVistas.has(norm)) return;
      discVistas.add(norm);
      disciplinas.push(nome);
      if (!existente.disciplinas.has(norm)) fichariosNovos++;
    };

    for (const area of taxonomia) {
      const porMateria = materiaViraFichario(area);
      for (const materia of area.materias) {
        if (!materiasSelecionadas.has(chaveMateria(area, materia))) continue;
        const topicosMarcados = materia.topicos.filter(t =>
          topicosSelecionados.has(chaveTopico(area, materia, t)) && !topicoExiste(area, materia, t)
        );
        const materiaNova = !materiaExiste(area, materia);
        if (!materiaNova && topicosMarcados.length === 0) continue;

        if (porMateria) {
          // Odontologia: matéria = fichário, tópico = tópico
          addDisciplina(materia.nome);
          for (const t of topicosMarcados) {
            topicos.push({ disciplina: materia.nome, nome: t.nome });
            topicosNovos++;
          }
        } else {
          // Demais: área = fichário, matéria = tópico, tópico = subtópico
          addDisciplina(area.disciplina);
          topicos.push({ disciplina: area.disciplina, nome: materia.nome });
          if (materiaNova) topicosNovos++;
          for (const t of topicosMarcados) {
            subtopicos.push({ disciplina: area.disciplina, topico: materia.nome, nome: t.nome });
            subtopicosNovos++;
          }
        }
      }
    }

    return { disciplinas, topicos, subtopicos, fichariosNovos, topicosNovos, subtopicosNovos };
  }, [taxonomia, materiasSelecionadas, topicosSelecionados, existente, materiaExiste, topicoExiste]);

  const nadaNovo = plano.fichariosNovos === 0 && plano.topicosNovos === 0 && plano.subtopicosNovos === 0;

  const resumo = (f: number, t: number, s: number) => {
    const partes: string[] = [];
    if (f > 0) partes.push(`${f} fichário${f !== 1 ? 's' : ''}`);
    if (t > 0) partes.push(`${t} tópico${t !== 1 ? 's' : ''}`);
    if (s > 0) partes.push(`${s} subtópico${s !== 1 ? 's' : ''}`);
    if (partes.length <= 1) return partes.join('');
    return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
  };

  // Handler do botão Adicionar
  const handleAdicionar = useCallback(async () => {
    if (nadaNovo) {
      toast.info('Tudo o que você marcou já existe nos seus conteúdos.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      // 1. Fichários e tópicos (o serviço ignora o que já existe)
      const resultado = await criarConteudoSelecionado(userId, {
        disciplinas: plano.disciplinas,
        topicos: plano.topicos,
      });

      // 2. Subtópicos (só para as áreas em que a área inteira é um fichário)
      const subsPorTopico = new Map<string, { topicoId: string; nomes: string[] }>();
      for (const s of plano.subtopicos) {
        const discId = resultado.disciplinas.get(normalizarNome(s.disciplina));
        const topicoId = discId ? resultado.topicos.get(`${discId}::${normalizarNome(s.topico)}`) : undefined;
        if (!topicoId) {
          console.warn(`[ListaPadraoModal] Tópico "${s.topico}" não encontrado em "${s.disciplina}", subtópico "${s.nome}" pulado.`);
          continue;
        }
        if (!subsPorTopico.has(topicoId)) subsPorTopico.set(topicoId, { topicoId, nomes: [] });
        subsPorTopico.get(topicoId)!.nomes.push(s.nome);
      }

      let subsCriados = 0;
      for (const { topicoId, nomes } of subsPorTopico.values()) {
        const jaTem = new Set((await listarSubtopicos(topicoId, userId)).map(s => normalizarNome(s.name)));
        const novos = nomes.filter(n => !jaTem.has(normalizarNome(n)));
        if (novos.length === 0) continue;
        const criados = await criarSubtopicos(topicoId, userId, novos);
        subsCriados += criados.length;
      }

      const f = resultado.criadas?.disciplinas ?? 0;
      const t = resultado.criadas?.topicos ?? 0;

      if (f === 0 && t === 0 && subsCriados === 0) {
        toast.info('Nada novo para adicionar: isso já existe nos seus conteúdos.');
      } else {
        toast.success(`Adicionado: ${resumo(f, t, subsCriados)}`);
      }

      onSuccess(); // recarregar a lista
      onClose();
    } catch (e: any) {
      console.error('[ListaPadraoModal] Erro ao adicionar:', e);
      setErrorMessage(e?.message || 'Erro ao adicionar da lista padrão.');
    } finally {
      setIsSaving(false);
    }
  }, [nadaNovo, plano, userId, toast, onSuccess, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-hidden shadow-elevated flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Adicionar da lista padrão</h3>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-foreground/50 hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/20 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {/* Loading */}
        {carregando && (
          <div className="flex-1 flex items-center justify-center py-12 min-h-0">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-foreground/60">Carregando lista padrão...</span>
          </div>
        )}

        {/* Content */}
        {!carregando && (
          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <input
                type="text"
                placeholder="Buscar matéria ou tópico..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-10 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
              />
            </div>

            {/* Lista de áreas */}
            <div className="space-y-3 flex-1 min-h-0">
              {taxonomiaFiltrada.map(area => (
                <AreaSection
                  key={area.disciplina}
                  area={area}
                  expandida={areasExpandidas.has(area.disciplina)}
                  materiaExiste={materiaExiste}
                  topicoExiste={topicoExiste}
                  topicosNovosDa={topicosNovosDa}
                  materiasSelecionadas={materiasSelecionadas}
                  topicosSelecionados={topicosSelecionados}
                  materiasExpandidas={materiasExpandidas}
                  onToggleExpand={toggleAreaExpandida}
                  onToggleArea={toggleArea}
                  onToggleMateria={toggleMateria}
                  onToggleTopico={toggleTopico}
                  onToggleMateriaExpand={toggleMateriaExpandida}
                />
              ))}
              {taxonomiaFiltrada.length === 0 && (
                <div className="text-center py-8 text-foreground/40">
                  Nenhuma matéria ou tópico encontrado para "{busca}".
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 border-t border-border pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-sm text-foreground/60">
            {!nadaNovo ? (
              <span className="font-medium text-foreground">
                {resumo(plano.fichariosNovos, plano.topicosNovos, plano.subtopicosNovos)} novo{plano.fichariosNovos + plano.topicosNovos + plano.subtopicosNovos !== 1 ? 's' : ''}
              </span>
            ) : (
              'Selecione pelo menos uma matéria ou tópico'
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdicionar}
              disabled={isSaving || nadaNovo}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adicionando...
                </>
              ) : (
                'Adicionar'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTES INTERNOS
// ============================================================

interface AreaSectionProps {
  area: TaxonomiaDisciplina;
  expandida: boolean;
  materiaExiste: (area: TaxonomiaDisciplina, materia: TaxonomiaMateria) => boolean;
  topicoExiste: (area: TaxonomiaDisciplina, materia: TaxonomiaMateria, topico: TaxonomiaTopico) => boolean;
  topicosNovosDa: (area: TaxonomiaDisciplina, materia: TaxonomiaMateria) => TaxonomiaTopico[];
  materiasSelecionadas: Set<string>;
  topicosSelecionados: Set<string>;
  materiasExpandidas: Set<string>;
  onToggleExpand: (areaNome: string) => void;
  onToggleArea: (area: TaxonomiaDisciplina) => void;
  onToggleMateria: (area: TaxonomiaDisciplina, materia: TaxonomiaMateria) => void;
  onToggleTopico: (area: TaxonomiaDisciplina, materia: TaxonomiaMateria, topico: TaxonomiaTopico) => void;
  onToggleMateriaExpand: (chave: string) => void;
}

function AreaSection({
  area,
  expandida,
  materiaExiste,
  topicoExiste,
  topicosNovosDa,
  materiasSelecionadas,
  topicosSelecionados,
  materiasExpandidas,
  onToggleExpand,
  onToggleArea,
  onToggleMateria,
  onToggleTopico,
  onToggleMateriaExpand,
}: AreaSectionProps) {
  const porMateria = materiaViraFichario(area);
  const materiasNovas = area.materias.filter(m => !materiaExiste(area, m));
  const totalExistentes = area.materias.length - materiasNovas.length;
  const totalmenteSelecionada =
    materiasNovas.length > 0 && materiasNovas.every(m => materiasSelecionadas.has(chaveMateria(area, m)));

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      {/* Cabeçalho da área */}
      <div className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface/50 transition-colors">
        <button
          type="button"
          onClick={() => onToggleExpand(area.disciplina)}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-foreground/50 transition-transform ${expandida ? 'rotate-90' : ''}`}
          />
          <span className="flex-1">
            <span className="font-medium text-foreground">{area.disciplina}</span>
            <span className="block text-xs text-foreground/50">
              {porMateria
                ? 'Cada matéria vira um fichário'
                : `Vira o fichário "${area.disciplina}", com as matérias como tópicos`}
              {totalExistentes > 0 && ` · ${totalExistentes} de ${area.materias.length} já nos seus conteúdos`}
            </span>
          </span>
        </button>
        <CheckboxIndeterminado
          marcado={totalmenteSelecionada}
          indeterminado={false}
          desabilitado={materiasNovas.length === 0}
          onClick={() => onToggleArea(area)}
        />
      </div>

      {/* Conteúdo da área */}
      {expandida && (
        <div className="px-4 pb-3 border-t border-border/50">
          <div className="space-y-2 pt-3">
            {area.materias.map(materia => {
              const mk = chaveMateria(area, materia);
              const topicosNovos = topicosNovosDa(area, materia);
              const marcadosNovos = topicosNovos.filter(t => topicosSelecionados.has(chaveTopico(area, materia, t)));
              return (
                <MateriaRow
                  key={mk}
                  area={area}
                  materia={materia}
                  expandida={materiasExpandidas.has(mk)}
                  selecionada={materiasSelecionadas.has(mk)}
                  parcialmenteSelecionada={
                    materiasSelecionadas.has(mk) && marcadosNovos.length > 0 && marcadosNovos.length < topicosNovos.length
                  }
                  jaExiste={materiaExiste(area, materia)}
                  topicosNovos={topicosNovos}
                  topicoExiste={topicoExiste}
                  topicosSelecionados={topicosSelecionados}
                  onToggleExpand={() => onToggleMateriaExpand(mk)}
                  onToggleMateria={() => onToggleMateria(area, materia)}
                  onToggleTopico={(t) => onToggleTopico(area, materia, t)}
                  rotuloTopicos={porMateria ? 'tópicos' : 'subtópicos'}
                />
              );
            })}
            {materiasNovas.length === 0 && (
              <div className="text-sm text-foreground/40 py-2">
                Todas as matérias desta área já existem nos seus conteúdos. Abra uma matéria para adicionar o que falta.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface MateriaRowProps {
  area: TaxonomiaDisciplina;
  materia: TaxonomiaMateria;
  expandida: boolean;
  selecionada: boolean;
  parcialmenteSelecionada: boolean;
  jaExiste: boolean;
  topicosNovos: TaxonomiaTopico[];
  topicoExiste: (area: TaxonomiaDisciplina, materia: TaxonomiaMateria, topico: TaxonomiaTopico) => boolean;
  topicosSelecionados: Set<string>;
  onToggleExpand: () => void;
  onToggleMateria: () => void;
  onToggleTopico: (topico: TaxonomiaTopico) => void;
  rotuloTopicos: string;
}

function MateriaRow({
  area,
  materia,
  expandida,
  selecionada,
  parcialmenteSelecionada,
  jaExiste,
  topicosNovos,
  topicoExiste,
  topicosSelecionados,
  onToggleExpand,
  onToggleMateria,
  onToggleTopico,
  rotuloTopicos,
}: MateriaRowProps) {
  const temTopicos = topicosNovos.length > 0;

  return (
    <div className="rounded-lg border border-border/50 bg-surface/50 overflow-hidden">
      {/* Linha da matéria */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        {temTopicos ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1 text-foreground/50 hover:text-foreground transition-colors"
            aria-label={expandida ? 'Colapsar' : 'Expandir'}
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${expandida ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <div className="w-6" />
        )}

        <CheckboxIndeterminado
          marcado={selecionada && !jaExiste}
          indeterminado={parcialmenteSelecionada && !jaExiste}
          desabilitado={jaExiste}
          onClick={() => !jaExiste && onToggleMateria()}
        />
        <span className={`font-medium flex-1 ${jaExiste ? 'text-foreground/60' : 'text-foreground'}`}>
          {materia.nome}
          {jaExiste && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-surface border border-border text-foreground/50">
              {temTopicos ? `você já tem · dá para adicionar ${rotuloTopicos}` : 'você já tem tudo'}
            </span>
          )}
        </span>
      </div>

      {/* Tópicos da matéria */}
      {expandida && temTopicos && (
        <div className="px-3 pb-2.5 pl-10 border-t border-border/50">
          <div className="space-y-1.5 pt-2">
            {topicosNovos.map(topico => (
              <TopicoRow
                key={topico.nome}
                topico={topico}
                selecionado={topicosSelecionados.has(chaveTopico(area, materia, topico))}
                jaExiste={topicoExiste(area, materia, topico)}
                onToggle={() => onToggleTopico(topico)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TopicoRowProps {
  topico: TaxonomiaTopico;
  selecionado: boolean;
  jaExiste: boolean;
  onToggle: () => void;
}

function TopicoRow({ topico, selecionado, jaExiste, onToggle }: TopicoRowProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface transition-colors">
      <CheckboxIndeterminado
        marcado={selecionado}
        indeterminado={false}
        desabilitado={jaExiste}
        onClick={() => !jaExiste && onToggle()}
      />
      <span className={`flex-1 text-sm ${jaExiste ? 'text-foreground/40 line-through' : 'text-foreground/70'}`}>
        {topico.nome}
        {jaExiste && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-surface border border-border text-foreground/50">já existe</span>}
      </span>
    </div>
  );
}

interface CheckboxIndeterminadoProps {
  marcado: boolean;
  indeterminado: boolean;
  desabilitado: boolean;
  onClick: () => void;
}

function CheckboxIndeterminado({ marcado, indeterminado, desabilitado, onClick }: CheckboxIndeterminadoProps) {
  if (indeterminado) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={desabilitado}
        className={`rounded border-2 flex items-center justify-center transition-colors ${
          desabilitado
            ? 'border-border bg-surface cursor-not-allowed opacity-50'
            : 'border-primary bg-primary cursor-pointer'
        }`}
        style={{ width: 18, height: 18 }}
      >
        <MinusSquare className="h-3.5 w-3.5 text-primary-foreground" />
      </button>
    );
  }
  if (marcado) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={desabilitado}
        className={`rounded border-2 flex items-center justify-center transition-colors ${
          desabilitado
            ? 'border-border bg-surface cursor-not-allowed opacity-50'
            : 'border-primary bg-primary cursor-pointer'
        }`}
        style={{ width: 18, height: 18 }}
      >
        <CheckSquare className="h-3.5 w-3.5 text-primary-foreground" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      className={`rounded border-2 flex items-center justify-center transition-colors ${
        desabilitado
          ? 'border-border bg-transparent cursor-not-allowed opacity-50'
          : 'border-border bg-transparent hover:border-primary cursor-pointer'
      }`}
      style={{ width: 18, height: 18 }}
    >
      <Square className="h-3.5 w-3.5 text-transparent" />
    </button>
  );
}