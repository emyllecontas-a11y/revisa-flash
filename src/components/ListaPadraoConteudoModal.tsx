// src/components/ListaPadraoConteudoModal.tsx
// Modal para adicionar disciplinas e tópicos da lista padrão (taxonomia)

import { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronRight, ChevronDown, Search, CheckSquare, Square, MinusSquare, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { getTaxonomia } from '@/services/taxonomiaService';
import {
  normalizarNome,
  carregarConteudoExistente,
  criarConteudoSelecionado,
  montarEntradasDaTaxonomia,
  type SelecaoTaxonomia,
  type TaxonomiaDisciplina,
  type TaxonomiaMateria,
} from '@/services/conteudoSugestaoService';

interface ListaPadraoConteudoModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSuccess: () => void; // callback para recarregar a lista (loadData)
}

export function ListaPadraoConteudoModal({ isOpen, onClose, userId, onSuccess }: ListaPadraoConteudoModalProps) {
  const toast = useToast();

  // Estados do modal
  const [taxonomia, setTaxonomia] = useState<TaxonomiaDisciplina[]>([]);
  const [carregandoTaxonomia, setCarregandoTaxonomia] = useState(true);
  const [conteudoExistente, setConteudoExistente] = useState<{ disciplinas: string[]; topicos: Array<{ disciplina: string; nome: string }> }>({ disciplinas: [], topicos: [] });
  const [carregandoExistente, setCarregandoExistente] = useState(true);

  // Seleção da usuária
  const [materiasSelecionadas, setMateriasSelecionadas] = useState<Set<string>>(new Set()); // chave: normMateria
  const [topicosSelecionados, setTopicosSelecionados] = useState<Set<string>>(new Set()); // chave: `${normMateria}::${normTopico}`
  const [areasExpandidas, setAreasExpandidas] = useState<Set<string>>(new Set());
  const [materiasExpandidas, setMateriasExpandidas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');

  // Estados de UI
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Carregar taxonomia e conteúdo existente ao abrir
  useEffect(() => {
    if (!isOpen) return;

    const carregar = async () => {
      setCarregandoTaxonomia(true);
      setCarregandoExistente(true);
      setErrorMessage('');

      try {
        // Taxonomia
        const tax = getTaxonomia();
        setTaxonomia(tax);

        // Expandir primeira área por padrão
        if (tax.length > 0) {
          setAreasExpandidas(new Set([tax[0].disciplina]));
        }

        // Conteúdo existente
        const existente = await carregarConteudoExistente(userId);
        const disciplinasExistentes = new Set(existente.disciplinas.map(d => d.normName));
        const topicosExistentes = new Set(
          existente.topicos.map(t => `${t.discipline_id}::${t.normName}`)
        );
        // Para o modal, só precisamos saber o nome normalizado da disciplina/tópico
        // Vamos mapear discipline_id -> normName da disciplina
        const disciplinaIdParaNorm = new Map<string, string>();
        for (const d of existente.disciplinas) {
          disciplinaIdParaNorm.set(d.id, d.normName);
        }
        const topicosExistentesPorNome = new Set<string>();
        for (const t of existente.topicos) {
          const normDisc = disciplinaIdParaNorm.get(t.discipline_id);
          if (normDisc) {
            topicosExistentesPorNome.add(`${normDisc}::${t.normName}`);
          }
        }
        setConteudoExistente({
          disciplinas: Array.from(disciplinasExistentes),
          topicos: Array.from(topicosExistentesPorNome).map(chave => {
            const [normDisc, normTopico] = chave.split('::');
            return { disciplina: normDisc, nome: normTopico };
          }),
        });
      } catch (e) {
        console.error('[ListaPadraoModal] Erro ao carregar:', e);
        setErrorMessage('Falha ao carregar lista padrão.');
      } finally {
        setCarregandoTaxonomia(false);
        setCarregandoExistente(false);
      }
    };

    carregar();
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

  // Verificar se uma disciplina já existe
  const disciplinaExiste = useCallback((normMateria: string) => {
    return conteudoExistente.disciplinas.includes(normMateria);
  }, [conteudoExistente.disciplinas]);

  // Verificar se um tópico já existe
  const topicoExiste = useCallback((normMateria: string, normTopico: string) => {
    return conteudoExistente.topicos.some(t => t.disciplina === normMateria && t.nome === normTopico);
  }, [conteudoExistente.topicos]);

  // Toggle área: marca/desmarca todas as matérias da área que ainda não existem (com seus tópicos)
  const toggleArea = useCallback((area: TaxonomiaDisciplina) => {
    const materiasValidas = area.materias.filter(m => !disciplinaExiste(normalizarNome(m.nome)));
    if (materiasValidas.length === 0) return;

    const todasMarcadas = materiasValidas.every(m => materiasSelecionadas.has(normalizarNome(m.nome)));

    setMateriasSelecionadas(prev => {
      const next = new Set(prev);
      for (const m of materiasValidas) {
        const normMateria = normalizarNome(m.nome);
        if (todasMarcadas) next.delete(normMateria);
        else next.add(normMateria);
      }
      return next;
    });

    setTopicosSelecionados(prev => {
      const next = new Set(prev);
      for (const m of materiasValidas) {
        const normMateria = normalizarNome(m.nome);
        for (const t of m.topicos) {
          const normTopico = normalizarNome(t.nome);
          const chave = `${normMateria}::${normTopico}`;
          if (todasMarcadas) next.delete(chave);
          else if (!topicoExiste(normMateria, normTopico)) next.add(chave);
        }
      }
      return next;
    });
  }, [disciplinaExiste, topicoExiste, materiasSelecionadas]);

  // Toggle matéria
  const toggleMateria = useCallback((areaNome: string, materia: TaxonomiaMateria) => {
    const normMateria = normalizarNome(materia.nome);
    if (disciplinaExiste(normMateria)) return; // já existe, não pode mexer

    setMateriasSelecionadas(prev => {
      const next = new Set(prev);
      const jaSelecionada = next.has(normMateria);
      if (jaSelecionada) {
        next.delete(normMateria);
        // Desmarcar todos os tópicos desta matéria
        setTopicosSelecionados(prevTopicos => {
          const nextTopicos = new Set(prevTopicos);
          for (const topico of materia.topicos) {
            const normTopico = normalizarNome(topico.nome);
            const chave = `${normMateria}::${normTopico}`;
            nextTopicos.delete(chave);
          }
          return nextTopicos;
        });
      } else {
        next.add(normMateria);
        // Marcar todos os tópicos desta matéria (que não existam)
        setTopicosSelecionados(prevTopicos => {
          const nextTopicos = new Set(prevTopicos);
          for (const topico of materia.topicos) {
            const normTopico = normalizarNome(topico.nome);
            if (!topicoExiste(normMateria, normTopico)) {
              const chave = `${normMateria}::${normTopico}`;
              nextTopicos.add(chave);
            }
          }
          return nextTopicos;
        });
      }
      return next;
    });
  }, [disciplinaExiste, topicoExiste]);

  // Toggle tópico
  const toggleTopico = useCallback((materia: TaxonomiaMateria, topico: TaxonomiaMateria['topicos'][0]) => {
    const normMateria = normalizarNome(materia.nome);
    const normTopico = normalizarNome(topico.nome);
    if (topicoExiste(normMateria, normTopico)) return; // já existe

    const chave = `${normMateria}::${normTopico}`;
    setTopicosSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(chave)) {
        next.delete(chave);
      } else {
        next.add(chave);
        // Marcar a matéria também
        setMateriasSelecionadas(prevMat => {
          const nextMat = new Set(prevMat);
          nextMat.add(normMateria);
          return nextMat;
        });
      }
      return next;
    });
  }, [topicoExiste]);

  // Toggle expansão de área
  const toggleAreaExpandida = useCallback((areaNome: string) => {
    setAreasExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(areaNome)) next.delete(areaNome);
      else next.add(areaNome);
      return next;
    });
  }, []);

  // Toggle expansão de matéria
  const toggleMateriaExpandida = useCallback((normMateria: string) => {
    setMateriasExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(normMateria)) next.delete(normMateria);
      else next.add(normMateria);
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

  // Contadores para o rodapé
  const contadores = useMemo(() => {
    let disciplinasNovas = 0;
    let topicosNovos = 0;

    for (const normMateria of materiasSelecionadas) {
      if (!disciplinaExiste(normMateria)) {
        disciplinasNovas++;
      }
    }

    for (const chave of topicosSelecionados) {
      const [normMateria, normTopico] = chave.split('::');
      if (!topicoExiste(normMateria, normTopico)) {
        topicosNovos++;
      }
    }

    return { disciplinasNovas, topicosNovos };
  }, [materiasSelecionadas, topicosSelecionados, disciplinaExiste, topicoExiste]);

  // Verificar se área está totalmente selecionada (todas as matérias não-existentes marcadas)
  const areaTotalmenteSelecionada = useCallback((area: TaxonomiaDisciplina) => {
    const materiasValidas = area.materias.filter(m => !disciplinaExiste(normalizarNome(m.nome)));
    if (materiasValidas.length === 0) return false;
    return materiasValidas.every(m => materiasSelecionadas.has(normalizarNome(m.nome)));
  }, [materiasSelecionadas, disciplinaExiste]);

  // Verificar se matéria está totalmente selecionada (todos os tópicos não-existentes marcados)
  const materiaTotalmenteSelecionada = useCallback((materia: TaxonomiaMateria) => {
    const topicosValidos = materia.topicos.filter(t => !topicoExiste(normalizarNome(materia.nome), normalizarNome(t.nome)));
    if (topicosValidos.length === 0) return materiasSelecionadas.has(normalizarNome(materia.nome));
    return topicosValidos.every(t => topicosSelecionados.has(`${normalizarNome(materia.nome)}::${normalizarNome(t.nome)}`));
  }, [materiasSelecionadas, topicosSelecionados, topicoExiste]);

  // Verificar se matéria tem seleção parcial (alguns tópicos marcados)
  const materiaParcialmenteSelecionada = useCallback((materia: TaxonomiaMateria) => {
    const normMateria = normalizarNome(materia.nome);
    if (!materiasSelecionadas.has(normMateria)) return false;
    const topicosValidos = materia.topicos.filter(t => !topicoExiste(normMateria, normalizarNome(t.nome)));
    if (topicosValidos.length === 0) return false;
    const marcados = topicosValidos.filter(t => topicosSelecionados.has(`${normMateria}::${normalizarNome(t.nome)}`));
    return marcados.length > 0 && marcados.length < topicosValidos.length;
  }, [materiasSelecionadas, topicosSelecionados, topicoExiste]);

  // Construir seleção para montarEntradasDaTaxonomia
  const construirSelecao = useCallback((): SelecaoTaxonomia => {
    const areas: string[] = [];
    const materias: Array<{ area: string; nome: string }> = [];
    const topicos: Array<{ area: string; materia: string; nome: string }> = [];

    for (const area of taxonomia) {
      for (const materia of area.materias) {
        const normMateria = normalizarNome(materia.nome);
        if (materiasSelecionadas.has(normMateria)) {
          materias.push({ area: area.disciplina, nome: materia.nome });
          for (const topico of materia.topicos) {
            const normTopico = normalizarNome(topico.nome);
            const chave = `${normMateria}::${normTopico}`;
            if (topicosSelecionados.has(chave)) {
              topicos.push({ area: area.disciplina, materia: materia.nome, nome: topico.nome });
            }
          }
        }
      }
    }

    return { areas, materias, topicos };
  }, [taxonomia, materiasSelecionadas, topicosSelecionados]);

  // Handler do botão Adicionar
  const handleAdicionar = useCallback(async () => {
    if (contadores.disciplinasNovas === 0 && contadores.topicosNovos === 0) {
      toast.info('Tudo o que você marcou já existe nos seus conteúdos.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const selecao = construirSelecao();
      const entradas = montarEntradasDaTaxonomia(selecao, taxonomia);

      // Toda disciplina que aparece na seleção precisa ir na lista de disciplinas,
      // inclusive as que têm tópicos marcados. Antes só iam as matérias SEM tópicos,
      // e por isso a disciplina não era criada e os tópicos eram pulados
      // ("Disciplina ... não encontrada no mapa, pulando tópicos").
      // As que já existem são ignoradas pelo serviço (idempotente).
      const disciplinas: string[] = [];
      const vistas = new Set<string>();
      for (const e of entradas) {
        const norm = normalizarNome(e.disciplina);
        if (!vistas.has(norm)) {
          vistas.add(norm);
          disciplinas.push(e.disciplina);
        }
      }

      const resultado = await criarConteudoSelecionado(userId, {
        disciplinas,
        topicos: entradas.filter(e => e.topico).map(e => ({ disciplina: e.disciplina, nome: e.topico! })),
      });

      const criadasDisc = resultado.criadas?.disciplinas ?? 0;
      const criadosTop = resultado.criadas?.topicos ?? 0;

      if (criadasDisc === 0 && criadosTop === 0) {
        toast.info('Nada novo para adicionar: essas disciplinas e tópicos já existem nos seus conteúdos.');
      } else {
        const partes: string[] = [];
        if (criadasDisc > 0) partes.push(`${criadasDisc} disciplina${criadasDisc !== 1 ? 's' : ''}`);
        if (criadosTop > 0) partes.push(`${criadosTop} tópico${criadosTop !== 1 ? 's' : ''}`);
        toast.success(`Adicionado: ${partes.join(' e ')}`);
      }

      onSuccess(); // recarregar a lista
      onClose();
    } catch (e: any) {
      console.error('[ListaPadraoModal] Erro ao adicionar:', e);
      setErrorMessage(e.message || 'Erro ao adicionar da lista padrão.');
    } finally {
      setIsSaving(false);
    }
  }, [contadores, taxonomia, userId, construirSelecao, toast, onSuccess, onClose]);

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

        {/* Loading taxonomia */}
        {carregandoTaxonomia && (
          <div className="flex-1 flex items-center justify-center py-12 min-h-0">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-foreground/60">Carregando lista padrão...</span>
          </div>
        )}

        {/* Content */}
        {!carregandoTaxonomia && (
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
                  totalmenteSelecionada={areaTotalmenteSelecionada(area)}
                  disciplinaExiste={disciplinaExiste}
                  topicoExiste={topicoExiste}
                  materiasSelecionadas={materiasSelecionadas}
                  topicosSelecionados={topicosSelecionados}
                  materiasExpandidas={materiasExpandidas}
                  onToggleExpand={toggleAreaExpandida}
                  onToggleArea={toggleArea}
                  onToggleMateria={toggleMateria}
                  onToggleTopico={toggleTopico}
                  onToggleMateriaExpand={toggleMateriaExpandida}
                  materiaTotalmenteSelecionada={materiaTotalmenteSelecionada}
                  materiaParcialmenteSelecionada={materiaParcialmenteSelecionada}
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
            {contadores.disciplinasNovas > 0 || contadores.topicosNovos > 0 ? (
              <>
                <span className="font-medium text-foreground">
                  {contadores.disciplinasNovas} disciplina{contadores.disciplinasNovas !== 1 ? 's' : ''}
                  {' '}e{' '}
                  {contadores.topicosNovos} tópico{contadores.topicosNovos !== 1 ? 's' : ''} novos
                </span>
              </>
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
              disabled={isSaving || contadores.disciplinasNovas === 0 && contadores.topicosNovos === 0}
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
  totalmenteSelecionada: boolean;
  disciplinaExiste: (norm: string) => boolean;
  topicoExiste: (normMateria: string, normTopico: string) => boolean;
  materiasSelecionadas: Set<string>;
  topicosSelecionados: Set<string>;
  materiasExpandidas: Set<string>;
  onToggleExpand: (areaNome: string) => void;
  onToggleArea: (area: TaxonomiaDisciplina) => void;
  onToggleMateria: (areaNome: string, materia: TaxonomiaMateria) => void;
  onToggleTopico: (materia: TaxonomiaMateria, topico: TaxonomiaMateria['topicos'][0]) => void;
  onToggleMateriaExpand: (normMateria: string) => void;
  materiaTotalmenteSelecionada: (materia: TaxonomiaMateria) => boolean;
  materiaParcialmenteSelecionada: (materia: TaxonomiaMateria) => boolean;
}

function AreaSection({
  area,
  expandida,
  totalmenteSelecionada,
  disciplinaExiste,
  topicoExiste,
  materiasSelecionadas,
  topicosSelecionados,
  materiasExpandidas,
  onToggleExpand,
  onToggleArea,
  onToggleMateria,
  onToggleTopico,
  onToggleMateriaExpand,
  materiaTotalmenteSelecionada,
  materiaParcialmenteSelecionada,
}: AreaSectionProps) {
  // Matérias que ainda não existem (são as únicas que a caixa da área marca)
  const materiasNovas = area.materias.filter(m => !disciplinaExiste(normalizarNome(m.nome)));
  const totalExistentes = area.materias.length - materiasNovas.length;

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      {/* Cabeçalho da área (sem botão dentro de botão) */}
      <div className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface/50 transition-colors">
        <button
          type="button"
          onClick={() => onToggleExpand(area.disciplina)}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <ChevronRight
            className={`h-4 w-4 text-foreground/50 transition-transform ${expandida ? 'rotate-90' : ''}`}
          />
          <span className="font-medium text-foreground flex-1">
            {area.disciplina}
            {totalExistentes > 0 && (
              <span className="ml-2 text-xs font-normal text-foreground/50">
                {totalExistentes} de {area.materias.length} já nos seus conteúdos
              </span>
            )}
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
            {area.materias.map(materia => (
              <MateriaRow
                key={materia.nome}
                materia={materia}
                expandida={materiasExpandidas.has(normalizarNome(materia.nome))}
                selecionada={materiasSelecionadas.has(normalizarNome(materia.nome))}
                totalmenteSelecionada={materiaTotalmenteSelecionada(materia)}
                parcialmenteSelecionada={materiaParcialmenteSelecionada(materia)}
                jaExiste={disciplinaExiste(normalizarNome(materia.nome))}
                topicoExiste={topicoExiste}
                materiasSelecionadas={materiasSelecionadas}
                topicosSelecionados={topicosSelecionados}
                onToggleExpand={onToggleMateriaExpand}
                onToggleMateria={onToggleMateria}
                onToggleTopico={onToggleTopico}
                areaNome={area.disciplina}
              />
            ))}
            {materiasNovas.length === 0 && (
              <div className="text-sm text-foreground/40 py-2">
                Todas as matérias desta área já existem nos seus conteúdos. Abra uma matéria para adicionar os tópicos que faltam.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface MateriaRowProps {
  materia: TaxonomiaMateria;
  expandida: boolean;
  selecionada: boolean;
  totalmenteSelecionada: boolean;
  parcialmenteSelecionada: boolean;
  jaExiste: boolean;
  topicoExiste: (normMateria: string, normTopico: string) => boolean;
  materiasSelecionadas: Set<string>;
  topicosSelecionados: Set<string>;
  onToggleExpand: (normMateria: string) => void;
  onToggleMateria: (areaNome: string, materia: TaxonomiaMateria) => void;
  onToggleTopico: (materia: TaxonomiaMateria, topico: TaxonomiaMateria['topicos'][0]) => void;
  areaNome: string;
}

function MateriaRow({
  materia,
  expandida,
  selecionada,
  totalmenteSelecionada,
  parcialmenteSelecionada,
  jaExiste,
  topicoExiste,
  materiasSelecionadas,
  topicosSelecionados,
  onToggleExpand,
  onToggleMateria,
  onToggleTopico,
  areaNome,
}: MateriaRowProps) {
  const normMateria = normalizarNome(materia.nome);
  const topicosValidos = materia.topicos.filter(t => !topicoExiste(normMateria, normalizarNome(t.nome)));
  const temTopicos = topicosValidos.length > 0;

  return (
    <div className="rounded-lg border border-border/50 bg-surface/50 overflow-hidden">
      {/* Linha da matéria */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        {temTopicos && (
          <button
            type="button"
            onClick={() => onToggleExpand(normMateria)}
            className="p-1 text-foreground/50 hover:text-foreground transition-colors"
            aria-label={expandida ? 'Colapsar' : 'Expandir'}
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${expandida ? 'rotate-90' : ''}`} />
          </button>
        )}
        {!temTopicos && <div className="w-6" />}

        <CheckboxIndeterminado
          marcado={selecionada}
          indeterminado={parcialmenteSelecionada}
          desabilitado={jaExiste}
          onClick={() => !jaExiste && onToggleMateria(areaNome, materia)}
        />
        <span className={`font-medium flex-1 ${jaExiste ? 'text-foreground/60' : 'text-foreground'}`}>
          {materia.nome}
          {jaExiste && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-surface border border-border text-foreground/50">
              {temTopicos ? 'você já tem · dá para adicionar tópicos' : 'você já tem tudo'}
            </span>
          )}
        </span>
      </div>

      {/* Tópicos da matéria */}
      {expandida && temTopicos && (
        <div className="px-3 pb-2.5 pl-10 border-t border-border/50">
          <div className="space-y-1.5 pt-2">
            {topicosValidos.map(topico => (
              <TopicoRow
                key={topico.nome}
                topico={topico}
                normMateria={normMateria}
                selecionado={topicosSelecionados.has(`${normMateria}::${normalizarNome(topico.nome)}`)}
                jaExiste={topicoExiste(normMateria, normalizarNome(topico.nome))}
                onToggle={() => onToggleTopico(materia, topico)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TopicoRowProps {
  topico: TaxonomiaMateria['topicos'][0];
  normMateria: string;
  selecionado: boolean;
  jaExiste: boolean;
  onToggle: () => void;
}

function TopicoRow({ topico, normMateria, selecionado, jaExiste, onToggle }: TopicoRowProps) {
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